# Bobie

**Un monteur vidéo qu'on embauche, pas un logiciel de plus.**

Bobie apprend un style de montage à partir de vrais montages, monte des rushs, et
se corrige avec les retours. Il rend un MP4 et un projet Premiere (XML).

Ce dépôt est public : le produit se construit en public. Les recettes de style
(règles chiffrées, prompts, corpus) vivent dans un dépôt privé — c'est le
savoir-faire, pas l'outil.

## Le principe

La **timeline JSON** est la source de vérité ([`src/lib/timeline.ts`](src/lib/timeline.ts)).
L'agent ne pilote pas Premiere : il produit une timeline, et tout le reste n'en
est qu'une traduction.

```
Rushs ─► Transcription ─► L'agent décide ─► TIMELINE (JSON)
                                               │
              ┌────────────────────────────────┼────────────────────────────┐
              ▼                                ▼                            ▼
      Rendu → MP4                  Aperçu web + corrections        Export Premiere (XML)
                                     (notes, retours)                  pour les pros
```

Les corrections faites dans l'aperçu repartent dans l'apprentissage. C'est la
boucle qui fait la différence : Bobie ne repart pas de zéro à chaque vidéo.

Deux notions à ne pas confondre :

- **Format** = la structure (short, long, podcast, VSL) — *qu'est-ce qu'on garde
  et dans quel ordre ?*
- **Style** = l'habillage et le rythme (Lucidus, TEH rouge, Marcus violet) —
  *à quoi ça ressemble ?*

N'importe quel style s'applique à n'importe quel format.

## La pile

| Brique | Choix |
| --- | --- |
| Web app | Next.js 16 (App Router) + Tailwind 4 |
| Base, auth, stockage | Supabase (Postgres + RLS + Storage) |
| Décisions de montage | API Claude |
| Transcription | Whisper local (`mlx-whisper large-v3-turbo`) |
| Rendu | Remotion (à brancher) |
| Hébergement | Vercel |

Le traitement lourd ne tourne pas sur Vercel : un **worker** prend les jobs dans
la file (`jobs`) et les traite — d'abord sur la machine de dev, plus tard sur un
GPU loué.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis remplir les clés Supabase
npm run migrate              # applique supabase/migrations/*.sql
npm run dev
```

## Le worker

Le traitement lourd tourne sur une machine à part (aujourd'hui un Mac Apple
Silicon) qui dépile la table `jobs` :

```bash
npm run worker            # en continu
npm run worker -- --once  # un job puis s'arrête
```

Chaîne d'un projet : `probe` (ffmpeg lit durée, format, son) → `transcribe`
(mlx-whisper, mot à mot, en local) → `edit` (l'API Claude choisit les passages
et les mots-clés, puis `worker/assemble.ts` construit la timeline) → le projet
passe « À valider ».

Pré-requis : `ffmpeg`, `python3` avec `mlx-whisper`, et `ANTHROPIC_API_KEY`
dans `.env.local`. Les recettes privées (`style/prompts`, `style/profils`) sont
lues si le dépôt privé est monté, sinon le worker prend des valeurs par défaut.

## Schéma

`workspaces` → `projects` → `media` (les rushs) → `jobs` (la file) →
`timelines` (le montage) → `deliverables` (MP4/XML) + `reviews` (la note
humaine, la donnée la plus précieuse du projet).

## État

Voir [ROADMAP.md](ROADMAP.md).
