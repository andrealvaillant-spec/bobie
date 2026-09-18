/**
 * Outils communs du worker : configuration, client Supabase (service role),
 * cache local des rushs, appels ffmpeg.
 */
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env.local → process.env (sans écraser ce qui est déjà défini)
for (const file of [".env.local", ".env"]) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

export const CACHE = process.env.BOBIE_CACHE ?? join(homedir(), ".bobie-worker");
mkdirSync(CACHE, { recursive: true });

export const FFMPEG = process.env.FFMPEG ?? (existsSync(join(homedir(), ".local/bin/ffmpeg"))
  ? join(homedir(), ".local/bin/ffmpeg")
  : "ffmpeg");

export const run = promisify(execFile);

export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  return createClient(url, key, { auth: { persistSession: false } });
}
export type Admin = ReturnType<typeof admin>;

export type Media = {
  id: string;
  project_id: string;
  storage_path: string;
  filename: string;
  kind: string;
  duration_sec: number | null;
  bytes: number | null;
  meta: Record<string, unknown>;
};

/** Télécharge un rush dans le cache local (une seule fois). */
export async function localCopy(db: Admin, media: Media): Promise<string> {
  const path = join(CACHE, "rushes", media.storage_path);
  if (existsSync(path) && (!media.bytes || statSync(path).size === Number(media.bytes))) return path;
  mkdirSync(dirname(path), { recursive: true });
  const { data, error } = await db.storage.from("rushes").createSignedUrl(media.storage_path, 3600);
  if (error || !data) throw new Error(`URL signée impossible : ${error?.message}`);
  const response = await fetch(data.signedUrl);
  if (!response.ok || !response.body) throw new Error(`Téléchargement échoué : HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(path));
  return path;
}

/** Lit durée, résolution et cadence avec `ffmpeg -i` (ffprobe n'est pas installé). */
export async function probe(path: string) {
  let stderr = "";
  try {
    await run(FFMPEG, ["-hide_banner", "-i", path]);
  } catch (error) {
    // ffmpeg -i sans sortie « échoue » toujours : les infos sont dans stderr.
    stderr = (error as { stderr?: string }).stderr ?? "";
  }
  const duration = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = stderr.match(/Video: .*?(\d{2,5})x(\d{2,5})/);
  const fps = stderr.match(/(\d+(?:\.\d+)?) fps/);
  return {
    durationSec: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null,
    width: video ? Number(video[1]) : null,
    height: video ? Number(video[2]) : null,
    fps: fps ? Number(fps[1]) : null,
    hasAudio: /Audio: /.test(stderr),
    hasVideo: Boolean(video),
  };
}

/** Audio 16 kHz mono pour Whisper. */
export async function toWav(path: string, id: string): Promise<string> {
  const out = join(CACHE, "audio", `${id}.wav`);
  if (existsSync(out) && statSync(out).size > 1000) return out;
  mkdirSync(dirname(out), { recursive: true });
  await run(FFMPEG, ["-v", "error", "-y", "-i", path, "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", out], {
    maxBuffer: 1 << 24,
  });
  return out;
}

/** Écrit un JSON dans le seau `deliverables`. */
export async function putJson(db: Admin, path: string, value: unknown) {
  const { error } = await db.storage
    .from("deliverables")
    .upload(path, JSON.stringify(value), { contentType: "application/json", upsert: true });
  if (error) throw new Error(`Écriture ${path} impossible : ${error.message}`);
}

export async function getJson<T>(db: Admin, path: string): Promise<T> {
  const { data, error } = await db.storage.from("deliverables").download(path);
  if (error || !data) throw new Error(`Lecture ${path} impossible : ${error?.message}`);
  return JSON.parse(await data.text()) as T;
}

/** Le dépôt privé des recettes, monté sous style/. Absent = valeurs par défaut. */
export function privateFile(relative: string): string | null {
  const path = join(ROOT, "style", relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
