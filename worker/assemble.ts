/**
 * Transforme les décisions de l'agent (quels passages garder, quels mots
 * appuyer) en timeline complète. Le jugement vient de Claude ; l'exécution
 * (bornes calées sur la parole, cartons, zooms) est déterministe, réglée par
 * les paramètres du style.
 */
import { parse as parseYaml } from "yaml";
import {
  TIMELINE_VERSION,
  parseTimeline,
  type Caption,
  type Clip,
  type Source,
  type Timeline,
  type Zoom,
} from "../src/lib/timeline";

export type Word = { w: string; t: number; e: number };
export type Transcript = { language?: string; segments: { start: number; end: number; text: string }[]; words: Word[] };

export type Segment = { media_id: string; start: number; end: number; reason: string };
export type EditDecision = { title: string; hook: string; why: string; segments: Segment[]; keywords: string[] };

/** Réglages d'exécution. Les valeurs réelles d'un style vivent dans le dépôt privé. */
export type StyleParams = {
  margeAvant: number;
  margeApres: number;
  motsParCarton: number;
  cartonMaxSec: number;
  partMotCle: number;
  zoomSurCoupe: number;
  zoomDureeSec: number;
  pushSiPlanPlusLongQue: number;
  captionY: number;
};

export const DEFAULTS: StyleParams = {
  margeAvant: 0.1,
  margeApres: 0.1,
  motsParCarton: 2,
  cartonMaxSec: 0.8,
  partMotCle: 0.15,
  zoomSurCoupe: 0.5,
  zoomDureeSec: 2.5,
  pushSiPlanPlusLongQue: 4,
  captionY: 0.6,
};

/** Lit les réglages d'un profil YAML privé (clés du profil → StyleParams). */
export function paramsFromProfile(yamlText: string | null): StyleParams {
  if (!yamlText) return DEFAULTS;
  const p = parseYaml(yamlText) ?? {};
  const punch = p?.zooms?.presets?.punch;
  return {
    margeAvant: p?.coupes?.marge_avant_sec ?? DEFAULTS.margeAvant,
    margeApres: p?.coupes?.marge_apres_sec ?? DEFAULTS.margeApres,
    motsParCarton: Math.max(...(p?.sous_titres?.mots_par_carton ?? [DEFAULTS.motsParCarton])),
    cartonMaxSec: (p?.sous_titres?.duree_carton_sec ?? DEFAULTS.cartonMaxSec / 1.5) * 1.5,
    partMotCle: p?.sous_titres?.part_mot_cle_agrandi ?? DEFAULTS.partMotCle,
    zoomSurCoupe: p?.zooms?.part_sur_une_coupe ?? DEFAULTS.zoomSurCoupe,
    zoomDureeSec: punch?.duree_sec ?? DEFAULTS.zoomDureeSec,
    pushSiPlanPlusLongQue: p?.rythme?.duree_plan_p90_sec ?? DEFAULTS.pushSiPlanPlusLongQue,
    captionY: p?.sous_titres?.position?.y ?? DEFAULTS.captionY,
  };
}

