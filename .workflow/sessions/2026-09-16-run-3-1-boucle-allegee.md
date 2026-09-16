# Session du 2026-09-15 (soir) → 2026-09-16 (nuit) — boucle allégée, fusion 3.1a + 3.1b, run 3.1

Session précédente : `2026-09-15-feature-3-cadrage-run-3-0.md`.

## État à la fermeture (2026-09-16, ~01:00)

- **Feature 3 « Les consultants Workday »** : « En revue ». 3.0 mergée (PR #33, 15/09 21:26). **3.1 en PR #37**,
  auditée, recettée, corrigée, mergeable, rapport posté (5 points à relire, 4 décisions). 3.2 à produire après.
- **Worktree** `~/Desktop/crm-workday-11` (poste A), branche `feature/CRM-80-profil-consultant` en `4b83a1d` + 2 commits
  docs (calibration, cette note). À supprimer au `sync` après merge.
- **CI de la PR #37** : parts 1 et 3 vertes, part 2 rouge sur `e2e/emails.spec.ts:145` (« demain » sur minuit UTC,
  échoue entre 00:00 et 02:00 Paris ; les trois runs ont tourné dans cette fenêtre). Relancer la part 2 après 02:00
  (`gh run rerun <id> --failed`) ou corriger par une tâche isolée.
- Méthode : `9874c35` installée (PR pilot #58 et #59 ; PR projet #35, #36).

## Ce qui a été fait

1. Clôture de 3.0 : second audit court du verifier (rien), CI verte, but déclaré atteint.
2. Diagnostic de lenteur demandé par Cédric : 1 h 30 d'horloge pour 40 min de production sur 3.0. Quatre règles
   dans PILOT (PR #58, mergée) : verifier sans suite d'écran, un serveur par poste, repasse du testeur seulement après
   un défaut d'écran, pas de second audit. Cinquième mesure validée : fusion de 3.1a et 3.1b en 3.1 (XL).
3. Linear : jalon 3.1 renommé avec description fusionnée, CRM-83/84 rattachées, jalon 3.1b supprimé (GraphQL).
   Découpage du projet réécrit (PR #34, mergée). CRM-80 remise « À faire » après que le titre de la PR #34 l'avait
   fermée par l'intégration GitHub.
4. `update` deux fois (PR #35, #36), `next` avec `sync` de 3.0 (jalon daté, feature « En développement »,
   calibration L inchangée à 4,1 h, cadence 5,1 j/sem, worktree 3.0 supprimé).
5. `run` 3.1 : poste A contrôlé, MISSION.md (122 lignes, contrat 2 à 10 en toutes lettres), producteur 22:07 → PR
   00:06 (38 commits, 74 fichiers), verifier (2 importants, 5 à considérer) et testeur (2 défauts) en parallèle,
   correcteur (4 corrections, 8 commits, 00:20 → 00:44), repasse du testeur sur la fiche seule (propre), captures,
   rapport, feature « En revue ». 2 h 57 d'horloge, 2 h 55 d'agents actifs.

## Décisions prises dans la session (par le lead, listées dans la PR)

- Phrase 3 du contrat rendue par un enregistrement des modules en un geste (brouillon local, PATCH à la sortie de la
  liste ou sur Entrée) plutôt que par un amendement de la phrase.
- Fusion rejouée : 409 pour tous les objets (CRM-82), un test de la feature 2 a suivi.
- Format français à trois décimales sur tout nombre affiché (effet de bord du `unit`/`decimals`) : gardé, à trancher.
- Les trois champs de disponibilité sont saisis en 3.1 (contrat 6, amorce) ; l'état dérivé reste en 3.2.

## Candidats à des tâches isolées (non créés : liste à valider)

- `e2e/emails.spec.ts` : « demain » calculé sur minuit UTC, rouge entre 00:00 et 02:00 Paris (idiome du CLAUDE.md
  déjà écrit pour le code, pas appliqué au test).
- `e2e/vues.spec.ts` : deux épinglages sans attendre la réponse du premier (CRM-70 existe déjà, cause identifiée).
- Mineurs du verifier sur 3.1 : double lecture par PATCH, sources de « Profils » par effet de bord d'import,
  `numberProblem` avec une seule borne, historique hors transaction en modification.

## Leçons

- **Boucle allégée mesurée** : audit + recette + correction + repasse = 49 min d'horloge (00:06 → 00:55) pour une
  XL, contre 55 min pour la L de 3.0 ; aucune collision de poste, aucune suite d'écran rejouée par le verifier.
  Le lead est passé de 33 % à 8 % des jetons du run.
- **Le producteur XL en une passe** : 2 h, 125 M jetons relus (seuil 70) ; c'est le coût de la fusion 3.1a + 3.1b,
  assumé. Le contrat entier recopié dans MISSION.md a de nouveau donné une seule passe et 9 phrases sur 9.
- **Un titre de PR qui porte un code de tâche ferme la tâche** : ne jamais titrer une PR de documentation avec le
  code d'une tâche de code (CRM-80 fermée puis rouverte à la main).
- **Le testeur cible un lien par `td a` / `li a`**, pas par le texte de la ligne : à retenir pour ses consignes.
- **La fenêtre 00:00–02:00 Paris rend la CI rouge** sur le test des emails, quelle que soit la branche : à corriger
  avant le prochain run nocturne.

## Prochaine commande

Relancer la part 2 de la CI après 02:00 Paris (ou créer la tâche isolée), merge humain de la PR #37, puis
`/pilot next` (sync : jalon 3.1 daté, barème XL recalculé sur trois mesures, worktree supprimé), puis `run` pour
3.2 « Disponibilité, état, liste filtrable ». CRM-1 (compte Resend) toujours en retard.
