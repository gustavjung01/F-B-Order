import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

for (const envPath of [
  path.join(repoRoot, ".env"),
  path.join(backendRoot, ".env"),
  path.join(backendRoot, ".env.local"),
]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

function resolveSqlFile(fileArg) {
  if (!fileArg) return null;
  if (path.isAbsolute(fileArg)) return fileArg;
  if (fileArg.startsWith("db/") || fileArg.startsWith("apps/") || fileArg.startsWith("packages/")) {
    return path.join(repoRoot, fileArg);
  }
  return path.resolve(process.cwd(), fileArg);
}

const sqlFile = resolveSqlFile(process.argv[2]);
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;

if (!sqlFile) {
  console.error("Missing SQL file path. Example: npm run db:migrate");
  process.exit(1);
}

if (!fs.existsSync(sqlFile)) {
  console.error(`SQL file not found: ${sqlFile}`);
  process.exit(1);
}

if (!connectionString) {
  console.error("DATABASE_URL or BEPSI_DATABASE_URL is not configured.");
  console.error("Set it in PowerShell or apps/backend/.env before running this script.");
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, "utf8");
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  max: 1,
});

try {
  console.log(`Running SQL: ${path.relative(repoRoot, sqlFile)}`);
  await pool.query(sql);
  console.log("SQL completed successfully.");
} catch (error) {
  console.error("SQL failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
