# Session 2026-09-04 — cadrage du CRM

## Fait
- Étude de marché (BoondManager, Bullhorn, Vincere, Recruit CRM, Napta, Attio, Twenty, folk, HubSpot, Pipedrive), étude UX, étude stack + facturation électronique 2026-2027.
- PRD v0.1 rédigé : `.pilot/PRD.md`. Statut : à valider.

## Décisions
- Aucune validée. Proposées : partir de zéro (pas de fork Twenty), Next.js + Postgres/Drizzle + Better Auth + shadcn/ui, pg-boss pour les relances, Factur-X dès la V1.
- L'audit Pipedrive du Desktop n'a rien à voir avec ce projet : ne pas s'en servir.

## Prochaines étapes
- Réponses aux 8 questions ouvertes du PRD (section 13).
- Décision pilotage (Linear + boucle d'agents) ou non.
- Puis cadrage de la livraison 1 (socle commercial).

## Suite de session (soir)
- Pilotage accepté. PRD v0.2 validé (consultants salariés + freelances, 3 utilisateurs, Gmail, Coolify OVH, euros, Pennylane).
- Direction visuelle validée (`.pilot/design.md`).
- Team Linear `CRM` (« CRM Workday ») créée dans le workspace `gm5`, id `395e04f1-06f4-4c2b-b88d-e17d440bc6eb`.
- Dépôt GitHub `cedricgicquiaud/crm-workday` (privé) ; PR `chore/pilot-init` → `main` ouverte, merge humain.
- À faire par Cédric : vérifier l'intégration GitHub de Linear sur le compte `cedricgicquiaud` ; merger la PR.
- Prochaine commande : `/pilot roadmap` (dans le dossier du projet).

## Roadmap (soir, suite)
- PR #1 mergée par Cédric. Roadmap v3 validée (déploiement Coolify en fin de V1 ; Google Workspace ; modèles de contrats et données légales : pas encore → tâches isolées avec échéance).
- Créé dans Linear (gm5, team CRM) : initiatives « CRM Workday V1 — le CRM pour l'équipe » et « CRM Workday V2 — ouverture », 13 features « À cadrer », 46 jalons datés, 12 dépendances, 7 tâches isolées (CRM-1 à CRM-7).
- Dates calculées avec days_per_week = 1 (valeur par défaut « observed ») : V1 du 2026-09-07 au 2026-10-19, V2 jusqu'au 2026-11-02. À recaler par `sync` dès les premiers merges, ou en forçant `days_per_week` dans `.pilot/calibration.md`.
- Roadmap locale : `.pilot/roadmap.md` (non commitée, à inclure dans la prochaine PR).
- Prochaine étape : `/pilot feature 1` (cadrage de « L'équipe entre dans le CRM ») ; question ouverte : prompt de système de design (`.pilot/design/PROMPT.md`) voulu ou non.

## Feature 1 (nuit)
- Cadrage validé (25 décisions, contrat de 35 phrases, relu par le contradicteur) → écrit dans la fiche Linear.
- Découpage validé (découpeur) : 5 livraisons en série 1.1 → 1.2a → 1.2b → 1.4 → 1.3 ; 23 tâches CRM-8 à CRM-30 ; feature « Planifiée », XL.
- Socle 1.1 produit hors boucle (D1) : Next.js 16, shadcn/ui (26 composants), Drizzle + Postgres Docker (crm / crm_test), Better Auth paresseux, email capturé + `email_log`, pages d'attente, santé, Vitest (9 tests) + Playwright (2 tests), CI GitHub. PR `CRM-8 Première page en ligne`.
- Décision : la boucle (1.2a…) attend le dépôt du système de design dans `.pilot/design/`.
- Reste à faire par Cédric : merger la PR CRM-8 ; maquetter avec `.pilot/design/PROMPT.md` et déposer le résultat ; tâches CRM-1 (Resend) puis CRM-2, CRM-3.

## Sync après merge de la PR #2 (22:05)
- CRM-8 à CRM-13 « Terminée » par l'intégration GitHub (pièces jointes PR présentes : l'intégration voit le dépôt). Jalon 1.1 daté 2026-09-04 ; feature 1 « En développement », startDate 2026-09-04.
- Barème : première mesure L = 0.6 h (hors boucle) ; barème global conservé jusqu'à 2 mesures.
- Idiomes de code et d'interface proposés dans `CLAUDE.md` (7 + 3), à valider, partent avec la prochaine PR.
- Alerte : CRM-1 (compte Resend) échue le 2026-09-04, non faite ; conditionne l'envoi réel (1.4) et la mise en service (feature 9).
- Attente : système de design dans `.pilot/design/` avant 1.2a.
