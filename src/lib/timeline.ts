/**
 * La timeline Bobie — la source de vérité du montage.
 *
 * Tout passe par ce format : l'agent produit une timeline, et les sorties
 * (rendu Remotion → MP4, export Premiere → XML, aperçu web) n'en sont que des
 * traductions. Premiere n'est plus qu'une sortie possible parmi d'autres.
 *
 * Unité de temps : la SECONDE, en flottant, partout.
 *   - `source` = position dans le rush d'origine
 *   - `start`  = position sur la timeline de sortie
 */
import { z } from "zod";

export const TIMELINE_VERSION = 1 as const;

/** Un rush d'entrée. `id` est référencé par les plans. */
export const SourceSchema = z.object({
  id: z.string().min(1),
  /** Chemin de stockage (bucket Supabase) ou URL signée. */
  path: z.string().min(1),
  label: z.string().optional(),
  durationSec: z.number().positive().optional(),
  fps: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Rôle du rush : A-roll = le sujet qui parle, B-roll = l'illustration. */
  role: z.enum(["a-roll", "b-roll", "music", "sfx"]).default("a-roll"),
});
export type Source = z.infer<typeof SourceSchema>;

/** Un plan posé sur la timeline. */
export const ClipSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  /** Bornes DANS le rush. */
  sourceIn: z.number().min(0),
  sourceOut: z.number().min(0),
  /** Position sur la timeline de sortie. */
  start: z.number().min(0),
  track: z.number().int().min(1).default(1),
  /** Volume linéaire (1 = tel quel). */
  gain: z.number().min(0).default(1),
  /** Pourquoi ce plan est là — écrit par l'agent, lisible par un humain. */
  reason: z.string().optional(),
});
export type Clip = z.infer<typeof ClipSchema>;

/**
 * Un carton de sous-titre.
 * Mesuré sur 516 shorts : 1-2 mots, 0,52 s, centré, y ≈ 0,56, cartons collés
 * voire chevauchants, et 1 carton sur 5 est un mot-clé agrandi (~220 %).
 */
export const CaptionSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
  /** Position relative dans le cadre (0-1). */
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.56),
  /** Mot-clé mis en avant : agrandi et coloré selon le style. */
  emphasis: z.boolean().default(false),
});
export type Caption = z.infer<typeof CaptionSchema>;

/**
 * Un zoom. Toujours posé sur un calque d'effets, pour que les sous-titres
 * zooment aussi. Deux presets mesurés : "punch" (100→131→106 sur 2,84 s) et
 * "push" (100→115).
 */
export const ZoomSchema = z.object({
  id: z.string().min(1),
  start: z.number().min(0),
  end: z.number().min(0),
  preset: z.enum(["punch", "push", "custom"]).default("punch"),
  /** Échelles en %, du début à la fin. Ignoré hors preset "custom". */
  keyframes: z.array(z.object({ t: z.number().min(0), scale: z.number().positive() })).optional(),
});
export type Zoom = z.infer<typeof ZoomSchema>;

export const MusicSchema = z.object({
  sourceId: z.string().min(1),
  start: z.number().min(0).default(0),
  gain: z.number().min(0).default(0.12),
  /** Baisse automatique du volume sous la voix. */
  duck: z.boolean().default(true),
});

export const TimelineSchema = z.object({
  version: z.literal(TIMELINE_VERSION),
  /** Format = la structure (short, podcast, VSL…). */
  format: z.enum(["short", "long", "podcast", "vsl"]),
  /** Style = l'habillage et le rythme (lucidus, teh-rouge, marcus-violet…). */
  styleId: z.string().min(1),
  fps: z.number().positive().default(30),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  durationSec: z.number().min(0),
  sources: z.array(SourceSchema),
  clips: z.array(ClipSchema),
  captions: z.array(CaptionSchema).default([]),
  zooms: z.array(ZoomSchema).default([]),
  music: MusicSchema.nullable().default(null),
  /** Traçabilité : ce que l'agent a décidé et pourquoi. */
  notes: z.string().optional(),
});
export type Timeline = z.infer<typeof TimelineSchema>;

/** Vérifie une timeline et rend des erreurs lisibles. */
export function parseTimeline(input: unknown): Timeline {
  const timeline = TimelineSchema.parse(input);
  const sourceIds = new Set(timeline.sources.map((s) => s.id));
  for (const clip of timeline.clips) {
    if (!sourceIds.has(clip.sourceId)) {
      throw new Error(`Plan ${clip.id} : rush « ${clip.sourceId} » introuvable.`);
    }
    if (clip.sourceOut <= clip.sourceIn) {
      throw new Error(`Plan ${clip.id} : sourceOut doit être après sourceIn.`);
    }
  }
  if (timeline.music && !sourceIds.has(timeline.music.sourceId)) {
    throw new Error(`Musique : rush « ${timeline.music.sourceId} » introuvable.`);
  }
  return timeline;
}

/** Durée d'un plan sur la timeline de sortie. */
export function clipDuration(clip: Clip): number {
  return clip.sourceOut - clip.sourceIn;
}

/**
 * Mesures d'un montage, au même vocabulaire que le modèle de style
 * (~/Desktop/agent-monteur). Sert à noter un candidat sans l'ouvrir.
 */
export function measure(timeline: Timeline) {
  const durations = timeline.clips.map(clipDuration).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
  const minutes = timeline.durationSec / 60 || 1;
  const brollIds = new Set(
    timeline.sources.filter((s) => s.role === "b-roll").map((s) => s.id),
  );
  const brolls = timeline.clips.filter((c) => brollIds.has(c.sourceId));
  const brollCoverage = brolls.reduce((sum, c) => sum + clipDuration(c), 0) / (timeline.durationSec || 1);
  return {
    clips: timeline.clips.length,
    cutsPerMin: timeline.clips.length / minutes,
    medianClipSec: median,
    brollPerMin: brolls.length / minutes,
    brollCoverage,
    captionsPerMin: timeline.captions.length / minutes,
    zoomsPerMin: timeline.zooms.length / minutes,
    hasMusic: timeline.music !== null,
  };
}
