import dotenv from "dotenv";
import { createApp } from "./app";
import { createAiGatewayRuntimeFromEnv } from "./modules/ai/ai-gateway.factory";

dotenv.config();

const port = Number(process.env.PORT || 5000);
const serviceName = process.env.APP_NAME || "bepsi-api";
const corsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000";
const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
const clerkPublishableKey =
  process.env.CLERK_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const aiGateway = createAiGatewayRuntimeFromEnv();

const app = createApp({
  port,
  serviceName,
  corsOrigin,
  clerkSecretKey,
  clerkPublishableKey,
  aiGatewayService: aiGateway.service,
  aiProvider: aiGateway.provider,
});

app.listen(port, () => {
  console.log(`${serviceName} listening on port ${port}; AI provider=${aiGateway.provider}`);
});
