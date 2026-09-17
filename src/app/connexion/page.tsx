import Image from "next/image";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Connexion — Bobie" };

export default function Connexion() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div
        className="w-full max-w-sm rounded-[12px] border p-8"
        style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <Image src="/logo-bobie.svg" alt="Bobie" width={104} height={30} />
        <h1 className="mt-6 text-xl font-bold tracking-[-0.02em]">Se connecter</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
          On t&apos;envoie un lien de connexion par e-mail. Pas de mot de passe à retenir.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
