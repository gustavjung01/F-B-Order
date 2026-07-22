import dotenv from "dotenv";
import { closeDb } from "./db/pool.js";
import { startAiWorker, stopAiWorker } from "./modules/ai/ai.worker.js";
import { verifyGoogleAgentProvider } from "./modules/ai/google-agent.provider.js";

dotenv.config();

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("AI worker shutdown requested", { signal });

  try {
    await stopAiWorker();
    await closeDb();
    console.log("AI worker shutdown completed", { signal });
  } catch (error) {
    console.error("AI worker shutdown failed", { signal, error });
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

void (async () => {
  const provider = await verifyGoogleAgentProvider();
  console.log("AI provider preflight passed", provider);
  await startAiWorker();
})().catch(async (error) => {
  console.error("AI worker failed to start", error);
  process.exitCode = 1;
  await closeDb().catch(() => undefined);
});
