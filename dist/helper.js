// Node helper for FastSW.
//
//   import { fastswPath } from "fastsw";
//   app.use("/fastsw/", express.static(fastswPath));
//
// then on your page:   <script src="/fastsw/fastsw.js"></script>   and   await Fastsw.register();
//
// `fastswPath` is a folder holding fastsw.all.js, fastsw.min.js and libcurl_full.js. Serve it at /fastsw/ (or any
// prefix you like): the service worker works out its own location, so the scope, the proxied-URL prefix and the
// libcurl path (<folder>/libcurl_full.js) follow wherever you mount it.
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const fastswPath = fileURLToPath(new URL("./dist", import.meta.url));
export const fastswFiles = Object.freeze({
  all: join(fastswPath, "fastsw.all.js"),
  min: join(fastswPath, "fastsw.js"),
  libcurl: join(fastswPath, "libcurl_full.js"),
});
export default fastswPath;
