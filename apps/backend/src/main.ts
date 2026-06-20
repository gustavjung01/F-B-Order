import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import { authRouter } from "./modules/auth/auth.routes";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const corsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000";
const serviceName = process.env.APP_NAME || "bepsi-api";
const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
const clerkPublishableKey =
  process.env.CLERK_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const clerkEnabled = Boolean(clerkSecretKey && clerkPublishableKey);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

function healthPayload() {
  return {
    ok: true,
    service: serviceName,
    port,
    clerkEnabled,
    clerkMissing: {
      secretKey: !clerkSecretKey,
      publishableKey: !clerkPublishableKey,
    },
    time: new Date().toISOString(),
  };
}

app.get("/health", (_req, res) => {
  res.json(healthPayload());
});

app.get("/api/health", (_req, res) => {
  res.json(healthPayload());
});

app.get("/api/version", (_req, res) => {
  res.json({ name: "Bếp Sỉ F&B API", service: serviceName, version: "vps-skeleton" });
});

if (clerkEnabled) {
  app.use(clerkMiddleware({ secretKey: clerkSecretKey, publishableKey: clerkPublishableKey }));
  app.use("/api/auth", authRouter);
} else {
  app.use("/api/auth", (_req, res) => {
    res.status(503).json({
      error: "CLERK_NOT_CONFIGURED",
      missing: {
        secretKey: !clerkSecretKey,
        publishableKey: !clerkPublishableKey,
      },
    });
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

app.listen(port, () => {
  console.log(`${serviceName} listening on port ${port}`);
});
