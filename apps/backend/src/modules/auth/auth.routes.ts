import { getAuth } from "@clerk/express";
import { Router } from "express";

export const authRouter = Router();

authRouter.get("/me", (req, res) => {
  const auth = getAuth(req);

  if (!auth.userId) {
    res.status(401).json({ error: "AUTH_REQUIRED" });
    return;
  }

  res.json({
    clerkUserId: auth.userId,
    sessionId: auth.sessionId,
    role: "customer",
  });
});
