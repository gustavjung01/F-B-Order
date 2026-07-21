import dotenv from "dotenv";
import { Pool, type PoolConfig } from "pg";

dotenv.config();

let pool: Pool | null = null;

function buildSslConfig(connectionString: string): PoolConfig["ssl"] {
  if (connectionString.includes("localhost") || connectionString.includes("127.0.0.1")) {
    return false;
  }

  const allowInsecure = process.env.DB_SSL_REJECT_UNAUTHORIZED === "false";
  const ca = process.env.DB_SSL_CA?.replace(/\n/g, "\n");
  return {
    rejectUnauthorized: !allowInsecure,
    ...(ca ? { ca } : {}),
  };
}

export function getDb(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or BEPSI_DATABASE_URL is required");
  }

  pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: Number(process.env.DB_POOL_MAX || 10),
  });

  return pool;
}
