import { Router, type Request, type Response } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { AiGatewayError, AiGatewayService } from "./ai-gateway.service";
import { AI_SCHEMA_VERSION, AiSchemaError } from "./ai-schema";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendError(res: Response, error: unknown) {
  if (error instanceof AiSchemaError) {
    res.status(400).json({
      schemaVersion: AI_SCHEMA_VERSION,
      error: error.code,
      message: error.message,
      details: { path: error.path },
    });
    return;
  }
  if (error instanceof AiGatewayError) {
    res.status(error.status).json({
      schemaVersion: AI_SCHEMA_VERSION,
      ...(error.requestId ? { requestId: error.requestId } : {}),
      error: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
    return;
  }
  console.error("AI gateway request failed", error);
  res.status(500).json({
    schemaVersion: AI_SCHEMA_VERSION,
    error: "AI_GATEWAY_FAILED",
    message: "AI gateway request failed.",
  });
}

export function createAdminAiGatewayRouter(
  identityResolver: IdentityResolver,
  service: AiGatewayService,
) {
  const router = Router();

  router.post("/generate", async (req, res) => {
    try {
      const identity = await identityResolver(req);
      res.json(await service.generate(identity, req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
