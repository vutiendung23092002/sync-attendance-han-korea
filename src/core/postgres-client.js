import pg from "pg";
import { env } from "../config/env.js";

let pool;

export function getPostgresConnectionInfo() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    env.SUPABASE.DB_URL;

  const source = process.env.DATABASE_URL
    ? "DATABASE_URL"
    : process.env.SUPABASE_DB_URL
    ? "SUPABASE_DB_URL"
    : process.env.POSTGRES_URL
    ? "POSTGRES_URL"
    : env.SUPABASE.DB_URL
    ? "env.SUPABASE.DB_URL"
    : null;

  return { connectionString, source };
}

function getPool() {
  const { connectionString } = getPostgresConnectionInfo();

  if (!connectionString) {
    throw new Error(
      "Missing PostgreSQL connection string. Set DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL in .env."
    );
  }

  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      max: 1,
      ssl:
        process.env.POSTGRES_SSL === "false"
          ? false
          : { rejectUnauthorized: false },
    });
  }

  return pool;
}

export async function queryPostgres(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

export async function closePostgresPool() {
  if (pool) await pool.end();
}
