import Image from "next/image";
import { WaitlistForm } from "@/components/WaitlistForm";

const etapes = [
  {
    titre: "Tu déposes tes rushs",
    texte:
      "Les fichiers, ou un lien. Tu écris le brief comme tu le dirais à un monteur : le sujet, le ton, la durée.",
  },
  {
    titre: "Bobie monte",
    texte:
      "Il transcrit, choisit les passages, pose les coupes, les sous-titres, les zooms et les b-rolls. Il t'explique chaque décision.",
  },
  {
    titre: "Tu valides, il apprend",
    texte:
      "Tu gardes, tu jettes, tu déplaces une coupe, tu notes. Chaque correction rentre dans son apprentissage — il ne repart pas de zéro à la vidéo suivante.",
  },
  {
    titre: "Tu récupères le montage",
    texte:
      "Un MP4 prêt à publier, et le projet Premiere (XML) si tu veux finir à la main. C'est ton fichier, pas un rendu fermé.",
  },
];

const mesures = [
  { valeur: "516", libelle: "shorts analysés" },
  { valeur: "34", libelle: "règles de montage mesurées" },
  { valeur: "1,84 s", libelle: "durée médiane d'un plan" },
  { valeur: "23", libelle: "coupes par minute" },
];

export default function Home() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-6">
        <Image src="/logo-bobie.svg" alt="Bobie" width={120} height={34} priority />
        <span className="flex-1" />
        <span
          className="rounded-[6px] px-2 py-1 text-[11px] font-semibold"
          style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
        >
          En construction, en public
        </span>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 pb-20 pt-10">
        <p className="eyebrow">Agent monteur vidéo</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.1] tracking-[-0.03em] sm:text-6xl">
          Un monteur qu&apos;on embauche,
          <br />
          pas un logiciel de plus.
        </h1>
        <p className="mt-6 max-w-2xl text-lg" style={{ color: "var(--text-2)" }}>
          Bobie apprend <em>ton</em> style de montage à partir de tes propres vidéos, monte tes
          rushs, et se corrige avec tes retours. Il rend un MP4 et un projet Premiere.
        </p>

        <div className="mt-10 max-w-2xl">
          <WaitlistForm />
        </div>

        <dl className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border sm:grid-cols-4"
            style={{ borderColor: "var(--line)", background: "var(--line)" }}>
          {mesures.map((m) => (
            <div key={m.libelle} className="p-5" style={{ background: "var(--surface)" }}>
              <dt className="mono text-2xl font-semibold">{m.valeur}</dt>
              <dd className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
                {m.libelle}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>
          Chiffres mesurés sur le corpus de montages de l&apos;agence, pas des estimations.
        </p>
      </section>

      <section
        className="border-t py-20"
        style={{ borderColor: "var(--line)", background: "var(--bg-soft)" }}
      >
        <div className="mx-auto w-full max-w-5xl px-6">
          <h2 className="text-2xl font-bold tracking-[-0.02em]">Comment ça marche</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {etapes.map((e, i) => (
              <li
                key={e.titre}
                className="rounded-[12px] border p-6"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}
              >
                <span className="mono text-xs" style={{ color: "var(--accent)" }}>
                  0{i + 1}
                </span>
                <h3 className="mt-2 font-semibold">{e.titre}</h3>
                <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
                  {e.texte}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer
        className="border-t py-10 text-sm"
        style={{ borderColor: "var(--line)", color: "var(--text-3)" }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-6">
          <Image src="/logo.svg" alt="" width={24} height={24} />
          <span>Bobie — construit en public.</span>
          <span className="flex-1" />
          <a href="https://github.com/andrealvaillant-spec/bobie" className="underline">
            Le code
          </a>
        </div>
      </footer>
    </main>
  );
}
