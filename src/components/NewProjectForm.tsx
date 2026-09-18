"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type StyleOption = { id: string; name: string; format: string; available: boolean };

const FORMATS = [
  { id: "short", libelle: "Short form" },
  { id: "long", libelle: "Long form" },
  { id: "podcast", libelle: "Podcast" },
  { id: "vsl", libelle: "VSL" },
];

/** Nom de fichier sûr pour le stockage (pas d'accents NFD, pas d'espaces). */
function cleanName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function taille(bytes: number) {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} Go`;
  return `${Math.round(bytes / 1e6)} Mo`;
}

export function NewProjectForm({
  workspaceId,
  styles,
}: {
  workspaceId: string;
  styles: StyleOption[];
}) {
  const router = useRouter();
  const [format, setFormat] = useState("short");
  const [files, setFiles] = useState<File[]>([]);
  const [etape, setEtape] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const stylesDuFormat = styles.filter((s) => s.format === format);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErreur(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setEtape("Création du projet…");
    const { data: projet, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        name: String(form.get("name")),
        brief: String(form.get("brief") ?? "") || null,
        format,
        style_id: String(form.get("style") ?? "") || null,
        created_by: user?.id,
      })
      .select("id")
      .single();
    if (error || !projet) {
      setEtape(null);
      setErreur(error?.message ?? "Création impossible.");
      return;
    }

    for (const [i, file] of files.entries()) {
      setEtape(`Envoi des rushs ${i + 1}/${files.length} — ${file.name}`);
      const path = `${projet.id}/${Date.now()}_${cleanName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("rushes").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        setEtape(null);
        setErreur(`« ${file.name} » n'est pas passé : ${upErr.message}`);
        return;
      }
      await supabase.from("media").insert({
        project_id: projet.id,
        storage_path: path,
        filename: file.name,
        kind: file.type.startsWith("audio/") ? "music" : "a-roll",
        bytes: file.size,
      });
    }

    setEtape("Mise en file…");
    const { error: qErr } = await supabase.rpc("queue_project", { target: projet.id });
    if (qErr) {
      setEtape(null);
      setErreur(qErr.message);
      return;
    }
    router.push("/studio");
    router.refresh();
  }

  const champ = {
    borderColor: "var(--line-strong)",
    background: "var(--surface)",
  } as const;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Nom du projet</span>
        <input name="name" required placeholder="Ex. Clips podcast épisode 12"
          className="h-11 rounded-[8px] border px-3 text-sm outline-none" style={champ} />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Type de montage</span>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              aria-pressed={format === f.id}
              className="h-9 rounded-[8px] border px-3 text-sm font-medium"
              style={
                format === f.id
                  ? { background: "var(--ink)", color: "var(--on-ink)", borderColor: "var(--ink)" }
                  : champ
              }
            >
              {f.libelle}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Style</span>
        <select name="style" className="h-11 rounded-[8px] border px-3 text-sm" style={champ}
          key={format} defaultValue={stylesDuFormat.find((s) => s.available)?.id ?? ""}>
          {stylesDuFormat.length === 0 && <option value="">Aucun style pour ce format</option>}
          {stylesDuFormat.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.available}>
              {s.name}
              {s.available ? "" : " — bientôt"}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Brief</span>
        <textarea name="brief" rows={4}
          placeholder="Ex. 5 shorts de 30 s max, garder les passages où il parle d'argent, ton direct."
          className="rounded-[8px] border px-3 py-2 text-sm outline-none" style={champ} />
      </label>

      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed p-8 text-center"
        style={{ borderColor: "var(--accent-line)", background: "var(--accent-soft)" }}
      >
        <span className="text-sm font-semibold">Dépose tes rushs</span>
        <span className="text-xs" style={{ color: "var(--text-2)" }}>
          Vidéo et audio. Plusieurs fichiers possibles.
        </span>
        <input type="file" multiple accept="video/*,audio/*" className="sr-only"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      </label>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((f) => (
            <li key={f.name} className="flex gap-3">
              <span className="flex-1 truncate">{f.name}</span>
              <span className="mono" style={{ color: "var(--text-3)" }}>{taille(f.size)}</span>
            </li>
          ))}
        </ul>
      )}

      {erreur && (
        <p className="rounded-[8px] px-4 py-3 text-sm" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
          {erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={etape !== null || files.length === 0}
        className="h-11 rounded-[8px] text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--grad)", color: "var(--on-grad)" }}
      >
        {etape ?? "Lancer Bobie"}
      </button>
    </form>
  );
}
