# Bobie — repères pour les sessions

Lire d'abord `README.md` (le principe et la pile) et `ROADMAP.md` (où on en est).

## Ce dépôt est **public**

- Aucune règle de style chiffrée, aucun prompt d'agent, aucun extrait de corpus
  client ici. Tout ça est dans le dépôt privé `bobie-style` (monté dans
  `style/`, ignoré par git).
- Pas de noms de clients réels dans le code ou les démos.
- Aucun secret commité : tout passe par `.env.local` et les variables Vercel.

## Règles de design (validées le 17/09/2026)

- Carrés **légèrement** arrondis : 8 px, 5-6 px pour les petites étiquettes.
  **Jamais de pilule.**
- Accent en dégradé bleu clair (`--grad`). Pas de rose.
- Jetons dans `src/app/globals.css`, avec mode jour et mode nuit. Utiliser les
  variables, pas des couleurs en dur.
- Police Geist, chiffres en `.mono` (tabulaires).

## Conventions

- `npm run build` avant chaque commit.
- Migrations SQL numérotées dans `supabase/migrations/`, appliquées par
  `npm run migrate`. Ne jamais modifier une migration déjà appliquée.
- La RLS est active sur toutes les tables. Le worker écrit avec le service role.
- Déployer = `npx vercel --prod --yes` (le push seul ne déploie pas).

## Pièges connus

- Supabase en offre gratuite **met le projet en pause** après inactivité : l'app
  tombe entièrement. Passer en Pro quand il y aura de vrais utilisateurs.
- `ffmpeg` n'est pas installé sur la machine de dev : extraire l'audio avec
  `afconvert`.
- Transcription : `mlx-whisper large-v3-turbo`, **un seul worker** (paralléliser
  fait chuter le débit à cause de la contention GPU).
