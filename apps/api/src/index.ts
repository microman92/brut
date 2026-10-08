import Fastify, { type FastifyInstance } from "fastify";

let app: FastifyInstance;

try {
  ({ default: app } = await import("./app.js"));
} catch (error) {
  console.error("API_BOOTSTRAP_FAILED", error);
  app = Fastify({ logger: true });
  const unavailable = { ok: false, error: "API_BOOTSTRAP_FAILED" };
  app.get("/health", async (_request, reply) => reply.status(503).send(unavailable));
  app.setNotFoundHandler((_request, reply) => reply.status(503).send(unavailable));
}

export default app;
