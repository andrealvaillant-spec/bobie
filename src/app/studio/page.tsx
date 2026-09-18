import Image from "next/image";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: "Studio — Bobie" };

type Projet = {
  id: string;
  name: string;
  format: string;
  status: string;
  created_at: string;
};

const STATUTS: Record<string, { libelle: string; fond: string; texte: string }> = {
  draft: { libelle: "Brouillon", fond: "var(--surface-2)", texte: "var(--text-2)" },
  queued: { libelle: "En file", fond: "var(--info-bg)", texte: "var(--info)" },
  running: { libelle: "En cours", fond: "var(--warn-bg)", texte: "var(--warn)" },
  review: { libelle: "À valider", fond: "var(--accent-soft)", texte: "var(--accent-strong)" },
  done: { libelle: "Livré", fond: "var(--ok-bg)", texte: "var(--ok)" },
  error: { libelle: "Erreur", fond: "var(--warn-bg)", texte: "var(--warn)" },
};

export default async function Studio() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.rpc("ensure_workspace");

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, format, status, created_at")
    .order("created_at", { ascending: false });

  const projets = (data ?? []) as Projet[];

  return (
    <main className="flex-1">
      <header
        className="flex items-center gap-4 border-b px-6 py-4"
        style={{ borderColor: "var(--line)" }}
      >
        <Image src="/logo-bobie.svg" alt="Bobie" width={92} height={26} />
        <span className="flex-1" />
        <span className="text-sm" style={{ color: "var(--text-2)" }}>
          {user?.email}
        </span>
        <SignOutButton />
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Studio</p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em]">Tes projets</h1>
          </div>
          <Link
            href="/studio/nouveau"
            className="flex h-10 items-center rounded-[8px] px-4 text-sm font-semibold"
            style={{ background: "var(--ink)", color: "var(--on-ink)" }}
          >
            Nouveau projet
          </Link>
        </div>

        {error ? (
          <p
            className="mt-8 rounded-[8px] px-4 py-3 text-sm"
            style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
          >
            La base n&apos;est pas encore prête : {error.message}
          </p>
        ) : projets.length === 0 ? (
          <div
            className="mt-8 rounded-[12px] border border-dashed p-10 text-center"
            style={{ borderColor: "var(--line-strong)" }}
          >
            <p className="font-semibold">Aucun projet pour l&apos;instant.</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
              Un projet = des rushs, un brief, un style. Bobie s&apos;occupe du reste.
            </p>
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-2">
            {projets.map((projet) => {
              const statut = STATUTS[projet.status] ?? STATUTS.draft;
              return (
                <li
                  key={projet.id}
                  className="flex items-center gap-4 rounded-[12px] border px-4 py-3"
                  style={{ borderColor: "var(--line)", background: "var(--surface)" }}
                >
                  <span className="font-medium">{projet.name}</span>
                  <span className="mono text-xs" style={{ color: "var(--text-3)" }}>
                    {projet.format}
                  </span>
                  <span className="flex-1" />
                  <span
                    className="rounded-[6px] px-2 py-1 text-[11px] font-semibold"
                    style={{ background: statut.fond, color: statut.texte }}
                  >
                    {statut.libelle}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
