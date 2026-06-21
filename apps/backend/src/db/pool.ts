import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

let pool: Pool | null = null;

export function getDb(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or BEPSI_DATABASE_URL is required");
  }

  pool = new Pool({
    connectionString,
    ssl:
      connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX || 10),
  });

  return pool;
}
