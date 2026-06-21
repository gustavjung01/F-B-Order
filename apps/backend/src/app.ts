import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { anonymousIdentity, resolveRequestIdentity } from "./modules/auth/auth.identity";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { createCatalogRouter } from "./modules/catalog/catalog.routes";

export type AppConfig = {
  corsOrigin: string;
  serviceName: string;
  port: number;
  clerkSecretKey?: string;
  clerkPublishableKey?: string;
};

export function createApp(config: AppConfig) {
  const app = express();
  const clerkEnabled = Boolean(config.clerkSecretKey && config.clerkPublishableKey);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  const healthPayload = () => ({
    ok: true,
    service: config.serviceName,
    port: config.port,
    clerkEnabled,
    clerkMissing: {
      secretKey: !config.clerkSecretKey,
      publishableKey: !config.clerkPublishableKey,
    },
    time: new Date().toISOString(),
  });

  app.get("/health", (_req, res) => res.json(healthPayload()));
  app.get("/api/health", (_req, res) => res.json(healthPayload()));
  app.get("/api/version", (_req, res) => {
    res.json({ name: "Bếp Sỉ F&B API", service: config.serviceName, version: "auth-pricing-v2" });
  });

  if (clerkEnabled) {
    app.use(
      clerkMiddleware({
        secretKey: config.clerkSecretKey,
        publishableKey: config.clerkPublishableKey,
      }),
    );
  }

  app.use(
    "/api/catalog",
    createCatalogRouter(clerkEnabled ? resolveRequestIdentity : async () => anonymousIdentity),
  );

  if (clerkEnabled) {
    app.use("/api/auth", createAuthRouter(resolveRequestIdentity));
  } else {
    app.use("/api/auth", (_req, res) => {
      res.status(503).json({ error: "CLERK_NOT_CONFIGURED" });
    });
  }

  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  return app;
}
