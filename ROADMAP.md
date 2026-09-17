# Roadmap

Ordre décidé le 17 septembre 2026. Rien ne compte tant que la qualité des
montages n'y est pas : le produit se vend par son rendu.

## Phase 0 — le moteur de style *(en cours, hors de ce dépôt)*

Travaux dans `~/Desktop/agent-monteur` : 34 règles mesurées sur 516 shorts,
14 profils clients, jeu d'évaluation.

- [x] Extraire les règles du corpus de montages
- [ ] Extraire les ~50 Loom de montage (le *pourquoi* des règles)
- [ ] Définir le style **Lucidus** sur 30 à 50 montages de référence
- [ ] Annoter 30 extraits à garder / à jeter (le choix du contenu)
- [ ] **Validé quand** : 8/10 ou plus sur 20 clips d'affilée, sans retouche

## Phase 1 — la web app

- [x] Squelette Next.js + jetons de design
- [x] Format de timeline JSON + mesures
- [x] Schéma Supabase (espaces, projets, médias, file de jobs, timelines, notes) + RLS
- [x] Page publique + liste d'attente
- [ ] Connexion et espace de travail
- [ ] Dépôt des rushs (Storage) et création d'un projet
- [ ] File de jobs visible, avec avancement
- [ ] Worker local : sonde → transcription → décisions (API Claude) → timeline
- [ ] Écran de validation : garder / jeter / ajuster les bornes / noter
- [ ] Export MP4 (Remotion) **et** projet Premiere (XML)
- [ ] Quotas par compte

## Phase 2 — early access

- [ ] 5 à 10 testeurs choisis à la main, pas d'ouverture publique
- [ ] Les clients de l'agence en premier
- [ ] Un canal de retours unique, traité chaque semaine
- [ ] Documenter la construction sur le compte Lucidus

## Pas en V1

Publication automatique sur les réseaux, analyse d'audience, Google Drive,
facturation, application mobile. Tout ça après la preuve que les montages sont
bons.

## Ensuite

Autres styles (TEH rouge, Elie orange, Marcus violet — déjà mesurés) →
décodeur de style (lire un MP4 et en sortir un profil) → format podcast →
format VSL.
