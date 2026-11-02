# FastSW

A service-worker web proxy. Pages are fetched with [libcurl.js](https://github.com/ading2210/libcurl.js) over a
[Wisp](https://github.com/MercuryWorkshop/wisp-protocol) server, rewritten (HTML, CSS, and JS through an embedded
[acorn](https://github.com/acornjs/acorn) AST pass), and handed back to the browser from the service worker.

- one file to load in your page (`fastsw.min.js`), plus `libcurl_full.js` next to it
- `Fastsw.createFrame()` puts a proxied page in an `<iframe>` you control
- `location` / `top` / `parent` are replaced inside proxied pages, so they can't navigate or frame-bust their way out
- cookies, storage, IndexedDB and `postMessage` are kept separate per proxied site

## Quick start

### 1. Serve the files

```js
// server.js
import express from "express";
import { fastswPath } from "fastsw";

const app = express();
app.use("/fastsw/", express.static(fastswPath)); // fastsw.min.js, fastsw.all.js, libcurl_full.js
app.use(express.static("public"));               // your own frontend
app.listen(3000);
```

```sh
npm i ./fastsw-1.0.0.tgz express
node server.js
```

`require("fastsw")` works too. Any static host works as long as the three files end up in one folder (see
[Where things live](#where-things-live)).

### 2. Add a frontend

```html
<!-- public/index.html -->
<form id="form"><input id="url" placeholder="Search or enter a URL"><button>Go</button></form>
<div id="view" style="height:90vh"></div>

<script src="/fastsw/fastsw.min.js"></script>
<script>
  const frame = Fastsw.createFrame({ container: document.getElementById("view") });
  document.getElementById("form").onsubmit = (e) => {
    e.preventDefault();
    frame.go(document.getElementById("url").value);
  };
</script>
```

`createFrame` registers the service worker for you. See `example__frontend.html` for a complete page with
back / forward / reload buttons.

### 3. Point it at a Wisp server

The default is set in the `CONFIG` object at the top of `fastsw.all.js` (`wisp: "wss://…/wisp/"`). Set it to your own
Wisp server, or to `null` to use `/wisp/` on the same host.

## API

All of it lives on `window.Fastsw`.

### `Fastsw.createFrame(arg?, options?)` → `Frame`

`arg` can be a URL or search text, an existing `<iframe>`, or an options object.

| option      | meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `url`       | page to open straight away                                           |
| `frame`     | use this `<iframe>` instead of creating one                          |
| `container` | element to append the new iframe to                                  |
| `search`    | search URL used for non-URL input, `%s` is the query (DuckDuckGo)    |
| `attrs`     | extra attributes for the iframe                                      |
| `className`, `style` | applied to the iframe                                       |

```js
const f = Fastsw.createFrame("https://example.com", { container: document.body });

f.go("wikipedia.org");   // URL, bare domain, or search text
f.back();  f.forward();  f.reload();
f.url;                   // the REAL address of the page shown, never /fastsw/service/...
f.title;
f.ready;                 // promise: service worker registered and active
f.element;               // the <iframe>
f.destroy();

f.addEventListener("navigate",  (e) => console.log(e.detail.url)); // every load
f.addEventListener("urlchange", (e) => console.log(e.detail.url)); // also pushState / hash changes
```

### Other helpers

| call                         | what it does                                                              |
| ---------------------------- | ------------------------------------------------------------------------- |
| `Fastsw.register({ scope })` | register the service worker; resolves with the registration               |
| `Fastsw.go(input, opts)`     | navigate the current window (or `opts.target`) to the proxied page        |
| `Fastsw.encode(url)`         | the `/fastsw/service/<url>` form of a URL                                 |
| `Fastsw.Frame`               | the class behind `createFrame`                                            |
| `Fastsw.CONFIG`              | the active configuration (read-only in practice)                          |

## Where things live

Everything is worked out from the folder that `fastsw.*.js` is served from, so you can mount it anywhere.
Served at `/fastsw/`:

| thing                | URL                       |
| -------------------- | ------------------------- |
| service worker scope | `/fastsw/`                |
| proxied pages        | `/fastsw/service/<url>`   |
| in-page runtime      | `/fastsw/client.js`       |
| libcurl (static)     | `/fastsw/libcurl_full.js` |
| debug page           | `/fastsw/debug`           |

A service worker can only claim scopes at or below its own script's folder, which is why FastSW never registers for
`/`. If you mount the folder somewhere that isn't called `fastsw` (say `/static/`), a `fastsw/` folder is added
below it: scope `/static/fastsw/`, and libcurl stays next to the script at `/static/libcurl_full.js`.

Want the full `/` scope? Send `Service-Worker-Allowed: /` for the script and call
`Fastsw.register({ scope: "/" })`.

## Configuration

`CONFIG` sits at the top of `fastsw.all.js`:

| key             | default                         | notes                                                       |
| --------------- | ------------------------------- | ----------------------------------------------------------- |
| `wisp`          | `wss://zakaon.top/wisp/`        | your Wisp server; `null` = same host, `/wisp/`              |
| `libcurlJS`     | `<script folder>/libcurl_full.js` | static file; set it to host libcurl somewhere else        |
| `pageWebSocket` | `true`                          | send page `WebSocket`s through Wisp too                     |
| `bypass`        | `[]`                            | paths on your own host the worker must never touch          |
| `scope`, `prefix`, `clientPath`, `debugPath` | derived        | change `scope` through `Fastsw.register`, the rest follow the folder |

## Troubleshooting

**`Failed to register a ServiceWorker … not under the max scope allowed`**: the script's folder doesn't contain the
scope you asked for. Don't pass `scope: "/"` unless the host sends `Service-Worker-Allowed: /`.

**"FastSW could not load /…/libcurl_full.js"**: the file isn't next to the script. Open that URL directly; it should
download about 2 MB of JavaScript, not an HTML page. Then unregister the worker and reload.

**Something on a page breaks.** Two tools:

- open `/fastsw/debug` on your proxy origin for the worker's recent requests (headers, status, cookies; add
  `?f=<text>` to filter). Secrets are redacted.
- `localStorage.__fastswDebug = "1"` and reload, for extra console logging from inside proxied pages.

WebSocket lifecycle is always logged as `[fastsw] websocket …` lines, including the libcurl error code if a
handshake fails.


## Files

| file                      | purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `dist/fastsw.js`      | everything, minified (load this one)                      |
| `dist/fastsw.all.js`      | the same, readable                                        |
| `dist/libcurl_full.js`    | libcurl.js with its WASM bundled in                       |
| `fastsw.helper.js` / `.cjs` | `fastswPath` for Node, ESM and CommonJS                 |
