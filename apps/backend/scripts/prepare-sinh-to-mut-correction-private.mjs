import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const manifestPath = path.resolve(repoRoot, "data/catalog-remap/sinh-to-mut-correction-01.json");
const sourcePath = path.resolve(repoRoot, "data/private/catalog-imports/sinh-to-mut-batch-01.private.json");
const targetPath = path.resolve(repoRoot, "data/private/catalog-imports/sinh-to-mut-correction-01.private.json");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function fail(message) {
  console.error(`[prepare-sinh-to-mut-correction-private] ${message}`);
  process.exit(1);
}

for (const required of [manifestPath, sourcePath]) {
  if (!fs.existsSync(required)) fail(`Không tìm thấy file: ${required}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
if (!Array.isArray(manifest.rows) || manifest.rows.length !== 25) fail("Manifest correction phải có 25 dòng.");
if (!Array.isArray(source.rows)) fail("Private payload nguồn không có rows.");

const sourceBySku = new Map(source.rows.map((row) => [String(row.canonicalSku || row.sku || "").trim().toUpperCase(), row]));
const rows = manifest.rows.map((expected) => {
  const key = String(expected.canonicalSku).toUpperCase();
  const current = sourceBySku.get(key);
  if (!current) fail(`Private payload nguồn thiếu ${expected.canonicalSku}.`);
  const next = {
    ...current,
    sku: expected.canonicalSku,
    canonicalSku: expected.canonicalSku,
    action: expected.action,
    legacySku: expected.legacySku || "",
    name: expected.name,
    group: manifest.catalogGroupName,
    detailGroup: expected.detailGroup,
    status: "ready",
    measureMode: expected.measureMode || "measured",
    sellUnit: expected.sellUnit,
    netQuantity: expected.netQuantity,
    netUnit: expected.netUnit,
    packageQuantity: expected.packageQuantity,
    packageUnit: expected.packageUnit,
    sourceRow: expected.sourceRow,
  };
  next.derivedPackagePrice = Math.round(Number(next.unitPrice) * Number(next.packageQuantity));
  if (!Number.isFinite(Number(next.unitPrice)) || Number(next.unitPrice) <= 0) fail(`Giá lẻ không hợp lệ cho ${expected.canonicalSku}.`);
  return next;
});

const payload = {
  schemaVersion: 1,
  taskId: manifest.taskId,
  sourceKey: `${String(source.sourceKey || "sinh-to-mut").replace(/-correction-01$/i, "")}-correction-01`,
  sourceFile: source.sourceFile || null,
  rows,
};
payload.payloadHash = sha256({ schemaVersion: payload.schemaVersion, sourceKey: payload.sourceKey, rows: payload.rows });

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
if (fs.existsSync(targetPath)) {
  const backup = `${targetPath}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  fs.copyFileSync(targetPath, backup);
  console.log(`[prepare-sinh-to-mut-correction-private] Backup: ${backup}`);
}
fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log("[prepare-sinh-to-mut-correction-private] PASS");
console.log(`[prepare-sinh-to-mut-correction-private] Source: ${sourcePath}`);
console.log(`[prepare-sinh-to-mut-correction-private] Target: ${targetPath}`);
console.log(`[prepare-sinh-to-mut-correction-private] Rows: ${rows.length}`);
console.log(`[prepare-sinh-to-mut-correction-private] UPDATE_EXISTING: ${rows.filter((row) => row.action === "UPDATE_EXISTING").length}`);
console.log(`[prepare-sinh-to-mut-correction-private] REMAP: ${rows.filter((row) => row.action === "REMAP").length}`);
console.log(`[prepare-sinh-to-mut-correction-private] Payload hash: ${payload.payloadHash}`);
console.log("[prepare-sinh-to-mut-correction-private] Không ghi database, production hoặc R2.");
