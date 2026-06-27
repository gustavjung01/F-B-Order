import type { Request, Response } from "express";
import { Router } from "express";
import { isOrderEngineError } from "../orders/order-errors";
import {
  resolveRequestIdentity,
  type RequestIdentity,
} from "./auth.identity";
import { createCustomerProfile } from "./customer-profile.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendAuthError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error("auth request failed", error);
  res.status(500).json({ error: "AUTH_REQUEST_FAILED" });
}

export function createAuthRouter(
  identityResolver: IdentityResolver = resolveRequestIdentity,
) {
  const authRouter = Router();

  authRouter.get("/me", async (req, res) => {
    try {
      const identity = await identityResolver(req);

      if (identity.kind === "anonymous") {
        res.status(401).json({ error: "AUTH_REQUIRED" });
        return;
      }

      if (identity.kind === "unmapped") {
        res.json({
          identityKind: identity.kind,
          clerkUserId: identity.clerkUserId,
          customerProfileRequired: true,
          canViewWholesalePrice: false,
          canPlaceOrder: false,
        });
        return;
      }

      if (identity.kind === "staff") {
        res.json({
          identityKind: identity.kind,
          clerkUserId: identity.clerkUserId,
          staffId: identity.staffId,
          role: identity.role,
          isActive: identity.isActive,
          canViewWholesalePrice: false,
          canPlaceOrder: false,
        });
        return;
      }

      const approvedAndActive =
        identity.approvalStatus === "approved" &&
        identity.accountStatus === "active";

      res.json({
        identityKind: identity.kind,
        clerkUserId: identity.clerkUserId,
        customerId: identity.customerId,
        customerUserRole: identity.customerUserRole,
        approvalStatus: identity.approvalStatus,
        accountStatus: identity.accountStatus,
        canViewWholesalePrice: approvedAndActive,
        canPlaceOrder: approvedAndActive,
      });
    } catch (error) {
      console.error("auth identity resolution failed", error);
      res.status(503).json({
        error: "IDENTITY_RESOLUTION_FAILED",
      });
    }
  });

  authRouter.post("/customer-profile", async (req, res) => {
    try {
      const identity = await identityResolver(req);

      const result = await createCustomerProfile(identity, {
        name: req.body?.name,
        shopName: req.body?.shopName,
        contactName: req.body?.contactName,
        phone: req.body?.phone,
        address: req.body?.address,
        area: req.body?.area,
        taxCode: req.body?.taxCode,
        businessType: req.body?.businessType,
      });

      res.status(201).json(result);
    } catch (error) {
      sendAuthError(res, error);
    }
  });

  return authRouter;
}

export const authRouter = createAuthRouter();
