import { getAuth, requireAuth } from "@clerk/express";
import { Router } from "express";

export const authRouter = Router();

authRouter.get("/me", requireAuth(), (req, res) => {
  const auth = getAuth(req);

  res.json({
    clerkUserId: auth.userId,
    sessionId: auth.sessionId,
    role: "customer",
  });
});
