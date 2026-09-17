"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/connexion");
      }}
      className="h-9 rounded-[8px] border px-3 text-sm font-medium"
      style={{ borderColor: "var(--line-strong)" }}
    >
      Se déconnecter
    </button>
  );
}
