import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { NewProjectForm, type StyleOption } from "@/components/NewProjectForm";

export const metadata = { title: "Nouveau projet — Bobie" };

export default async function NouveauProjet() {
  const supabase = await createServerSupabase();
  const { data: workspaceId } = await supabase.rpc("ensure_workspace");
  const { data: styles } = await supabase
    .from("styles")
    .select("id, name, format, available")
    .order("available", { ascending: false })
    .order("name");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <Link href="/studio" className="text-sm" style={{ color: "var(--text-2)" }}>
        ← Studio
      </Link>
      <p className="eyebrow mt-6">Nouveau projet</p>
      <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em]">Brief pour Bobie</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
        Écris-lui comme à un monteur : le sujet, le ton, ce qu&apos;il faut garder.
      </p>
      <div className="mt-8">
        <NewProjectForm workspaceId={workspaceId as string} styles={(styles ?? []) as StyleOption[]} />
      </div>
    </main>
  );
}
