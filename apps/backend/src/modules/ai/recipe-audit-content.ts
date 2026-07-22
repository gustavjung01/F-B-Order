import { z } from "zod";
import { OrderEngineError } from "../orders/order-errors.js";

export const RECIPE_AUDIT_CHECKLIST_KEYS = [
  "ingredients",
  "dosing",
  "sequence",
  "time_temperature",
  "quality",
  "storage",
  "catalog",
  "cost",
] as const;

const checklistKeySchema = z.enum(RECIPE_AUDIT_CHECKLIST_KEYS);
const checklistStatusSchema = z.enum(["pass", "warning", "missing"]);

const generatedRecipeAuditSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  findings: z.array(z.object({
    severity: z.enum(["high", "medium", "low"]),
    title: z.string().trim().min(1).max(160),
    detail: z.string().trim().min(1).max(500),
  }).strict()).max(5),
  checklist: z.array(z.object({
    key: checklistKeySchema,
    status: checklistStatusSchema,
    note: z.string().trim().min(1).max(280),
  }).strict()).length(RECIPE_AUDIT_CHECKLIST_KEYS.length),
  sop: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(700),
  }).strict()).max(6),
  qualityControls: z.array(z.object({
    label: z.string().trim().min(1).max(160),
    target: z.string().trim().min(1).max(400),
  }).strict()).max(5),
  missingData: z.array(z.string().trim().min(1).max(240)).max(6),
}).strict().superRefine((value, ctx) => {
  const seen = new Set(value.checklist.map((item) => item.key));
  for (const key of RECIPE_AUDIT_CHECKLIST_KEYS) {
    if (!seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checklist"],
        message: `Missing checklist key: ${key}`,
      });
    }
  }
  if (seen.size !== value.checklist.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["checklist"],
      message: "Recipe audit checklist contains duplicate keys.",
    });
  }
});

const CHECKLIST_META: Record<(typeof RECIPE_AUDIT_CHECKLIST_KEYS)[number], { label: string; weight: number }> = {
  ingredients: { label: "Nguyên liệu", weight: 15 },
  dosing: { label: "Định lượng", weight: 15 },
  sequence: { label: "Thứ tự thao tác", weight: 10 },
  time_temperature: { label: "Thời gian và nhiệt độ", weight: 15 },
  quality: { label: "Kiểm soát chất lượng", weight: 15 },
  storage: { label: "Bảo quản", weight: 10 },
  catalog: { label: "Liên kết catalog", weight: 10 },
  cost: { label: "Dữ liệu giá vốn", weight: 10 },
};

const STATUS_MULTIPLIER = {
  pass: 1,
  warning: 0.5,
  missing: 0,
} as const;

export type RecipeAuditContent = {
  schemaVersion: 1;
  kind: "recipe_audit";
  score: number;
  readiness: "ready" | "needs_attention" | "not_ready";
  summary: string;
  findings: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
  }>;
  checklist: Array<{
    key: (typeof RECIPE_AUDIT_CHECKLIST_KEYS)[number];
    label: string;
    status: "pass" | "warning" | "missing";
    note: string;
    weight: number;
  }>;
  sop: Array<{ id: string; title: string; content: string }>;
  qualityControls: Array<{ id: string; label: string; target: string }>;
  missingData: string[];
};

function stripJsonFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function extractJsonObject(value: string): string {
  const normalized = stripJsonFence(value);
  const first = normalized.indexOf("{");
  const last = normalized.lastIndexOf("}");
  if (first < 0 || last <= first) return normalized;
  return normalized.slice(first, last + 1);
}

export function parseRecipeAuditResponse(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch {
    throw new OrderEngineError(
      "AI_RECIPE_AUDIT_INVALID_JSON",
      422,
      "Recipe audit must be valid structured JSON.",
    );
  }

  const result = generatedRecipeAuditSchema.safeParse(parsed);
  if (!result.success) {
    throw new OrderEngineError(
      "AI_RECIPE_AUDIT_INVALID_SHAPE",
      422,
      "Recipe audit did not match the required health-check schema.",
      { issues: result.error.flatten() },
    );
  }
  return result.data;
}

export function buildRecipeAuditContent(text: string): RecipeAuditContent {
  const generated = parseRecipeAuditResponse(text);
  const checklistByKey = new Map(generated.checklist.map((item) => [item.key, item]));
  const checklist = RECIPE_AUDIT_CHECKLIST_KEYS.map((key) => {
    const item = checklistByKey.get(key)!;
    const meta = CHECKLIST_META[key];
    return {
      key,
      label: meta.label,
      status: item.status,
      note: item.note,
      weight: meta.weight,
    };
  });

  const score = Math.round(checklist.reduce(
    (total, item) => total + item.weight * STATUS_MULTIPLIER[item.status],
    0,
  ));
  const readiness = score >= 85 ? "ready" : score >= 60 ? "needs_attention" : "not_ready";

  return {
    schemaVersion: 1,
    kind: "recipe_audit",
    score,
    readiness,
    summary: generated.summary,
    findings: generated.findings.map((item, index) => ({
      id: `finding-${String(index + 1).padStart(2, "0")}`,
      ...item,
    })),
    checklist,
    sop: generated.sop.map((item, index) => ({
      id: `sop-${String(index + 1).padStart(2, "0")}`,
      ...item,
    })),
    qualityControls: generated.qualityControls.map((item, index) => ({
      id: `qc-${String(index + 1).padStart(2, "0")}`,
      ...item,
    })),
    missingData: generated.missingData,
  };
}
