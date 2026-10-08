import app from "./api.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((error: unknown) => {
  app.log.error(error, "API failed to start");
  process.exitCode = 1;
});
