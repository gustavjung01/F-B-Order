import type { Request, Response } from "express";
import { Router } from "express";

import type { RequestIdentity } from "../auth/auth.identity";
import { requireAdmin } from "../admin/admin-access";
import { isOrderEngineError } from "../orders/order-errors";
import {
  activateAgentVersion,
  createAgentDefinition,
  createAgentVersion,
  getAgentBuilderCatalog,
  getAgentDefinition,
  getAgentVersionRuntimeReadiness,
  listAgentDefinitions,
} from "./agent-builder.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendAgentBuilderError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }
  console.error("agent builder request failed", error);
  res.status(500).json({ error: "AGENT_BUILDER_REQUEST_FAILED" });
}

export function createAgentBuilderRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/catalog", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await getAgentBuilderCatalog(identity));
    } catch (error) {
      sendAgentBuilderError(res, error);
    }
  });

  router.get("/agents", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await listAgentDefinitions(identity));
    } catch (error) {
      sendAgentBuilderError(res, error);
    }
  });

  router.post("/agents", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.status(201).json(await createAgentDefinition(identity, req.body));
    } catch (error) {
      sendAgentBuilderError(res, error);
    }
  });

  router.get("/agents/:agentKey", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await getAgentDefinition(identity, req.params.agentKey));
    } catch (error) {
      sendAgentBuilderError(res, error);
    }
  });

  router.post("/agents/:agentKey/versions", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.status(201).json(await createAgentVersion(identity, req.params.agentKey, req.body));
    } catch (error) {
      sendAgentBuilderError(res, error);
    }
  });

  router.get("/agents/:agentKey/versions/:version/readiness", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(
        await getAgentVersionRuntimeReadiness(identity, req.params.agentKey, req.params.version),
      );
    } catch (error) {
      sendAgentBuilderError(res, error);
    }
  });

  router.post("/agents/:agentKey/versions/:version/activate", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await activateAgentVersion(identity, req.params.agentKey, req.params.version));
    } catch (error) {
      sendAgentBuilderError(res, error);
    }
  });

  return router;
}
