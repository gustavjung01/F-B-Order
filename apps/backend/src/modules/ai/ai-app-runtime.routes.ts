import { Router, type Request, type Response } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { AiAppRuntimeError, AiAppRuntimeService } from "./ai-app-runtime.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendError(res: Response, error: unknown) {
  if (error instanceof AiAppRuntimeError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
    return;
  }
  console.error("AI app runtime request failed", error);
  res.status(500).json({ error: "AI_APP_RUNTIME_FAILED", message: "AI app runtime request failed." });
}

export function createAdminAiAppRuntimeRouter(
  identityResolver: IdentityResolver,
  service = new AiAppRuntimeService(),
) {
  const router = Router();

  router.patch("/agents/:agentId/review", async (req, res) => {
    try {
      const status = req.body?.status;
      if (!["reviewed", "approved", "rejected"].includes(status)) {
        res.status(400).json({ error: "INVALID_REVIEW_STATUS", message: "Invalid review status." });
        return;
      }
      res.json(await service.approveAgent(await identityResolver(req), req.params.agentId, status));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/apps", async (req, res) => {
    try {
      res.json(await service.listApps(await identityResolver(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/apps", async (req, res) => {
    try {
      res.status(201).json(await service.createApp(await identityResolver(req), {
        appKey: req.body?.appKey,
        name: req.body?.name,
        description: req.body?.description,
        projectVersionId: req.body?.projectVersionId,
        runtimeConfig: req.body?.runtimeConfig,
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/apps/:appId/agents", async (req, res) => {
    try {
      res.json(await service.listAppAgents(await identityResolver(req), req.params.appId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/apps/:appId/agents", async (req, res) => {
    try {
      res.status(201).json(await service.loadAgentIntoApp(await identityResolver(req), req.params.appId, {
        agentId: req.body?.agentId,
        modelId: req.body?.modelId,
        slotKey: req.body?.slotKey,
        runtimeConfig: req.body?.runtimeConfig,
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
