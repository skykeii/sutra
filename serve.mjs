import { createServer } from "node:http";
import next from "next";

// next start hides the socket address from the app, so this adds it for lib/client-ip.ts,
// replacing anything the client sent under the same name.
process.env.NODE_ENV ??= "production";
const hostname = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3100);
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();
createServer((req, res) => {
  req.headers["x-sutra-peer"] = req.socket.remoteAddress ?? "unknown";
  handle(req, res);
}).listen(port, hostname, () => console.log(`Sutra is listening on http://${hostname}:${port}`));
