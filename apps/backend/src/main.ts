import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import { authRouter } from "./modules/auth/auth.routes";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());
app.use(clerkMiddleware());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "bep-si-fb-api" });
});

app.get("/api/version", (_req, res) => {
  res.json({ name: "Bếp Sỉ F&B API", version: "initial" });
});

app.use("/api/auth", authRouter);

app.listen(port, () => {
  console.log(`Bếp Sỉ F&B API listening on port ${port}`);
});
