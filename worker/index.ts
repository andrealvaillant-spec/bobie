/**
 * Le worker Bobie. Tourne sur une machine avec les outils de traitement
 * (ffmpeg, mlx-whisper) et dépile la file `jobs`, un job à la fois.
 *
 *   npm run worker            # tourne en continu
 *   npm run worker -- --once  # traite un job et s'arrête
 *
 * Chaîne d'un projet : probe → transcribe → edit → (review, côté humain)
 */
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { admin, localCopy, probe, putJson, getJson, privateFile, run, toWav, CACHE, ROOT, type Admin, type Media } from "./lib";
import { assemble, paramsFromProfile, type Transcript } from "./assemble";
import { decide, MODEL } from "./agent";
import type { Source } from "../src/lib/timeline";

type Job = { id: string; project_id: string; kind: string; payload: Record<string, unknown>; attempts: number };

const WORKER_ID = `${hostname()}-${process.pid}`;
const PYTHON = process.env.BOBIE_PYTHON ?? "python3";
const MAX_ATTEMPTS = 3;

const log = (job: Job | null, msg: string) =>
  console.log(`${new Date().toISOString().slice(11, 19)} ${job ? `[${job.kind} ${job.id.slice(0, 8)}]` : "[worker]"} ${msg}`);

async function progress(db: Admin, job: Job, pct: number, message: string) {
  log(job, message);
  await db.from("jobs").update({ progress: pct, message }).eq("id", job.id);
}

async function medias(db: Admin, projectId: string): Promise<Media[]> {
  const { data, error } = await db.from("media").select("*").eq("project_id", projectId).order("created_at");
  if (error) throw error;
  return data as Media[];
}

async function enqueue(db: Admin, projectId: string, kind: string) {
  const { error } = await db.from("jobs").insert({ project_id: projectId, kind });
  if (error) throw error;
}

// ---------------------------------------------------------------- étapes ---

async function stepProbe(db: Admin, job: Job) {
  const list = await medias(db, job.project_id);
  for (const [i, media] of list.entries()) {
    await progress(db, job, Math.round((i / list.length) * 100), `Lecture de ${media.filename}`);
    const path = await localCopy(db, media);
    const info = await probe(path);
    await db.from("media").update({
      duration_sec: info.durationSec,
      meta: { ...media.meta, probe: info },
      kind: info.hasVideo ? media.kind : "music",
    }).eq("id", media.id);
  }
  await db.from("projects").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", job.project_id);
  await enqueue(db, job.project_id, "transcribe");
}

async function stepTranscribe(db: Admin, job: Job) {
  // Les rushs sans piste son (b-rolls muets) n'ont rien à transcrire.
  const list = (await medias(db, job.project_id)).filter(
    (m) => m.kind !== "music" && (m.meta as { probe?: { hasAudio?: boolean } }).probe?.hasAudio !== false,
  );
  for (const [i, media] of list.entries()) {
    const target = `${job.project_id}/transcripts/${media.id}.json`;
    if ((media.meta as { transcript?: string }).transcript) continue;
    await progress(db, job, Math.round((i / list.length) * 100), `Transcription de ${media.filename}`);
    const wav = await toWav(await localCopy(db, media), media.id);
    const out = join(CACHE, "audio", `${media.id}.json`);
    await run(PYTHON, [join(ROOT, "worker", "transcribe.py"), wav, out], { maxBuffer: 1 << 26, timeout: 3 * 3600_000 });
    const transcript = JSON.parse(readFileSync(out, "utf8")) as Transcript;
    await putJson(db, target, transcript);
    await db.from("media").update({
      meta: { ...media.meta, transcript: target, words: transcript.words.length, language: transcript.language },
    }).eq("id", media.id);
  }
  await enqueue(db, job.project_id, "edit");
}

