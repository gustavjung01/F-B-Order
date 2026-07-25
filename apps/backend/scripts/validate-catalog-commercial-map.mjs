import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCatalogCommercialPayload } from "./catalog-commercial-map.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const inputPath = path.resolve(arg(
  "file",
  path.join(repoRoot, "data/private/catalog-imports/kenh-quan-commercial-map.json"),
));

if (!fs.existsSync(inputPath)) {
  console.error(JSON.stringify({
    status: "FAILED",
    code: "CATALOG_COMMERCIAL_FILE_MISSING",
    message: `Commercial map file is missing: ${inputPath}`,
  }, null, 2));
  process.exitCode = 1;
} else {
  try {
    const raw = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
    const payload = normalizeCatalogCommercialPayload(raw);
    console.log(JSON.stringify({
      status: "PAYLOAD_VALID",
      inputPath,
      schemaVersion: payload.schemaVersion,
      sourceKey: payload.sourceKey,
      payloadHash: payload.payloadHash,
      rowCount: payload.rows.length,
      note: "Validation only. No database connection was opened.",
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: "FAILED",
      code: error?.code || "CATALOG_COMMERCIAL_PAYLOAD_INVALID",
      message: error instanceof Error ? error.message : String(error),
      details: error?.details,
    }, null, 2));
    process.exitCode = 1;
  }
}
