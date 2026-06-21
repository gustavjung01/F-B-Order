import type { Request } from "express";
import { Router } from "express";
import {
  resolveRequestIdentity,
  type RequestIdentity,
} from "./auth.identity";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

export function createAuthRouter(identityResolver: IdentityResolver = resolveRequestIdentity) {
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
        identity.approvalStatus === "approved" && identity.accountStatus === "active";

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
      res.status(503).json({ error: "IDENTITY_RESOLUTION_FAILED" });
    }
  });

  return authRouter;
}

export const authRouter = createAuthRouter();
