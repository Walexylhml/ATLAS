import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Small, compressed, idempotent surface — this is the gateway-facing API.
  app.setGlobalPrefix("api", { exclude: ["healthz", "readyz"] });

  await app.listen(env.PORT, "0.0.0.0");
  app.get(Logger).log(`ATLAS API listening on :${env.PORT} (${env.NODE_ENV})`);
}

bootstrap().catch((err) => {
  console.error("Fatal boot error", err);
  process.exit(1);
});
