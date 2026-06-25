import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createAdminCustomersRouter } from "./modules/admin/admin-customers.routes";
import { anonymousIdentity, resolveRequestIdentity } from "./modules/auth/auth.identity";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { createCatalogV2ChoiceCartRouter } from "./modules/catalog-v2/catalog-v2-choice-cart.routes";
import { createCatalogV2DetailRouter } from "./modules/catalog-v2/catalog-v2-detail.routes";
import { createCatalogV2ListRouter } from "./modules/catalog-v2/catalog-v2-list.routes";
import { createCartRouter } from "./modules/catalog/cart.routes";
import { createCatalogRouter } from "./modules/catalog/catalog.routes";
import { createAdminOrdersRouter } from "./modules/orders/admin-orders.routes";
import { createCustomerOrdersRouter } from "./modules/orders/customer-orders.routes";
import { createOrderEntryRouter } from "./modules/orders/orders-entry.routes";

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
    res.json({ name: "Bếp Sỉ F&B API", service: config.serviceName, version: "catalog-v2-backend" });
  });

  if (clerkEnabled) {
    app.use(
      clerkMiddleware({
        secretKey: config.clerkSecretKey,
        publishableKey: config.clerkPublishableKey,
      }),
    );
  }

  const identityResolver = clerkEnabled ? resolveRequestIdentity : async () => anonymousIdentity;

  app.use("/catalog", createCatalogV2ListRouter(identityResolver));
  app.use("/catalog", createCatalogV2DetailRouter(identityResolver));
  app.use("/api/catalog-v2", createCatalogV2ListRouter(identityResolver));
  app.use("/api/catalog-v2", createCatalogV2DetailRouter(identityResolver));
  app.use("/api/catalog", createCatalogRouter(identityResolver));

  if (clerkEnabled) {
    app.use("/catalog/cart", createCatalogV2ChoiceCartRouter(resolveRequestIdentity));
    app.use("/api/cart-v2", createCatalogV2ChoiceCartRouter(resolveRequestIdentity));
    app.use("/api/auth", createAuthRouter(resolveRequestIdentity));
    app.use("/api/cart", createCartRouter(resolveRequestIdentity));
    app.use("/api/orders", createOrderEntryRouter(resolveRequestIdentity));
    app.use("/api/customer/orders", createCustomerOrdersRouter(resolveRequestIdentity));
    app.use("/api/admin/customers", createAdminCustomersRouter(resolveRequestIdentity));
    app.use("/api/admin/orders", createAdminOrdersRouter(resolveRequestIdentity));
  } else {
    const clerkUnavailable = (_req: express.Request, res: express.Response) => {
      res.status(503).json({ error: "CLERK_NOT_CONFIGURED" });
    };
    app.use("/catalog/cart", clerkUnavailable);
    app.use("/api/cart-v2", clerkUnavailable);
    app.use("/api/auth", clerkUnavailable);
    app.use("/api/cart", clerkUnavailable);
    app.use("/api/orders", clerkUnavailable);
    app.use("/api/customer/orders", clerkUnavailable);
    app.use("/api/admin/customers", clerkUnavailable);
    app.use("/api/admin/orders", clerkUnavailable);
  }

  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  return app;
}
