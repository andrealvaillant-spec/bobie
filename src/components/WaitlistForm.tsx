"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions";

const initial: WaitlistState = { status: "idle" };

export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlist, initial);

  if (state.status === "ok") {
    return (
      <p
        className="rounded-[8px] px-4 py-3 text-sm font-medium"
        style={{ background: "var(--ok-bg)", color: "var(--ok)" }}
      >
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          placeholder="ton@email.com"
          className="h-11 flex-1 rounded-[8px] border px-3 text-sm outline-none"
          style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
        />
        <select
          name="role"
          defaultValue=""
          className="h-11 rounded-[8px] border px-3 text-sm"
          style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
        >
          <option value="">Tu fais quoi ?</option>
          <option value="monteur">Monteur</option>
          <option value="createur">Créateur</option>
          <option value="agence">Agence</option>
          <option value="marque">Marque</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-[8px] px-5 text-sm font-semibold transition disabled:opacity-60"
          style={{ background: "var(--ink)", color: "var(--on-ink)" }}
        >
          {pending ? "…" : "Demander un accès"}
        </button>
      </div>
      {state.status === "error" && (
        <p className="text-sm" style={{ color: "var(--warn)" }}>
          {state.message}
        </p>
      )}
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        Accès donné à la main, par petits groupes. Pas de newsletter.
      </p>
    </form>
  );
}
