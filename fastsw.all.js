/*!
 * fastsw.all.js — FastSW: service-worker web proxy (libcurl.js + Wisp transport)
 *
 * One file, three roles:
 *   1. Loaded with <script> in a page     -> exposes window.Fastsw (register / encode / go)
 *   2. Registered as a service worker     -> fetches via libcurl.js over Wisp, strips headers,
 *                                            rewrites HTML / JS / CSS, keeps a cookie jar
 *   3. Served to proxied pages as /fastsw/client.js -> the in-page runtime that defines
 *                                            fastsw.location / fastsw.top / fastsw.parent etc.
 *
 * Put this file at the site root (so the SW scope can be "/"), next to index.html.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  CONFIG
   * ------------------------------------------------------------------ */
  const CONFIG = {
    prefix: "/fastsw/service/",          // proxied URLs look like  /fastsw/service/<encodeURIComponent(url)>
    clientPath: "/fastsw/client.js",     // runtime injected into every proxied document
    wisp: "wss://zakaon.top/wisp/",      // your Wisp server (null = same host, /wisp/)
    // Self-host these two files for production (CDN paths may change between releases).
    libcurlJS: "https://cdn.jsdelivr.net/npm/libcurl.js/libcurl.js",
    libcurlWasm: "https://cdn.jsdelivr.net/npm/libcurl.js/libcurl.wasm",
    acornJS: "https://cdn.jsdelivr.net/npm/acorn@8/dist/acorn.js",   // real JS parser used for rewriting
    pageWebSocket: true,                 // inject libcurl.js into pages so WebSocket() goes through Wisp
  };

  /* ================================================================== *
   *  FastswCore — URL / HTML / CSS / JS rewriting.
   *  MUST stay self-contained: it is stringified and shipped to the page.
   * ================================================================== */
  function FastswCore(cfg) {
    const P = cfg.prefix;
    const ORIGIN = self.location.origin;

    const isProxied = (u) => u.startsWith(P) || u.startsWith(ORIGIN + P);
    const encode = (u) => {
      const i = u.indexOf("#");
      return P + encodeURIComponent(i < 0 ? u : u.slice(0, i)) + (i < 0 ? "" : u.slice(i));
    };
    const decode = (path) => {
      try { return decodeURIComponent(path.slice(P.length)); } catch (e) { return "about:blank"; }
    };
    const SKIP = /^(?:data:|blob:|about:|mailto:|tel:|sms:|#|javascript:)/i;

    const rewriteURL = (u, base) => {
      if (u == null) return u;
      u = String(u).trim();
      if (!u || SKIP.test(u) || isProxied(u)) return u;
      try {
        const a = new URL(u, base);
        if (a.protocol !== "http:" && a.protocol !== "https:") return u;
        return encode(a.href);
      } catch (e) { return u; }
    };
    const unrewrite = (u) => {
      if (typeof u !== "string" || !isProxied(u)) return u;
      try { const x = new URL(u, ORIGIN); return decode(x.pathname) + x.hash; } catch (e) { return u; }
    };

    /* ---------------------------- CSS ---------------------------- */
    const rewriteCSS = (css, base) =>
      String(css)
        .replace(/url\(\s*(["']?)([^)"']*?)\1\s*\)/gi, (m, q, u) => `url(${q}${rewriteURL(u, base)}${q})`)
        .replace(/@import\s+(["'])([^"']+)\1/gi, (m, q, u) => `@import ${q}${rewriteURL(u, base)}${q}`);

    const rewriteSrcset = (s, base) => {
      if (/^\s*data:/i.test(s)) return s;
      return s.replace(/(^|,)\s*([^\s,]+)(\s+[^,]*)?/g, (m, a, u, d) => `${a} ${rewriteURL(u, base)}${d || ""}`);
    };

    /* ---------------------------- JS ----------------------------- */
    const RE_START = /[(,=:\[!&|?{};]$/;
    const KW_BEFORE_REGEX = /(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)\s*$/;
    const IMPORT_STR = /(?:^|[^\w$.])(?:from|import)\s*$/;
    const PROP_RE = /(?<!\.)(\?\.|\.)(\s*)(location|top|parent)(?![\w$])/g;
    const EVAL_RE = /(?<![\w$.])eval\s*\(/g;
    const DYN_IMPORT_RE = /(?<![\w$.])import\s*\(/g;

    /* ---- AST rewriter (acorn): exact, scope-aware, position-based patching ---- */
    const ID_NAMES = new Set(["location", "top", "parent", "eval", "Function"]);
    const PROP_NAMES = new Set(["location", "top", "parent"]);
    const FNT = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
    const SKIPK = new Set(["type", "start", "end", "loc", "range"]);

    function patNames(p, out) {
      if (!p) return;
      switch (p.type) {
        case "Identifier": out.add(p.name); break;
        case "ObjectPattern": p.properties.forEach((x) => patNames(x.type === "RestElement" ? x.argument : x.value, out)); break;
        case "ArrayPattern": p.elements.forEach((e) => patNames(e, out)); break;
        case "RestElement": patNames(p.argument, out); break;
        case "AssignmentPattern": patNames(p.left, out); break;
      }
    }
    function varNames(node, out) {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "VariableDeclaration" && node.kind === "var") node.declarations.forEach((d) => patNames(d.id, out));
      if (FNT.has(node.type) || node.type === "ClassBody") return;
      for (const k in node) {
        if (SKIPK.has(k)) continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && varNames(c, out));
        else if (v && typeof v.type === "string") varNames(v, out);
      }
    }
    function lexNames(stmts, out) {
      for (let s of stmts) {
        if (!s) continue;
        if ((s.type === "ExportNamedDeclaration" || s.type === "ExportDefaultDeclaration") && s.declaration) s = s.declaration;
        if (s.type === "VariableDeclaration" && s.kind !== "var") s.declarations.forEach((d) => patNames(d.id, out));
        else if ((s.type === "FunctionDeclaration" || s.type === "ClassDeclaration") && s.id) out.add(s.id.name);
        else if (s.type === "ImportDeclaration") s.specifiers.forEach((x) => out.add(x.local.name));
      }
    }

    function parseJS(src) {
      const A = self.acorn;
      if (!A) return null;
      for (const sourceType of ["script", "module"]) {
        try {
          return A.parse(src, { ecmaVersion: "latest", sourceType, allowHashBang: true, allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true, allowImportExportEverywhere: true });
        } catch (e) {}
      }
      return null;
    }

    function rewriteJS(src, base) {
      if (!src) return src;
      src = String(src);
      const ast = parseJS(src);
      if (!ast) return rewriteJSLegacy(src, base);               // no parser / unparsable -> scanner fallback
      const edits = [];
      const edit = (s, e, t) => edits.push([s, e, t]);
      const baseJSON = JSON.stringify(base);
      const scopes = [];
      const shadowed = (n) => scopes.some((s) => s.has(n));
      const kids = (node, fn) => {
        for (const k in node) {
          if (SKIPK.has(k)) continue;
          const v = node[k];
          if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && fn(c, k));
          else if (v && typeof v.type === "string") fn(v, k);
        }
      };
      const withScope = (set, fn) => { scopes.push(set); fn(); scopes.pop(); };

      // patterns (declaration targets / destructuring): only expression parts + special keys are visited
      function pat(p) {
        if (!p) return;
        switch (p.type) {
          case "ObjectPattern":
            for (const x of p.properties) {
              if (x.type === "RestElement") { pat(x.argument); continue; }
              if (x.computed) walk(x.key, x, "key");
              else {
                const nm = x.key.type === "Identifier" ? x.key.name : x.key.type === "Literal" ? x.key.value : null;
                if (PROP_NAMES.has(nm)) edit(x.key.start, x.key.end, x.shorthand ? "fastsw$" + nm + ": " + nm : "fastsw$" + nm);
              }
              pat(x.value);
            }
            break;
          case "ArrayPattern": p.elements.forEach(pat); break;
          case "RestElement": pat(p.argument); break;
          case "AssignmentPattern": pat(p.left); walk(p.right, p, "right"); break;
          case "Identifier": break;
          default: walk(p, null, "");                              // MemberExpression targets etc.
        }
      }

      function walk(node, parent, key) {
        if (!node) return;
        switch (node.type) {
          case "Program": {
            const set = new Set(); varNames(node, set); lexNames(node.body, set);
            return withScope(set, () => node.body.forEach((c) => walk(c, node, "body")));
          }
          case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": {
            const set = new Set();
            node.params.forEach((p) => patNames(p, set));
            if (node.type === "FunctionExpression" && node.id) set.add(node.id.name);
            if (node.type !== "ArrowFunctionExpression") set.add("arguments");
            if (node.body.type === "BlockStatement") { varNames(node.body, set); lexNames(node.body.body, set); }
            return withScope(set, () => {
              node.params.forEach(pat);
              if (node.body.type === "BlockStatement") node.body.body.forEach((c) => walk(c, node.body, "body"));
              else walk(node.body, node, "body");
            });
          }
          case "BlockStatement": case "StaticBlock": {
            const set = new Set(); lexNames(node.body, set);
            return withScope(set, () => node.body.forEach((c) => walk(c, node, "body")));
          }
          case "SwitchStatement": {
            walk(node.discriminant, node, "discriminant");
            const set = new Set(); node.cases.forEach((c) => lexNames(c.consequent, set));
            return withScope(set, () => node.cases.forEach((c) => { walk(c.test, c, "test"); c.consequent.forEach((s) => walk(s, c, "consequent")); }));
          }
          case "ForStatement": case "ForInStatement": case "ForOfStatement": {
            const set = new Set(); const init = node.init || node.left;
            if (init && init.type === "VariableDeclaration") lexNames([init], set);
            return withScope(set, () => {
              if (node.type === "ForStatement") { walk(node.init, node, "init"); walk(node.test, node, "test"); walk(node.update, node, "update"); }
              else {
                if (node.left.type === "VariableDeclaration" || node.left.type === "Identifier" || node.left.type === "MemberExpression") walk(node.left, node, "left"); else pat(node.left);
                walk(node.right, node, "right");
              }
              walk(node.body, node, "body");
            });
          }
          case "CatchClause": {
            const set = new Set(); patNames(node.param, set);
            return withScope(set, () => { pat(node.param); walk(node.body, node, "body"); });
          }
          case "VariableDeclarator": pat(node.id); return walk(node.init, node, "init");
          case "AssignmentExpression":
            if (node.left.type === "ObjectPattern" || node.left.type === "ArrayPattern") pat(node.left); else walk(node.left, node, "left");
            return walk(node.right, node, "right");
          case "ClassExpression": case "ClassDeclaration": {
            const set = new Set(); if (node.id) set.add(node.id.name);
            return withScope(set, () => { walk(node.superClass, node, "superClass"); walk(node.body, node, "body"); });
          }
          case "MethodDefinition": case "PropertyDefinition": case "Property":
            if (node.computed) walk(node.key, node, "key");
            if (node.type === "Property" && node.shorthand && node.value.type === "Identifier") {
              const nm = node.value.name;
              if (ID_NAMES.has(nm) && !shadowed(nm)) edit(node.start, node.end, nm + ": fastsw." + nm);
              return;
            }
            return walk(node.value, node, "value");
          case "LabeledStatement": return walk(node.body, node, "body");
          case "BreakStatement": case "ContinueStatement": return;
          case "ImportDeclaration": return edit(node.source.start, node.source.end, JSON.stringify(rewriteURL(node.source.value, base)));
          case "ExportAllDeclaration": return node.source && edit(node.source.start, node.source.end, JSON.stringify(rewriteURL(node.source.value, base)));
          case "ExportNamedDeclaration":
            if (node.source) edit(node.source.start, node.source.end, JSON.stringify(rewriteURL(node.source.value, base)));
            return node.declaration && walk(node.declaration, node, "declaration");
          case "ImportExpression":
            edit(node.start, node.source.start, `fastsw.import(${baseJSON},`);
            walk(node.source, node, "source"); if (node.options) walk(node.options, node, "options");
            return;
          case "MetaProperty":
            if (node.meta.name === "import") edit(node.start, node.end, "fastsw.meta(import.meta)");
            return;
          case "MemberExpression":
            walk(node.object, node, "object");
            if (!node.computed) {
              if (PROP_NAMES.has(node.property.name)) edit(node.property.start, node.property.end, "fastsw$" + node.property.name);
            } else if (node.property.type === "Literal" && typeof node.property.value === "string" && PROP_NAMES.has(node.property.value))
              edit(node.property.start, node.property.end, JSON.stringify("fastsw$" + node.property.value));
            else walk(node.property, node, "property");
            return;
          case "Identifier":
            if (ID_NAMES.has(node.name) && !shadowed(node.name)) edit(node.start, node.end, "fastsw." + node.name);
            return;
        }
        kids(node, (c, k) => walk(c, node, k));
      }

      walk(ast, null, "");
      if (!edits.length) return src;
      edits.sort((a, b) => b[0] - a[0]);
      let out = src;
      for (const [s, e, t] of edits) out = out.slice(0, s) + t + out.slice(e);
      return out;
    }

    /* ---- legacy scanner (only used when acorn is missing or the source can't be parsed) ---- */
    function rewriteJSLegacy(src, base) {
      if (!src) return src;
      const s = String(src), n = s.length;

      // If the script itself declares location/top/parent as a binding, leave that bare name alone.
      const declared = new Set();
      for (const name of ["location", "top", "parent"]) {
        const r = new RegExp(String.raw`\b(?:var|let|const)\s+(?:[^;=(]*,\s*)?${name}\b|function\s*[\w$]*\s*\([^)]*\b${name}\b|\b${name}\s*=>|\([^()]*\b${name}\b[^()]*\)\s*=>|catch\s*\(\s*${name}\b|\{[^{}]*\b${name}\b[^{}]*\}\s*=(?!=)|(?:function|class)\s+${name}\b`);
        if (r.test(s)) declared.add(name);
      }
      const bare = ["location", "top", "parent"].filter((x) => !declared.has(x));
      const bareRe = bare.length
        ? new RegExp(`(?<![\\w$.])(?:${bare.join("|")})(?![\\w$])(?!\\s*[:(])`, "g")
        : null;
      const baseJSON = JSON.stringify(base);

      const rewriteCode = (c) => {
        c = c.replace(PROP_RE, (m, dot, ws, name) => dot + ws + "fastsw$" + name);
        if (bareRe) {
          c = c.replace(bareRe, (m, off, str) => {
            const before = str.slice(0, off).trimEnd().slice(-1);
            const after = str.slice(off + m.length).trimStart()[0];
            if ((before === "{" || before === ",") && (after === "," || after === "}")) return m; // shorthand {top}
            return "fastsw." + m;
          });
        }
        return c.replace(EVAL_RE, "fastsw.eval(").replace(DYN_IMPORT_RE, `fastsw.import(${baseJSON},`);
      };

      let i = 0, out = "", code = "";
      const flush = () => { if (code) { out += rewriteCode(code); code = ""; } };
      const special = /["'`\/{}]/g;

      function run(inTpl) {
        let depth = 0;
        while (i < n) {
          special.lastIndex = i;
          const m = special.exec(s);
          if (!m) { code += s.slice(i); i = n; return; }
          code += s.slice(i, m.index); i = m.index;
          const c = s[i], d = s[i + 1];

          if (c === "/") {
            if (d === "/") { flush(); let j = s.indexOf("\n", i); if (j < 0) j = n; out += s.slice(i, j); i = j; continue; }
            if (d === "*") { flush(); let j = s.indexOf("*/", i + 2); j = j < 0 ? n : j + 2; out += s.slice(i, j); i = j; continue; }
            let t = code.slice(-40).trimEnd(); if (!t) t = out.slice(-40).trimEnd();
            if (!t || RE_START.test(t) || KW_BEFORE_REGEX.test(t)) {          // regex literal
              let j = i + 1, cls = false;
              while (j < n) {
                const ch = s[j];
                if (ch === "\n") { j = -1; break; }
                if (ch === "\\") { j += 2; continue; }
                if (ch === "[") cls = true; else if (ch === "]") cls = false;
                else if (ch === "/" && !cls) break;
                j++;
              }
              if (j > 0 && j < n) {
                j++; while (j < n && /[a-z]/i.test(s[j])) j++;
                flush(); out += s.slice(i, j); i = j; continue;
              }
            }
            code += "/"; i++; continue;                                          // division
          }

          if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n && s[j] !== c && s[j] !== "\n") { if (s[j] === "\\") j++; j++; }
            j++;
            const str = s.slice(i, j);
            const imp = IMPORT_STR.test(code.slice(-30));
            flush();
            out += imp ? c + rewriteURL(str.slice(1, -1), base) + c : str;
            i = j; continue;
          }

          if (c === "`") {
            flush(); out += "`"; i++;
            while (i < n) {
              const ch = s[i];
              if (ch === "\\") { out += s.slice(i, i + 2); i += 2; }
              else if (ch === "`") { out += "`"; i++; break; }
              else if (ch === "$" && s[i + 1] === "{") { out += "${"; i += 2; run(true); }
              else { let j = i + 1; while (j < n && s[j] !== "\\" && s[j] !== "`" && s[j] !== "$") j++; out += s.slice(i, j); i = j; }
            }
            continue;
          }

          if (c === "{") { depth++; code += c; i++; continue; }
          if (c === "}") {
            if (inTpl && depth === 0) { flush(); out += "}"; i++; return; }
            depth--; code += c; i++; continue;
          }
        }
      }
      run(false); flush();
      return out;
    }

    /* --------------------------- HTML ---------------------------- */
    const ENT = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    const unent = (s) => s.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, (m) => ENT[m]);
    const ent = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const URL_ATTRS = new Set(["href", "src", "action", "poster", "data", "formaction", "background", "manifest", "ping", "cite", "longdesc", "codebase", "icon", "xlink:href"]);
    const ATTR_RE = /([^\s"'<>\/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    const HTML_RE = /<!--[\s\S]*?-->|<(script|style)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/\1\s*>|<([a-zA-Z][^\s\/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;

    function rewriteAttrs(tag, attrs, base) {
      return attrs.replace(ATTR_RE, (m, name, eq, dq, sq, uq) => {
        let v = dq !== undefined ? dq : sq !== undefined ? sq : uq;
        if (v === undefined) return m;
        const ln = name.toLowerCase();
        if (ln === "integrity" || ln === "nonce") return "";
        if (URL_ATTRS.has(ln)) {
          v = unent(v);
          v = /^\s*javascript:/i.test(v) ? "javascript:" + rewriteJS(v.replace(/^\s*javascript:/i, ""), base) : rewriteURL(v, base);
        } else if (ln === "srcset" || ln === "imagesrcset") v = rewriteSrcset(unent(v), base);
        else if (ln === "style") v = rewriteCSS(unent(v), base);
        else if (/^on[a-z]+$/.test(ln)) v = rewriteJS(unent(v), base);
        else if (ln === "srcdoc") v = rewriteHTML(unent(v), base, true, {});
        else return m;
        return `${name}="${ent(v)}"`;
      });
    }

    function rewriteImportMap(body, base) {
      try {
        const j = JSON.parse(body);
        const f = (o) => { for (const k in o) o[k] = rewriteURL(o[k], base); };
        if (j.imports) f(j.imports);
        for (const sc in j.scopes || {}) f(j.scopes[sc]);
        return JSON.stringify(j);
      } catch (e) { return body; }
    }

    function rewriteHTML(html, base, inject, boot) {
      const bm = /<base\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
      if (bm) { try { base = new URL(unent(bm[1] !== undefined ? bm[1] : bm[2] !== undefined ? bm[2] : bm[3]), base).href; } catch (e) {} }

      html = html.replace(HTML_RE, (m, sTag, sAttrs, sBody, tag, attrs) => {
        if (m.startsWith("<!--")) return m;
        if (sTag) {
          const st = sTag.toLowerCase();
          const a = rewriteAttrs(st, sAttrs, base);
          let body = sBody;
          if (st === "style") body = rewriteCSS(body, base);
          else {
            const type = ((/(?:^|\s)type\s*=\s*["']?([^"'\s>]+)/i.exec(sAttrs) || [])[1] || "").toLowerCase();
            if (!type || /^(module|(text|application)\/(javascript|ecmascript)|jsx?)$/.test(type)) {
              if (!/(?:^|\s)src\s*=/i.test(sAttrs)) body = rewriteJS(body, base);
            } else if (type === "importmap") body = rewriteImportMap(body, base);
          }
          return `<${sTag}${a}>${body}</${sTag}>`;
        }
        const t = tag.toLowerCase();
        if (t === "base") return "";
        if (t === "meta") {
          if (/http-equiv\s*=\s*["']?\s*(content-security-policy|x-frame-options)/i.test(attrs)) return "";
          if (/http-equiv\s*=\s*["']?\s*refresh/i.test(attrs))
            attrs = attrs.replace(/(content\s*=\s*["'][^"']*?url\s*=\s*)([^"';]+)/i, (a, p, u) => p + rewriteURL(unent(u.trim()), base));
          return `<${tag}${attrs}>`;
        }
        return `<${tag}${rewriteAttrs(t, attrs, base)}>`;
      });

      if (inject) {
        const bootJSON = JSON.stringify(boot || {}).replace(/</g, "\\u003c");
        const head =
          `<script>self.__fastswBoot=${bootJSON}</script>` +
          `<script src="${cfg.acornJS}"></script>` +
          (cfg.pageWebSocket ? `<script src="${cfg.libcurlJS}"></script>` : "") +
          `<script src="${cfg.clientPath}"></script>`;
        const dm = /<!doctype[^>]*>/i.exec(html);
        html = dm ? html.slice(0, dm.index + dm[0].length) + head + html.slice(dm.index + dm[0].length) : head + html;
      }
      return html;
    }

    return { encode, decode, rewriteURL, unrewrite, rewriteCSS, rewriteJS, rewriteHTML, rewriteSrcset };
  }

  /* ================================================================== *
   *  fastswRuntime — runs inside every proxied page / worker.
   *  Also self-contained (stringified by the service worker).
   * ================================================================== */
  function fastswRuntime(Core, cfg) {
    "use strict";
    const G = self;
    if (G.fastsw) return;
    const core = Core(cfg);
    const isWin = typeof document !== "undefined";
    const realLoc = G.location;
    const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
    const cur = () => {
      if (realLoc.protocol === "about:") {                       // about:blank / about:srcdoc frames inherit the parent's page
        try { if (G.parent !== G && G.parent.fastsw) return new URL(G.parent.fastsw.location.href); } catch (e) {}
        return new URL("about:blank");
      }
      try { return new URL(core.decode(realLoc.pathname)); } catch (e) { return new URL("about:blank"); }
    };
    const base = () => cur().href;
    const R = (u) => core.rewriteURL(u, base());
    const lurl = () => { const u = cur(); u.hash = realLoc.hash; return u; };
    const boot = G.__fastswBoot || {};
    const swc = safe(() => G.navigator.serviceWorker);
    const post = (m) => { try { swc && swc.controller && swc.controller.postMessage(m); } catch (e) {} };

    /* ---------- fake Location (fastsw.location) ---------- */
    const L = {};
    for (const p of ["href", "origin", "protocol", "host", "hostname", "port", "pathname", "search", "hash"]) {
      Object.defineProperty(L, p, {
        enumerable: true,
        get: () => lurl()[p],
        set: (v) => {
          if (p === "hash") { realLoc.hash = v; return; }
          if (p === "href") { realLoc.href = R(v); return; }
          if (p === "origin") return;
          const u = lurl(); u[p] = v; realLoc.href = core.encode(u.href);
        },
      });
    }
    L.assign = (v) => realLoc.assign(R(v));
    L.replace = (v) => realLoc.replace(R(v));
    L.reload = () => realLoc.reload();
    L.toString = () => lurl().href;
    L.valueOf = () => lurl().href;
    L.ancestorOrigins = [];
    L[Symbol.toPrimitive] = () => lurl().href;

    /* ---------- fastsw object: dummy top / parent / location so pages can't bust out ---------- */
    const isFast = (w) => safe(() => !!w.fastsw, false);
    const fastsw = {
      get location() { return L; },
      set location(v) { L.href = v; },            // bare `location = "..."` in page scripts must navigate, not clobber the dummy
      get top() { let w = G; safe(() => { while (w.parent !== w && isFast(w.parent)) w = w.parent; }); return w; },
      get parent() { return safe(() => (G.parent !== G && isFast(G.parent) ? G.parent : G), G); },
      get self() { return G; },
      eval: (x) => (typeof x === "string" ? (0, G.eval)(core.rewriteJS(x, base())) : x),
      import: (b, spec, opts) => (opts === undefined ? import(core.rewriteURL(String(spec), b)) : import(core.rewriteURL(String(spec), b), opts)),
      meta: (m) => Object.assign({}, m, { url: core.unrewrite(m.url) }),
      Function: new Proxy(Function, {
        construct(t, a, nt) { if (a.length) a[a.length - 1] = core.rewriteJS(String(a[a.length - 1]), base()); return Reflect.construct(t, a, nt === undefined ? t : nt); },
        apply(t, th, a) { if (a.length) a[a.length - 1] = core.rewriteJS(String(a[a.length - 1]), base()); return Reflect.apply(t, th, a); },
      }),
      rewriteURL: R, unrewrite: core.unrewrite, core,
    };
    Object.defineProperty(G, "fastsw", { value: fastsw });

    // give about:blank frames / popups the runtime too, otherwise a page could escape through them
    const inject = (w) => {
      try {
        if (!w || w === G || w.fastsw || w.location.protocol !== "about:") return;
        w.acorn = G.acorn; w.libcurl = G.libcurl;
        w.eval("(" + fastswRuntime.toString() + ")(" + Core.toString() + "," + JSON.stringify(cfg) + ")");
      } catch (e) {}
    };

    /* ---------- fastsw$location / fastsw$top / fastsw$parent — the JS rewriter turns
       `x.location` into `x.fastsw$location`; for real windows/documents these return the dummies ---------- */
    const isWinLike = (o) => safe(() => o && o.window === o, false);
    const isDocLike = (o) => isWin && o instanceof Document;
    const fastOf = (o) => (isWinLike(o) ? safe(() => o.fastsw) : isDocLike(o) ? safe(() => o.defaultView && o.defaultView.fastsw) : undefined);
    const def = (name, get, set) => Object.defineProperty(Object.prototype, "fastsw$" + name, { get, set, configurable: true, enumerable: false });
    def("location",
      function () { const f = fastOf(this); return f ? f.location : this.location; },
      function (v) { const f = fastOf(this); if (f) f.location.href = v; else this.location = v; });
    def("top",
      function () { const f = isWinLike(this) && fastOf(this); return f ? f.top : this.top; },
      function (v) { this.top = v; });
    def("parent",
      function () { const f = isWinLike(this) && fastOf(this); return f ? f.parent : this.parent; },
      function (v) { this.parent = v; });

    /* ---------- network ---------- */
    if (G.fetch) {
      const of = G.fetch;
      G.fetch = function (i, init) {
        try {
          if (typeof Request !== "undefined" && i instanceof Request) i = new Request(R(i.url), i);
          else i = R(i && i.href !== undefined ? i.href : i);
        } catch (e) {}
        return of.call(this, i, init);
      };
    }
    if (G.XMLHttpRequest) {
      const o = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (m, u, ...r) { return o.call(this, m, R(u), ...r); };
    }
    if (G.navigator && G.navigator.sendBeacon) {
      const ob = G.navigator.sendBeacon;
      Navigator.prototype.sendBeacon = function (u, d) { return ob.call(this, R(u), d); };
    }
    const ctor = (name, worker) => {
      const O = G[name]; if (!O) return;
      G[name] = new Proxy(O, {
        construct(t, a, nt) {
          if ((a[0] != null && typeof a[0] !== "object") || a[0] instanceof URL) {
            let u = R(String(a[0]));
            if (worker && a[1] && a[1].type === "module" && u.startsWith(cfg.prefix)) u += (u.includes("?") ? "&" : "?") + "fastsw_module=1";
            a[0] = u;
          }
          return Reflect.construct(t, a, nt === undefined ? t : nt);
        },
      });
    };
    ["Worker", "SharedWorker"].forEach((n) => ctor(n, true));
    ["EventSource", "Request", "Audio"].forEach((n) => ctor(n, false));
    if (!isWin && G.importScripts) { const oi = G.importScripts; G.importScripts = (...a) => oi.apply(G, a.map(R)); }

    // WebSockets go through libcurl.js -> Wisp
    if (isWin && cfg.pageWebSocket && G.libcurl && G.libcurl.WebSocket) {
      const wisp = cfg.wisp || (G.location.protocol === "https:" ? "wss:" : "ws:") + "//" + G.location.host + "/wisp/";
      const ready = Promise.resolve(G.libcurl.load_wasm(cfg.libcurlWasm)).then(() => G.libcurl.set_websocket(wisp)).catch(() => {});
      const NativeWS = G.WebSocket;
      G.WebSocket = new Proxy(NativeWS, {
        construct(t, a) {
          try { return new G.libcurl.WebSocket(a[0], a[1]); } catch (e) { return Reflect.construct(t, a); }
        },
      });
      G.WebSocket.__ready = ready;
    }

    if (G.history) for (const m of ["pushState", "replaceState"]) {
      const o = History.prototype[m];
      History.prototype[m] = function (s, t, u) { return o.call(this, s, t, u == null ? u : R(u)); };
    }
    if (G.open) { const oo = G.open; G.open = function (u, ...r) { const w = oo.call(this, u ? R(u) : u, ...r); if (!u || /^about:blank$/i.test(u)) inject(w); return w; }; }
    if (G.postMessage && G.Window) {
      const pm = Window.prototype.postMessage;
      Window.prototype.postMessage = function (msg, a2, ...r) {
        if (typeof a2 === "string" && a2 !== "/") a2 = "*";
        else if (a2 && typeof a2 === "object" && a2.targetOrigin) a2 = { ...a2, targetOrigin: "*" };
        return pm.call(this, msg, a2, ...r);
      };
    }
    // sites must not register their own service workers (would fight ours)
    safe(() => { delete (isWin ? Navigator : WorkerNavigator).prototype.serviceWorker; });
    safe(() => Object.defineProperty(G, "origin", { get: () => cur().origin, configurable: true }));
    if (G.indexedDB) {
      const pfx = () => cur().origin + "|";
      const io = IDBFactory.prototype.open, id = IDBFactory.prototype.deleteDatabase;
      IDBFactory.prototype.open = function (n, ...a) { return io.call(this, pfx() + n, ...a); };
      IDBFactory.prototype.deleteDatabase = function (n, ...a) { return id.call(this, pfx() + n, ...a); };
    }

    if (!isWin) return;

    /* ---------- DOM ---------- */
    const getter = (proto, prop, fn) => {
      const d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.get) return;
      Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get() { return fn(d.get.call(this), this); }, set: d.set });
    };
    const setter = (proto, prop, fn) => {
      const d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set) return;
      Object.defineProperty(proto, prop, { ...d, set(v) { d.set.call(this, fn(v, this)); } });
    };
    const D = Document.prototype;
    getter(D, "URL", () => lurl().href);
    getter(D, "documentURI", () => lurl().href);
    getter(D, "referrer", (v) => core.unrewrite(v));
    getter(D, "domain", () => cur().hostname);
    getter(Node.prototype, "baseURI", (v) => core.unrewrite(v));

    // cookies (jar lives in the SW; non-HttpOnly cookies are mirrored here)
    const cj = new Map();
    String(boot.cookie || "").split(/;\s*/).forEach((c) => { const i = c.indexOf("="); if (i > 0) cj.set(c.slice(0, i), c.slice(i + 1)); });
    Object.defineProperty(D, "cookie", {
      configurable: true,
      get() { return [...cj].map(([k, v]) => k + "=" + v).join("; "); },
      set(v) {
        v = String(v);
        const [nv, ...at] = v.split(";");
        const i = nv.indexOf("=");
        const k = i < 0 ? "" : nv.slice(0, i).trim(), val = i < 0 ? nv.trim() : nv.slice(i + 1).trim();
        const low = at.join(";").toLowerCase();
        const ex = /expires\s*=([^;]+)/.exec(low);
        const dead = /max-age\s*=\s*(0|-)/.test(low) || (ex && Date.parse(ex[1]) <= Date.now());
        if (dead) cj.delete(k); else cj.set(k, val);
        post({ type: "fastsw:cookie", url: base(), cookie: v });
      },
    });

    // <a>.hostname etc. should describe the real target, not the proxy
    for (const p of ["protocol", "host", "hostname", "port", "pathname", "search", "hash", "origin"])
      getter(HTMLAnchorElement.prototype, p, (v, el) => safe(() => new URL(core.unrewrite(el.href))[p], v));

    // URL-bearing properties
    const UP = [["HTMLAnchorElement", "href"], ["HTMLAreaElement", "href"], ["HTMLLinkElement", "href"], ["HTMLImageElement", "src"],
      ["HTMLScriptElement", "src"], ["HTMLIFrameElement", "src"], ["HTMLFrameElement", "src"], ["HTMLMediaElement", "src"],
      ["HTMLSourceElement", "src"], ["HTMLTrackElement", "src"], ["HTMLEmbedElement", "src"], ["HTMLObjectElement", "data"],
      ["HTMLInputElement", "src"], ["HTMLFormElement", "action"], ["HTMLVideoElement", "poster"]];
    for (const [cn, prop] of UP) {
      const C = G[cn]; if (!C) continue;
      const d = Object.getOwnPropertyDescriptor(C.prototype, prop); if (!d || !d.get) continue;
      Object.defineProperty(C.prototype, prop, { configurable: true, enumerable: d.enumerable,
        get() { return core.unrewrite(d.get.call(this)); }, set(v) { d.set.call(this, R(v)); } });
    }

    for (const C of [HTMLIFrameElement, G.HTMLFrameElement, G.HTMLObjectElement, G.HTMLEmbedElement]) {
      if (!C) continue;
      getter(C.prototype, "contentWindow", (w) => { inject(w); return w; });
      getter(C.prototype, "contentDocument", (d) => { if (d) inject(d.defaultView); return d; });
    }
    getter(MessageEvent.prototype, "origin", (v) => (v === G.location.origin ? cur().origin : v));
    for (const C of [HTMLImageElement, HTMLSourceElement]) setter(C.prototype, "srcset", (v) => core.rewriteSrcset(String(v), base()));
    const URLA = new Set(["href", "src", "action", "poster", "data", "formaction", "background", "manifest"]);
    if (G.Attr) setter(Attr.prototype, "value", (v, a) => (URLA.has(a.name.toLowerCase()) ? R(v) : v));
    const E = Element.prototype, sa = E.setAttribute, ga = E.getAttribute;
    E.setAttribute = function (n, v) {
      const l = String(n).toLowerCase(); v = String(v);
      if (l === "integrity" || l === "nonce") return;
      if (URLA.has(l)) v = /^\s*javascript:/i.test(v) ? "javascript:" + core.rewriteJS(v.replace(/^\s*javascript:/i, ""), base()) : R(v);
      else if (l === "srcset" || l === "imagesrcset") v = core.rewriteSrcset(v, base());
      else if (l === "style") v = core.rewriteCSS(v, base());
      else if (/^on[a-z]+$/.test(l)) v = core.rewriteJS(v, base());
      return sa.call(this, n, v);
    };
    E.getAttribute = function (n) { const v = ga.call(this, n); return URLA.has(String(n).toLowerCase()) ? core.unrewrite(v) : v; };

    // dynamic HTML
    const rh = (v) => core.rewriteHTML(String(v), base(), false);
    setter(E, "innerHTML", rh); setter(E, "outerHTML", rh);
    if (G.ShadowRoot) setter(ShadowRoot.prototype, "innerHTML", rh);
    const iah = E.insertAdjacentHTML;
    E.insertAdjacentHTML = function (p, h) { return iah.call(this, p, rh(h)); };
    for (const m of ["write", "writeln"]) { const o = D[m]; D[m] = function (...a) { return o.apply(this, a.map(rh)); }; }

    // dynamic scripts / styles
    const rjs = (el, v) => {
      if (v == null) return v;
      if (el instanceof HTMLScriptElement) { const t = el.type; return !t || /javascript|module|ecmascript/i.test(t) ? core.rewriteJS(String(v), base()) : v; }
      if (el instanceof HTMLStyleElement) return core.rewriteCSS(String(v), base());
      return v;
    };
    setter(HTMLScriptElement.prototype, "text", (v, el) => rjs(el, v));
    setter(Node.prototype, "textContent", (v, el) => rjs(el, v));
    setter(HTMLElement.prototype, "innerText", (v, el) => rjs(el, v));
    const ac = Node.prototype.appendChild;
    Node.prototype.appendChild = function (c) {
      if (c && c.nodeType === 3 && (this instanceof HTMLScriptElement || this instanceof HTMLStyleElement)) c.data = rjs(this, c.data);
      return ac.call(this, c);
    };

    // inline styles / stylesheets
    const CS = CSSStyleDeclaration.prototype;
    for (const p of ["cssText", "backgroundImage", "background", "maskImage", "listStyleImage", "content", "cursor", "borderImage"])
      setter(CS, p, (v) => (typeof v === "string" ? core.rewriteCSS(v, base()) : v));
    const sp = CS.setProperty;
    CS.setProperty = function (n, v, p) { return sp.call(this, n, typeof v === "string" && v.includes("url(") ? core.rewriteCSS(v, base()) : v, p); };
    if (G.CSSStyleSheet) {
      const S = CSSStyleSheet.prototype, ir = S.insertRule;
      S.insertRule = function (r, i) { return ir.call(this, core.rewriteCSS(r, base()), i); };
      for (const m of ["replace", "replaceSync"]) { const o = S[m]; if (o) S[m] = function (c) { return o.call(this, core.rewriteCSS(c, base())); }; }
    }

    // per-site storage isolation (every proxied site shares one real origin)
    const mkStore = (real) => {
      const P = () => cur().origin + "|";
      const keys = () => { const r = [], p = P(); for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k.startsWith(p)) r.push(k.slice(p.length)); } return r; };
      return new Proxy({}, {
        get(_, k) {
          switch (k) {
            case "getItem": return (x) => real.getItem(P() + x);
            case "setItem": return (x, v) => real.setItem(P() + x, v);
            case "removeItem": return (x) => real.removeItem(P() + x);
            case "clear": return () => keys().forEach((x) => real.removeItem(P() + x));
            case "key": return (i) => (keys()[i] === undefined ? null : keys()[i]);
            case "length": return keys().length;
          }
          if (typeof k === "symbol") return undefined;
          const v = real.getItem(P() + k); return v === null ? undefined : v;
        },
        set(_, k, v) { real.setItem(P() + k, v); return true; },
        deleteProperty(_, k) { real.removeItem(P() + k); return true; },
        has(_, k) { return real.getItem(P() + k) !== null; },
        ownKeys() { return keys(); },
        getOwnPropertyDescriptor(_, k) { const v = real.getItem(P() + k); return v === null ? undefined : { value: v, enumerable: true, configurable: true, writable: true }; },
      });
    };
    for (const n of ["localStorage", "sessionStorage"]) {
      const real = safe(() => G[n]); if (!real) continue;
      const px = mkStore(real);
      safe(() => Object.defineProperty(G, n, { get: () => px, configurable: true }));
    }
  }

  /* ================================================================== *
   *  Service worker side
   * ================================================================== */
  const IN_SW = typeof ServiceWorkerGlobalScope !== "undefined" && self instanceof ServiceWorkerGlobalScope;

  if (IN_SW) {
    importScripts(CONFIG.libcurlJS, CONFIG.acornJS);   // define globals `libcurl` and `acorn`

    const core = FastswCore(CONFIG);
    const ORIGIN = self.location.origin;
    const PREFIX = CONFIG.prefix;
    const WISP = CONFIG.wisp || (self.location.protocol === "https:" ? "wss:" : "ws:") + "//" + self.location.host + "/wisp/";

    /* ---------------- tiny IndexedDB KV (cookie persistence) ---------------- */
    const idb = (mode, fn) => new Promise((res, rej) => {
      const o = indexedDB.open("fastsw", 1);
      o.onupgradeneeded = () => o.result.createObjectStore("kv");
      o.onerror = () => rej(o.error);
      o.onsuccess = () => {
        const tx = o.result.transaction("kv", mode);
        const r = fn(tx.objectStore("kv"));
        tx.oncomplete = () => res(r && r.result);
        tx.onerror = () => rej(tx.error);
      };
    });

    /* ---------------- cookie jar ---------------- */
    const jar = {
      map: new Map(),
      timer: 0,
      persist() { clearTimeout(this.timer); this.timer = setTimeout(() => idb("readwrite", (s) => s.put([...this.map], "cookies")).catch(() => {}), 500); },
      async load() { try { const a = await idb("readonly", (s) => s.get("cookies")); if (a) this.map = new Map(a); } catch (e) {} },
      set(url, line) {
        const u = new URL(url);
        const [nv, ...attrs] = String(line).split(";");
        const eq = nv.indexOf("=");
        if (eq < 1) return;
        const c = { name: nv.slice(0, eq).trim(), value: nv.slice(eq + 1).trim(), domain: u.hostname, hostOnly: true,
          path: u.pathname.lastIndexOf("/") > 0 ? u.pathname.slice(0, u.pathname.lastIndexOf("/")) : "/", expires: 0, secure: false, httpOnly: false };
        for (const a of attrs) {
          const i = a.indexOf("="); const k = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase(); const v = i < 0 ? "" : a.slice(i + 1).trim();
          if (k === "domain" && v) { c.domain = v.replace(/^\./, "").toLowerCase(); c.hostOnly = false; }
          else if (k === "path" && v.startsWith("/")) c.path = v;
          else if (k === "expires") { const t = Date.parse(v); if (!isNaN(t)) c.expires = t; }
          else if (k === "max-age") c.expires = Date.now() + parseInt(v, 10) * 1000;
          else if (k === "secure") c.secure = true;
          else if (k === "httponly") c.httpOnly = true;
        }
        const key = `${c.domain}|${c.path}|${c.name}`;
        if (c.expires && c.expires <= Date.now()) this.map.delete(key); else this.map.set(key, c);
        this.persist();
      },
      get(url, js) {
        const u = new URL(url), now = Date.now(), out = [];
        for (const [k, c] of this.map) {
          if (c.expires && c.expires <= now) { this.map.delete(k); continue; }
          const dm = c.hostOnly ? u.hostname === c.domain : u.hostname === c.domain || u.hostname.endsWith("." + c.domain);
          if (!dm || !(u.pathname === c.path || u.pathname.startsWith(c.path.endsWith("/") ? c.path : c.path + "/"))) continue;
          if (c.secure && u.protocol !== "https:") continue;
          if (js && c.httpOnly) continue;
          out.push(`${c.name}=${c.value}`);
        }
        return out.join("; ");
      },
    };

    let readyP = null;
    const ensureReady = () => readyP || (readyP = (async () => {
      await libcurl.load_wasm(CONFIG.libcurlWasm);
      libcurl.set_websocket(WISP);
      await jar.load();
    })().catch((e) => { readyP = null; throw e; }));   // retry on next request if the wasm / Wisp setup failed

    /* ---------------- header policy ---------------- */
    const STRIP = new Set([
      "content-security-policy", "content-security-policy-report-only", "x-content-security-policy", "x-webkit-csp",
      "x-frame-options", "frame-options", "cross-origin-opener-policy", "cross-origin-embedder-policy",
      "cross-origin-resource-policy", "permissions-policy", "feature-policy", "referrer-policy", "report-to", "nel",
      "strict-transport-security", "public-key-pins", "clear-site-data", "expect-ct", "alt-svc", "link", "x-xss-protection",
      "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "x-content-type-options",
      "timing-allow-origin", "origin-agent-cluster", "accept-ch", "critical-ch",
    ]);
    const DROP_REQ = new Set(["host", "origin", "referer", "cookie", "connection", "accept-encoding", "content-length", "keep-alive", "te", "upgrade", "proxy-connection"]);
    const NULL_BODY = new Set([101, 204, 205, 304]);
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

    function decodeText(buf, ct) {
      const m = /charset=["']?([\w-]+)/i.exec(ct || "");
      try { return new TextDecoder(m ? m[1] : "utf-8").decode(buf); } catch (e) { return new TextDecoder().decode(buf); }
    }

    function clientScript() {
      const src = `(${fastswRuntime.toString()})(${FastswCore.toString()},${JSON.stringify(CONFIG)});`;
      return new Response(src, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
    }

    /* ---------------- the proxy request ---------------- */
    async function proxy(req, target, page) {
      await ensureReady();
      const t = new URL(target);
      const h = {};
      for (const [k, v] of req.headers) if (!DROP_REQ.has(k)) h[k] = v;
      h["user-agent"] = h["user-agent"] || self.navigator.userAgent;
      if (page) {
        h.referer = page;
        if ((req.method !== "GET" && req.method !== "HEAD") || req.headers.has("origin")) h.origin = new URL(page).origin;
      }
      const ck = jar.get(t.href, false);
      if (ck) h.cookie = ck;
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();

      const r = await libcurl.fetch(t.href, { method: req.method, headers: h, body, redirect: "manual" });

      const out = new Headers();
      const raw = r.raw_headers || Array.from(r.headers.entries());
      for (const [k, v] of raw) {
        const lk = k.toLowerCase();
        if (lk === "set-cookie") { jar.set(t.href, v); continue; }
        if (STRIP.has(lk)) continue;
        if (lk === "location") { out.set("location", core.rewriteURL(v, t.href)); continue; }
        out.append(k, v);
      }
      out.set("access-control-allow-origin", ORIGIN);
      out.set("access-control-allow-credentials", "true");

      if (r.status >= 300 && r.status < 400 && out.has("location")) return new Response(null, { status: r.status, headers: out });

      const ct = out.get("content-type") || "";
      const dest = req.destination;
      let kind = null;
      if (dest === "script" || dest === "worker" || dest === "sharedworker") kind = "js";
      else if (dest === "style") kind = "css";
      else if (/html/i.test(ct)) kind = "html";
      else if (/(java|ecma)script/i.test(ct)) kind = "js";
      else if (/text\/css/i.test(ct)) kind = "css";

      if (!kind || NULL_BODY.has(r.status)) {
        return new Response(NULL_BODY.has(r.status) ? null : r.body, { status: r.status, statusText: r.statusText, headers: out });
      }

      const text = decodeText(await r.arrayBuffer(), ct);
      let res;
      if (kind === "html") {
        const inject = dest === "document" || dest === "iframe" || dest === "frame" || dest === "embed" || dest === "object";
        res = core.rewriteHTML(text, t.href, inject, { cookie: jar.get(t.href, true) });
      } else if (kind === "css") res = core.rewriteCSS(text, t.href);
      else {
        res = core.rewriteJS(text, t.href);
        if (dest === "worker" || dest === "sharedworker") {
          const A = JSON.stringify(CONFIG.acornJS), C = JSON.stringify(CONFIG.clientPath);
          res = new URL(req.url).searchParams.has("fastsw_module")
            ? `import ${A};import ${C};` + res                                   // module worker
            : `self.__fastswBoot={};importScripts(${A},${C});` + res;           // classic worker
        }
      }
      const mime = ct.replace(/;\s*charset=[^;]*/i, "") || { html: "text/html", js: "text/javascript", css: "text/css" }[kind];
      out.set("content-type", mime + "; charset=utf-8");
      return new Response(res, { status: r.status, statusText: r.statusText, headers: out });
    }

    async function handle(e) {
      const req = e.request, u = new URL(req.url);
      try {
        if (u.origin === ORIGIN && u.pathname === CONFIG.clientPath) return clientScript();
        if (req.url === CONFIG.libcurlJS || req.url === CONFIG.libcurlWasm || req.url === CONFIG.acornJS) return fetch(req);

        let target, page = null;
        const refStr = req.referrer && req.referrer.startsWith(ORIGIN + PREFIX) ? req.referrer : null;

        if (u.origin === ORIGIN && u.pathname.startsWith(PREFIX)) {
          target = core.decode(u.pathname);
          // A GET <form> submit (e.g. Google's search box) replaces the query of its action URL, so the
          // browser sends  /fastsw/service/<enc(action)>?q=foo . The real query lives in u.search; the
          // encoded target never has its own "?" (encodeURIComponent turns it into %3F), so just swap it in.
          if (u.search) { try { const tu = new URL(target); tu.search = u.search; target = tu.href; } catch (err) {} }
          if (refStr) page = core.decode(new URL(refStr).pathname);
        } else {
          // request escaped the rewriter: resolve it against whichever proxied page made it
          const client = e.clientId ? await self.clients.get(e.clientId) : null;
          const ref = client && client.url && client.url.startsWith(ORIGIN + PREFIX) ? client.url : refStr;
          if (!ref) return fetch(req);                           // not a proxied client (e.g. index.html itself)
          page = core.decode(new URL(ref).pathname);
          target = u.origin === ORIGIN ? new URL(u.pathname + u.search, page).href : req.url;
        }
        if (!/^https?:/i.test(target)) return new Response("Bad target: " + target, { status: 400 });
        return await proxy(req, target, page);
      } catch (err) {
        return new Response(
          `<!doctype html><meta charset=utf-8><title>FastSW error</title><body style="font:15px system-ui;padding:2rem;background:#0b0d12;color:#e6e8ee"><h2>FastSW couldn't load this page</h2><pre style="white-space:pre-wrap">${esc(err && err.stack || err)}</pre>`,
          { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
      }
    }

    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
    self.addEventListener("fetch", (e) => e.respondWith(handle(e)));
    self.addEventListener("message", (e) => {
      const d = e.data;
      if (d && d.type === "fastsw:cookie") { try { jar.set(d.url, d.cookie); } catch (err) {} }
    });

  /* ================================================================== *
   *  Page side (index.html)
   * ================================================================== */
  } else if (typeof window !== "undefined") {
    const SELF_SRC = (document.currentScript && document.currentScript.src) || "/fastsw.all.js";
    const encode = (u) => { const i = u.indexOf("#"); return CONFIG.prefix + encodeURIComponent(i < 0 ? u : u.slice(0, i)) + (i < 0 ? "" : u.slice(i)); };

    window.Fastsw = {
      CONFIG,
      encode,
      core: FastswCore,
      async register() {
        if (!("serviceWorker" in navigator)) throw new Error("Service workers are not supported (need https:// or localhost).");
        await navigator.serviceWorker.register(SELF_SRC, { scope: "/", updateViaCache: "none" });
        await navigator.serviceWorker.ready;
      },
      /** Turn address-bar text into a URL (or a search) and navigate to the proxied version. */
      go(input, { search = "https://duckduckgo.com/?q=%s", target } = {}) {
        input = String(input || "").trim();
        if (!input) return;
        let url;
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) url = input;
        else if (/^[^\s/]+\.[a-z]{2,}(?::\d+)?(\/\S*)?$/i.test(input) || /^localhost(:\d+)?(\/\S*)?$/i.test(input)) url = "https://" + input;
        else url = search.replace("%s", encodeURIComponent(input));
        const dest = encode(url);
        if (target) target.location.href = dest; else window.location.href = dest;
      },
    };
  }
})();
