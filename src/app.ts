import http from "http";
import { Readable } from "stream";
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import logger from "./utils/logger";
import { authRoutes } from "./modules/auth/auth.routes";

/**
 * Build the Elysia application with CORS and Swagger docs.
 * Returned value is a Node http.Server for supertest compatibility.
 */
export function createApp() {
  const app = new Elysia({ name: "ai-finance-tracker-api" })
    .use(
      cors({
        origin: (origin) => true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Accept",
        ],
      })
    )
    .use(
      swagger({
        path: "/docs",
        documentation: {
          info: {
            title: "AI Finance Tracker API",
            version: "1.0.0",
            description: "API documentation for the AI Finance Tracker",
          },
          tags: [
            { name: "system", description: "System and health endpoints" },
            { name: "ai", description: "AI processing endpoints" },
            { name: "Authentication", description: "User authentication endpoints" },
          ],
        },
      })
    )
    .get("/", () => ({ message: "AI Finance Tracker API" }), {
      detail: { tags: ["system"], summary: "Root" },
    })
    .get("/health", () => ({ status: "ok" }), {
      detail: { tags: ["system"], summary: "Health check" },
    })
    .use(authRoutes);

  const nodeListener: http.RequestListener = async (req, res) => {
    try {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`
      );
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) v.forEach((vv) => headers.append(k, String(vv)));
        else if (v !== undefined) headers.set(k, String(v));
      }

      const method = (req.method ?? "GET").toUpperCase();
      const hasBody = !(method === "GET" || method === "HEAD");
      const body = hasBody
        ? (Readable.toWeb(req) as unknown as ReadableStream)
        : undefined;

      const request = new Request(url, { method, headers, body });
      const handler: (r: Request) => Promise<Response> =
        (app as any).handle?.bind(app) ?? (app as any).fetch?.bind(app);
      const response = await handler(request);

      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries())
      );
      const buff = Buffer.from(await response.arrayBuffer());
      res.end(buff);
    } catch (err) {
      logger.error({ err }, "Request bridge error");
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  };

  return http.createServer(nodeListener);
}

export default createApp;
