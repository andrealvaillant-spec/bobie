"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <p
        className="rounded-[8px] px-4 py-3 text-sm font-medium"
        style={{ background: "var(--ok-bg)", color: "var(--ok)" }}
      >
        Lien envoyé à {email}. Ouvre-le sur cet appareil.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ton@email.com"
        className="h-11 rounded-[8px] border px-3 text-sm outline-none"
        style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="h-11 rounded-[8px] text-sm font-semibold disabled:opacity-60"
        style={{ background: "var(--ink)", color: "var(--on-ink)" }}
      >
        {state === "sending" ? "Envoi…" : "Recevoir le lien"}
      </button>
      {state === "error" && (
        <p className="text-sm" style={{ color: "var(--warn)" }}>
          {message}
        </p>
      )}
    </form>
  );
}
