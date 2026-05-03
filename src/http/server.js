import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { createWorkflowApp } from "../application/app.js";
import { createFileStore } from "../infrastructure/store.js";

const publicRoot = fileURLToPath(new URL("../../public", import.meta.url));

export function createServer(options = {}) {
  const app = options.app ?? createWorkflowApp(options.store ?? createFileStore(options.dataFile ?? "data/store.json"));
  const root = options.publicRoot ?? publicRoot;

  return createHttpServer(async (request, response) => {
    try {
      if (request.url.startsWith("/api/")) {
        await routeApi(request, response, app);
        return;
      }

      await serveStatic(request, response, root);
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, {
        error: error.message ?? "Unexpected server error."
      });
    }
  });
}

export async function listen(options = {}) {
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const host = options.host ?? "127.0.0.1";
  const server = createServer(options);

  await new Promise((resolve) => server.listen(port, host, resolve));
  return {
    server,
    url: `http://${host}:${server.address().port}`
  };
}

async function routeApi(request, response, app) {
  const url = new URL(request.url, "http://localhost");
  const method = request.method;

  if (method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, await app.getState());
    return;
  }

  if (method === "GET" && url.pathname === "/api/workflows") {
    sendJson(response, 200, { workflows: await app.listWorkflows() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/workflows") {
    const result = await app.saveWorkflow(await readJson(request));
    sendJson(response, result.ok ? 200 : 422, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/tickets") {
    sendJson(response, 201, { ticket: await app.createTicket(await readJson(request)) });
    return;
  }

  const startMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)\/start$/);
  if (method === "POST" && startMatch) {
    const body = await readJson(request);
    sendJson(response, 200, {
      ticket: await app.startTicket(decodeURIComponent(startMatch[1]), body.workflowId)
    });
    return;
  }

  const manualMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)\/manual-complete$/);
  if (method === "POST" && manualMatch) {
    const body = await readJson(request);
    sendJson(response, 200, {
      ticket: await app.completeManual(decodeURIComponent(manualMatch[1]), body.actor ?? "human")
    });
    return;
  }

  sendJson(response, 404, { error: "Route was not found." });
}

async function serveStatic(request, response, root) {
  const url = new URL(request.url, "http://localhost");
  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "File was not found." });
      return;
    }
    throw error;
  }

  if (!fileStat.isFile()) {
    sendJson(response, 404, { error: "File was not found." });
    return;
  }

  response.writeHead(200, {
    "content-type": contentType(filePath)
  });
  createReadStream(filePath).pipe(response);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json"
  });
  response.end(JSON.stringify(body));
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