/** Forme de comparaison : minuscules, sans accents, sans élision (« d'excellence » → « excellence »). */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(?:[a-z]|qu|jusqu|lorsqu|puisqu)['’]/, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Whisper coupe les élisions françaises : « d » + « 'excellence », « c » + « 'est ».
 * On les recolle pour que les cartons ne s'arrêtent jamais au milieu d'un mot.
 */
export function mergeElisions(words: Word[]): Word[] {
  const out: Word[] = [];
  for (const word of words) {
    const prev = out[out.length - 1];
    if (prev && (/^['’]/.test(word.w) || /['’]$/.test(prev.w))) {
      out[out.length - 1] = { w: prev.w + word.w, t: prev.t, e: word.e };
    } else {
      out.push({ ...word });
    }
  }
  return out;
}

/** Cale un passage sur la parole : du début du premier mot à la fin du dernier, plus les marges. */
function snap(seg: Segment, words: Word[], params: StyleParams, duration: number) {
  const inside = mergeElisions(words.filter((w) => w.e > seg.start && w.t < seg.end));
  if (inside.length === 0) return null;
  const sourceIn = Math.max(0, inside[0].t - params.margeAvant);
  const sourceOut = Math.min(duration || Infinity, inside[inside.length - 1].e + params.margeApres);
  return { sourceIn, sourceOut, words: inside };
}

export function assemble(opts: {
  decision: EditDecision;
  sources: Source[];
  transcripts: Record<string, Transcript>;
  format: Timeline["format"];
  styleId: string;
  params: StyleParams;
}): Timeline {
  const { decision, sources, transcripts, params } = opts;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const keywords = new Set(decision.keywords.map(norm).filter(Boolean));

  const clips: Clip[] = [];
  const captions: Caption[] = [];
  const zooms: Zoom[] = [];
  let cursor = 0;
  let zoomBudget = 0;

  decision.segments.forEach((seg, i) => {
    const source = byId.get(seg.media_id);
    const transcript = transcripts[seg.media_id];
    if (!source || !transcript) return;
    const snapped = snap(seg, transcript.words, params, source.durationSec ?? 0);
    if (!snapped) return;
    const { sourceIn, sourceOut, words } = snapped;
    const length = sourceOut - sourceIn;

    clips.push({
      id: `c${i + 1}`,
      sourceId: source.id,
      sourceIn,
      sourceOut,
      start: cursor,
      track: 1,
      gain: 1,
      reason: seg.reason,
    });

    // Cartons : 1 à N mots, collés les uns aux autres.
    let group: Word[] = [];
    const flush = () => {
      if (group.length === 0) return;
      const text = group.map((w) => w.w).join(" ");
      captions.push({
        id: `t${captions.length + 1}`,
        text,
        start: cursor + (group[0].t - sourceIn),
        end: cursor + (group[group.length - 1].e - sourceIn),
        x: 0.5,
        y: params.captionY,
        emphasis: group.some((w) => keywords.has(norm(w.w))),
      });
      group = [];
    };
    for (const word of words) {
      const span = group.length ? word.e - group[0].t : 0;
      const isKey = keywords.has(norm(word.w));
      if (group.length >= params.motsParCarton || span > params.cartonMaxSec || isKey) flush();
      group.push(word);
      if (isKey) flush(); // un mot-clé a son carton à lui
    }
    flush();

    // Zooms : un sur une partie des coupes, un « push » sur les plans longs.
    zoomBudget += params.zoomSurCoupe;
    if (i > 0 && zoomBudget >= 1) {
      zoomBudget -= 1;
      zooms.push({ id: `z${zooms.length + 1}`, start: cursor, end: cursor + Math.min(length, params.zoomDureeSec), preset: "punch" });
    } else if (length > params.pushSiPlanPlusLongQue) {
      zooms.push({ id: `z${zooms.length + 1}`, start: cursor, end: cursor + length, preset: "push" });
    }

    cursor += length;
  });

  // Cartons collés : chacun tient jusqu'au suivant (sans dépasser la fin).
  captions.forEach((c, k) => {
    const next = captions[k + 1];
    if (next && next.start > c.end && next.start - c.end < 0.4) c.end = next.start;
  });

  // Plafonne la part de mots-clés (sinon tout est « important »).
  const maxKeys = Math.max(1, Math.round(captions.length * params.partMotCle));
  captions.filter((c) => c.emphasis).slice(maxKeys).forEach((c) => (c.emphasis = false));

  const usedSources = sources.filter((s) => clips.some((c) => c.sourceId === s.id));
  const vertical = opts.format === "short";

  return parseTimeline({
    version: TIMELINE_VERSION,
    format: opts.format,
    styleId: opts.styleId,
    fps: 30,
    width: vertical ? 1080 : 1920,
    height: vertical ? 1920 : 1080,
    durationSec: cursor,
    sources: usedSources,
    clips,
    captions,
    zooms,
    music: null,
    notes: `${decision.title} — ${decision.why}`,
  });
}
