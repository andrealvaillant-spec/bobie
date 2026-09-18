/**
 * Le jugement de montage : Claude lit les transcriptions et le brief, et
 * décide quels passages garder, dans quel ordre, et quels mots appuyer.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { privateFile } from "./lib";
import type { EditDecision, Transcript } from "./assemble";

export const MODEL = process.env.BOBIE_MODEL ?? "claude-opus-5";

const DecisionSchema = z.object({
  edits: z.array(
    z.object({
      title: z.string(),
      hook: z.string(),
      why: z.string(),
      segments: z.array(
        z.object({ media_id: z.string(), start: z.number(), end: z.number(), reason: z.string() }),
      ),
      keywords: z.array(z.string()),
    }),
  ),
  notes: z.string(),
});
export type Decisions = { edits: EditDecision[]; notes: string };

/** Consigne publique minimale ; la vraie consigne est dans le dépôt privé. */
const FALLBACK_PROMPT = `Tu es Bobie, monteur vidéo. On te donne des rushs transcrits (avec les temps en secondes) et un brief.
Choisis les passages à garder pour produire les montages demandés.
- Un montage = une suite de passages (media_id, start, end) dans l'ordre de diffusion. Tu peux réordonner.
- Ouvre sur une accroche forte dans les 3 premières secondes.
- Coupe les hésitations, les répétitions et les blancs : un passage = une idée.
- Pour un short, vise 20 à 45 secondes sauf indication contraire du brief.
- keywords : les quelques mots qui portent le sens, à mettre en avant à l'écran.
- reason : pourquoi ce passage est là, en une phrase.
Respecte le brief avant tout.`;

function renderTranscripts(medias: { id: string; filename: string; duration: number | null }[], transcripts: Record<string, Transcript>) {
  return medias
    .map((m) => {
      const t = transcripts[m.id];
      const lines = (t?.segments ?? []).map((s) => `[${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text}`);
      return `<rush media_id="${m.id}" fichier="${m.filename}" duree="${m.duration?.toFixed(1) ?? "?"}s">\n${lines.join("\n")}\n</rush>`;
    })
    .join("\n\n");
}

export async function decide(opts: {
  brief: string | null;
  format: string;
  styleId: string;
  medias: { id: string; filename: string; duration: number | null }[];
  transcripts: Record<string, Transcript>;
}): Promise<{ decisions: Decisions; usage: Anthropic.Beta.BetaUsage; model: string }> {
  const client = new Anthropic();
  const system = privateFile("prompts/edit.md") ?? FALLBACK_PROMPT;
  const profile = privateFile(`profils/${opts.styleId}.yaml`);

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(DecisionSchema) },
    system: [
      { type: "text", text: system },
      ...(profile ? [{ type: "text" as const, text: `<profil_de_style>\n${profile}\n</profil_de_style>` }] : []),
    ],
    messages: [
      {
        role: "user",
        content: `<brief format="${opts.format}" style="${opts.styleId}">\n${opts.brief || "Aucun brief : fais au mieux pour ce format."}\n</brief>\n\n${renderTranscripts(opts.medias, opts.transcripts)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`L'agent a refusé : ${response.stop_details?.explanation ?? "sans détail"}`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Réponse tronquée (max_tokens) : trop de montages demandés d'un coup ?");
  }
  if (!response.parsed_output) throw new Error("Réponse de l'agent illisible.");
  return { decisions: response.parsed_output, usage: response.usage, model: response.model };
}
