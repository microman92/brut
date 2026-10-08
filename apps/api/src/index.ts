import Fastify from "fastify";
import { registerApiRoutes, startApiServices } from "./api.js";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);

await registerApiRoutes(app);
await startApiServices(app);

app.listen({ port, host: "0.0.0.0" }).catch((error: unknown) => {
  app.log.error(error, "API failed to start");
  process.exitCode = 1;
});