async function stepEdit(db: Admin, job: Job) {
  const { data: project, error } = await db.from("projects").select("*").eq("id", job.project_id).single();
  if (error) throw error;
  const list = (await medias(db, job.project_id)).filter((m) => (m.meta as { transcript?: string }).transcript);
  if (list.length === 0) throw new Error("Aucune transcription : rien à monter.");

  const transcripts: Record<string, Transcript> = {};
  for (const m of list) transcripts[m.id] = await getJson<Transcript>(db, (m.meta as { transcript: string }).transcript);

  const styleId = project.style_id ?? "lucidus";
  await progress(db, job, 20, `Bobie choisit les passages (${MODEL})`);
  const { decisions, usage, model } = await decide({
    brief: project.brief,
    format: project.format,
    styleId,
    medias: list.map((m) => ({ id: m.id, filename: m.filename, duration: m.duration_sec })),
    transcripts,
  });

  await progress(db, job, 70, `${decisions.edits.length} montage(s) décidé(s), assemblage`);
  const params = paramsFromProfile(privateFile(`profils/${styleId}.yaml`));
  const sources: Source[] = list.map((m) => {
    const p = (m.meta as { probe?: { width?: number; height?: number; fps?: number } }).probe ?? {};
    return {
      id: m.id,
      path: m.storage_path,
      label: m.filename,
      durationSec: m.duration_sec ?? undefined,
      fps: p.fps ?? undefined,
      width: p.width ?? undefined,
      height: p.height ?? undefined,
      role: m.kind === "b-roll" ? "b-roll" : "a-roll",
    };
  });

  const { data: last } = await db.from("timelines").select("revision").eq("project_id", job.project_id)
    .order("revision", { ascending: false }).limit(1).maybeSingle();
  const revision = (last?.revision ?? 0) + 1;

  const rows = decisions.edits.map((decision, i) => ({
    project_id: job.project_id,
    position: i + 1,
    revision,
    label: decision.title,
    author: "agent",
    data: {
      ...assemble({ decision, sources, transcripts, format: project.format, styleId, params }),
      agent: { hook: decision.hook, why: decision.why, keywords: decision.keywords, model },
    },
  }));
  if (rows.length) {
    const { error: insErr } = await db.from("timelines").insert(rows);
    if (insErr) throw insErr;
  }

  await db.from("jobs").update({
    result: { edits: rows.length, notes: decisions.notes, usage, model },
  }).eq("id", job.id);
  await db.from("projects").update({ status: "review", updated_at: new Date().toISOString() }).eq("id", job.project_id);
}

const STEPS: Record<string, (db: Admin, job: Job) => Promise<void>> = {
  probe: stepProbe,
  transcribe: stepTranscribe,
  edit: stepEdit,
};

// ---------------------------------------------------------------- boucle ---

async function tick(db: Admin): Promise<boolean> {
  const { data, error } = await db.rpc("claim_job", { worker: WORKER_ID });
  if (error) throw error;
  const job = (data as Job[])[0];
  if (!job) return false;

  // Sans clé API, l'étape de décision attend dans la file au lieu d'échouer.
  if (job.kind === "edit" && !process.env.ANTHROPIC_API_KEY) {
    await db.from("jobs").update({
      status: "queued",
      attempts: job.attempts - 1,
      worker_id: null,
      message: "En attente de la clé API Claude",
    }).eq("id", job.id);
    return false;
  }

  const step = STEPS[job.kind];
  try {
    if (!step) throw new Error(`Étape « ${job.kind} » pas encore branchée.`);
    await step(db, job);
    await db.from("jobs").update({ status: "done", progress: 100, finished_at: new Date().toISOString() }).eq("id", job.id);
    log(job, "terminé");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retry = job.attempts < MAX_ATTEMPTS && step !== undefined;
    log(job, `ERREUR${retry ? " (nouvel essai)" : ""} : ${message}`);
    await db.from("jobs").update({
      status: retry ? "queued" : "error",
      error: message,
      finished_at: new Date().toISOString(),
    }).eq("id", job.id);
    if (!retry) await db.from("projects").update({ status: "error" }).eq("id", job.project_id);
  }
  return true;
}

async function main() {
  const db = admin();
  const once = process.argv.includes("--once");
  log(null, `démarré (${WORKER_ID}), style privé ${privateFile("README.md") ? "monté" : "absent"}`);
  for (;;) {
    const worked = await tick(db).catch((err) => {
      log(null, `boucle : ${err instanceof Error ? err.message : err}`);
      return false;
    });
    if (once && worked) break;
    if (!worked) await new Promise((r) => setTimeout(r, 5000));
  }
}

main();
