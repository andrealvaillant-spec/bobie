"use server";

import { createServiceRoleClient, supabaseConfigured } from "@/lib/supabase/server";

export type WaitlistState = { status: "idle" | "ok" | "error"; message?: string };

/** Inscription à l'early access. Écrit avec le service role (table fermée en lecture). */
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", message: "Cette adresse e-mail n'a pas l'air valide." };
  }
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: "error", message: "La liste d'attente n'est pas encore branchée." };
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("waitlist")
    .upsert({ email, role, note, source: "site" }, { onConflict: "email" });

  if (error) {
    return { status: "error", message: "Enregistrement impossible pour le moment." };
  }
  return { status: "ok", message: "C'est noté. Je t'écris dès qu'une place se libère." };
}
