# Découpage — feature 1 « L'équipe entre dans le CRM »

Validé le 2026-09-04 (proposé par le `decoupeur`, frontières tranchées par Cédric). Créé dans Linear le même jour : 5 jalons, 23 tâches (CRM-8 à CRM-30), feature « Planifiée », taille XL.

## Ordre de production (une PR par livraison, en série)

| Jalon | Livraison | Taille | Tâches | Contrat | Produite après |
|---|---|---|---|---|---|
| 1 | Première page en ligne | L | CRM-8 à CRM-13 | 1–4 | rien — hors boucle, Claude en session (D1) |
| 2 | Connexion, invitation, réinitialisation | M | CRM-14 à CRM-17 | 6, 8, 9, 12–15, 19, 20 | 1.1 mergée |
| 3 | Gestion des comptes et profil | M | CRM-18 à CRM-21 | 5, 7, 10, 11, 16, 17, 18 | 1.2a mergée |
| 4 | Emails sortants | L | CRM-22 à CRM-26 | 27–35 | 1.2b mergée |
| 5 | Coque de navigation | M | CRM-27 à CRM-30 | 21–26 | 1.4 mergée — dernière, pour bénéficier du système de design |

Les fichiers de chaque livraison sont dans la description de son jalon Linear (recopiés dans `MISSION.md` par `run`).

## Frontières tranchées le 2026-09-04

1. 1.2 coupée en 1.2a (mécanique de connexion) et 1.2b (gestion des comptes) : PR relisibles.
2. Coque en dernier : attend le système de design, retouche toutes les pages à 375 px.
3. Mutations par route handlers `src/app/api/<domaine>/` : codes 403 / 409 réels exigés par le contrat.
4. Capture des emails et table `email_log` posées dès 1.1 : les tests d'invitation de 1.2a lisent l'email envoyé.
5. État replié de la barre latérale en cookie.
6. Tailles au barème par diff : L, M, M, L, M → feature XL.

## Points de contact fixés par 1.1

- Schéma : un fichier par domaine (`auth.ts`, `accounts.ts`, `emails.ts`) réexporté par `src/db/schema/index.ts`, jamais modifié ensuite. Migrations : `0000` (1.1), `0001` (1.2a), `0002` (1.4) ; 1.2b et 1.3 n'en créent aucune.
- `package.json`, `.env.example`, `src/lib/env.ts`, configs Vitest / Playwright, `src/components/ui/*`, `src/db/schema/index.ts` : personne n'y touche dans la feature. Un manque se corrige par une PR `chore` hors boucle.
- `src/lib/mail/send.ts` : signature stable `sendTemplatedEmail({ to, template, variables, authorId, objectRef? })` ; 1.2a l'appelle, 1.4 en devient propriétaire.
- `UAT.md` : section Feature 1 avec une sous-section par livraison, pré-créée par 1.1 ; chaque livraison ne remplit que la sienne.
- `.pilot/amorce-recette.js` : vide en 1.1, connexion par `fetch` posée par 1.2a.
- Deux bases Postgres dans Docker : `crm` (développement) et `crm_test` (tests, remise à zéro à chaque exécution).
- Champ `theme` sur l'utilisateur posé dès 1.1 pour que 1.3 n'ait pas de migration.

## Attente avant la boucle

Décision du 2026-09-04 : la boucle (1.2a et suivantes) démarre après dépôt du système de design dans `.pilot/design/` et intégration des tokens dans le socle par une PR `chore`. Variante possible si le maquettage traîne : produire 1.2a quand même (un seul écran), garder 1.2b, 1.4, 1.3.
