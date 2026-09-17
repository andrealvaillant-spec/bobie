#!/usr/bin/env node
/**
 * Applique les migrations SQL de supabase/migrations dans l'ordre, une seule
 * fois chacune (table _migrations). Lit DATABASE_URL depuis .env.local.
 *
 *   npm run migrate
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* fichier absent : on continue */
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL manquant (à mettre dans .env.local — session pooler Supabase).");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(`
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );
`);

const done = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name));
const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  if (done.has(file)) {
    console.log(`· ${file} (déjà appliquée)`);
    continue;
  }
  const sql = readFileSync(join(dir, file), "utf8");
  process.stdout.write(`→ ${file} … `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into _migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log("ok");
  } catch (error) {
    await client.query("rollback");
    console.log("ÉCHEC");
    console.error(error.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("Migrations à jour.");
