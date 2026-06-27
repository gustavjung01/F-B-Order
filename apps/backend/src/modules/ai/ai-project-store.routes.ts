import { Router, type Request, type Response } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { AiGatewayError, type AiGatewayService } from "./ai-gateway.service";
import { AiProjectSchemaError } from "./ai-project-schema";
import { AiAgentRunnerService } from "./ai-agent-runner.service";
import { AiProjectStoreError, AiProjectStoreService } from "./ai-project-store.service";

 type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendError(res: Response, error: unknown) {
  if (error instanceof AiProjectStoreError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
    return;
  }
  if (error instanceof AiProjectSchemaError) {
    res.status(400).json({
      error: error.code,
      message: error.message,
      details: { path: error.path },
    });
    return;
  }
  if (error instanceof AiGatewayError) {
    res.status(error.status).json({
      ...(error.requestId ? { requestId: error.requestId } : {}),
      error: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
    return;
  }
  console.error("AI project store request failed", error);
  res.status(500).json({ error: "AI_PROJECT_STORE_FAILED", message: "AI project store request failed." });
}

export function createAdminAiProjectStoreRouter(
  identityResolver: IdentityResolver,
  service = new AiProjectStoreService(),
  aiGatewayService: AiGatewayService | null = null,
) {
  const router = Router();
  const agentRunner = new AiAgentRunnerService(aiGatewayService);

  router.get("/projects", async (req, res) => {
    try {
      res.json(await service.listProjects(await identityResolver(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/projects/load-json", async (req, res) => {
    try {
      res.status(201).json(await service.uploadProject(await identityResolver(req), {
        filename: req.body?.filename,
        json: req.body?.json,
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/projects/:projectId/versions", async (req, res) => {
    try {
      res.json(await service.listVersions(await identityResolver(req), req.params.projectId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/versions/:versionId/agents", async (req, res) => {
    try {
      res.json(await service.loadAgents(await identityResolver(req), req.params.versionId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/versions/:versionId/models", async (req, res) => {
    try {
      res.json(await service.loadModels(await identityResolver(req), req.params.versionId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/agents/:agentId/review", async (req, res) => {
    try {
      res.json(await agentRunner.reviewAgent(await identityResolver(req), req.params.agentId, {
        action: req.body?.action,
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/agents/:agentId/run", async (req, res) => {
    try {
      res.status(201).json(await agentRunner.runAgent(await identityResolver(req), req.params.agentId, {
        modelId: req.body?.modelId,
        inputText: req.body?.inputText,
        inputJson: req.body?.inputJson,
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/documents/manual", async (req, res) => {
    try {
      res.status(201).json(await service.saveManualDraft(await identityResolver(req), {
        schemaVersion: req.body?.schemaVersion,
        jsonPayload: req.body?.jsonPayload,
        schema: req.body?.schema,
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
