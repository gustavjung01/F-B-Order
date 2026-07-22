import os from "node:os";
import { getDb } from "../../db/pool.js";
import { buildRecipeSopDraftContent } from "./ai-draft-content.js";
import { generateWithGoogleAgent } from "./google-agent.provider.js";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.AI_JOB_POLL_MS || 2000);
const STALE_AFTER_MS = Number(process.env.AI_JOB_STALE_AFTER_MS || 5 * 60_000);

let timer: NodeJS.Timeout | null = null;
let running = false;

function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
}

async function recoverStaleJobs(): Promise<void> {
  await getDb().query(
    `UPDATE ai_jobs
     SET status = 'pending',
         locked_at = NULL,
         locked_by = NULL,
         available_at = now(),
         updated_at = now(),
         error_code = COALESCE(error_code, 'WORKER_RECOVERED_STALE_JOB'),
         error_message = COALESCE(error_message, 'Recovered after worker restart or timeout')
     WHERE status = 'processing'
       AND locked_at < now() - ($1::int * interval '1 millisecond')`,
    [STALE_AFTER_MS],
  );
}

async function claimJob() {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      staff_user_id: string;
      job_type: "read_only" | "draft";
      prompt: string;
      context_scope: string[];
      context_data: unknown;
      draft_type: "recipe" | "customer_reply" | "catalog_copy" | "operations_note" | null;
      draft_title: string | null;
      attempt_count: number;
      max_attempts: number;
    }>(
      `SELECT id::text, staff_user_id::text, job_type, prompt, context_scope,
              context_data, draft_type, draft_title, attempt_count, max_attempts
       FROM ai_jobs
       WHERE status = 'pending'
         AND available_at <= now()
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    const job = result.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return null;
    }
    await client.query(
      `UPDATE ai_jobs
       SET status = 'processing',
           attempt_count = attempt_count + 1,
           locked_at = now(),
           locked_by = $2,
           started_at = COALESCE(started_at, now()),
           updated_at = now(),
           error_code = NULL,
           error_message = NULL
       WHERE id = $1`,
      [job.id, WORKER_ID],
    );
    await client.query("COMMIT");
    return { ...job, attempt_count: job.attempt_count + 1 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function completeJob(job: Awaited<ReturnType<typeof claimJob>>): Promise<void> {
  if (!job) return;
  const generated = await generateWithGoogleAgent({
    prompt: job.prompt,
    context: job.context_data,
    mode: job.job_type,
    userId: job.staff_user_id,
  });

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const interaction = await client.query<{ id: string }>(
      `INSERT INTO ai_interactions(
         staff_user_id, mode, prompt, context_scope, provider, model,
         response_text, response_data, token_usage
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
       RETURNING id::text`,
      [
        job.staff_user_id,
        job.job_type,
        job.prompt,
        job.context_scope,
        generated.provider,
        generated.model,
        generated.text,
        JSON.stringify(generated.data),
        JSON.stringify(generated.usage),
      ],
    );

    let draftId: string | null = null;
    if (job.job_type === "draft") {
      const recipeContent = job.draft_type === "recipe"
        ? buildRecipeSopDraftContent(generated.text, job.context_data)
        : null;
      const content = recipeContent ?? { text: generated.text, context: job.context_data };
      const targetRecipeId = recipeContent?.targetRecipeId ?? null;
      const baseRecipeVersionId = recipeContent?.baseRecipeVersionId ?? null;
      const draft = await client.query<{ id: string }>(
        `INSERT INTO ai_drafts(
           created_by_staff_id,
           draft_type,
           title,
           content,
           source_interaction_id,
           target_recipe_id,
           base_recipe_version_id
         ) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)
         RETURNING id::text`,
        [
          job.staff_user_id,
          job.draft_type,
          job.draft_title,
          JSON.stringify(content),
          interaction.rows[0].id,
          targetRecipeId,
          baseRecipeVersionId,
        ],
      );
      draftId = draft.rows[0].id;
      await client.query(
        `INSERT INTO ai_draft_events(draft_id,event_type,actor_staff_id,note,metadata)
         VALUES($1,'generated',$2,$3,$4::jsonb)`,
        [
          draftId,
          job.staff_user_id,
          "AI worker generated a draft awaiting human review.",
          JSON.stringify({
            jobId: job.id,
            draftType: job.draft_type,
            targetRecipeId,
            baseRecipeVersionId,
            provider: generated.provider,
            model: generated.model,
          }),
        ],
      );
    }

    await client.query(
      `UPDATE ai_jobs
       SET status = 'completed',
           completed_at = now(),
           interaction_id = $2,
           draft_id = $3,
           response_text = $4,
           provider = $5,
           model = $6,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = now()
       WHERE id = $1`,
      [job.id, interaction.rows[0].id, draftId, generated.text, generated.provider, generated.model],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function failJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>, error: unknown): Promise<void> {
  const code = (error as { code?: string }).code || "AI_JOB_FAILED";
  const message = error instanceof Error ? error.message : "Unknown AI job failure";
  const shouldRetry = job.attempt_count < job.max_attempts;
  await getDb().query(
    `UPDATE ai_jobs
     SET status = $2,
         available_at = CASE WHEN $2 = 'pending'
           THEN now() + ($3::int * interval '1 millisecond')
           ELSE available_at END,
         completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE completed_at END,
         locked_at = NULL,
         locked_by = NULL,
         error_code = $4,
         error_message = $5,
         updated_at = now()
     WHERE id = $1`,
    [job.id, shouldRetry ? "pending" : "failed", retryDelayMs(job.attempt_count), code, message.slice(0, 2000)],
  );
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const job = await claimJob();
    if (!job) return;
    try {
      await completeJob(job);
    } catch (error) {
      await failJob(job, error);
      console.error("AI job failed", { jobId: job.id, error });
    }
  } catch (error) {
    console.error("AI worker tick failed", error);
  } finally {
    running = false;
  }
}

export async function startAiWorker(): Promise<void> {
  if (timer) return;
  await recoverStaleJobs();
  timer = setInterval(() => void tick(), POLL_MS);
  timer.unref();
  void tick();
  console.log("AI job worker started", { workerId: WORKER_ID, pollMs: POLL_MS });
}

export function stopAiWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
