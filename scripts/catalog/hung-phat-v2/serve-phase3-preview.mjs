import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const root = path.resolve(getArg("root", process.cwd()));
const port = Number(getArg("port", "4173"));

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid port: ${port}`);
}
if (!fs.existsSync(root)) {
  throw new Error(`Preview root does not exist: ${root}`);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `127.0.0.1:${port}`}`);
    let relativePath = decodeURIComponent(requestUrl.pathname);
    if (relativePath === "/") relativePath = "/index.html";

    const resolvedPath = path.resolve(root, `.${relativePath}`);
    const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (resolvedPath !== root && !resolvedPath.startsWith(rootWithSeparator)) {
      send(response, 403, "Forbidden");
      return;
    }

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      send(response, 404, "Not Found");
      return;
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    send(response, 200, fs.readFileSync(resolvedPath), {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });
  } catch (error) {
    send(response, 500, error instanceof Error ? error.message : "Internal Server Error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Phase 3 preview server: http://127.0.0.1:${port}`);
  console.log(`Root: ${root}`);
});
