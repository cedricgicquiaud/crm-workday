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

## Run 1.2a (2026-09-05, 00:05 → 00:55)
- Worktree `../crm-workday-2`, branche `feature/CRM-14-connexion-invitation-reinitialisation`, MISSION.md (exclu via `.git/info/exclude` du dépôt principal — l'exclude par worktree n'est pas lu).
- tdd-writer : PR #4 ouverte à 00:40 (45 commits, 2 146 lignes, 25 tests). verifier : 1 bloquant (open redirect `?next=/\evil.com`), 2 importants, 4 à considérer ; contrat 9/9. testeur : thème sombre absent (attendu 1.3), amorce non attendue par l'outil (session perdue), contrôles 32 px vs 28 px (global), grammaire « de le cabinet ».
- correcteur : 5 points corrigés (6 commits), 33 Vitest + 8 Playwright verts. testeur v2 : écran connecté rendu ; mineur : date « samedi 5 septembre 2026 » vs « 5 sept. 2026 ».
- Rapport posté dans la PR #4 (Mergeable, 4 à relire, 4 décisions). Feature « En revue ». CI verte.
- Leçons : (1) l'amorce de recette doit être en `await` de premier niveau sans navigation ; (2) l'e2e amorce ses comptes dans la base `crm` de dev (fixture) ; le compte de recette `admin@exemple.fr` cohabite ; (3) prévoir `tests/helpers/auth.ts` dans MISSION 1.2b ; (4) tâche isolée à créer : hauteur des contrôles shadcn 28 px (avant 1.3).
- Attente : merge humain de la PR #4, puis `sync`, puis 1.2b.

## Sync après merge de la PR #4 (2026-09-05 08:00)
- PR #4 mergée à 07:58 par Cédric après recette manuelle ; complément corrigé pendant la recette : `seed:admin` applique la règle des 12 caractères (test puis fix).
- Worktree `crm-workday-2` supprimé, branche locale supprimée, base de dev migrée (`0001_comptes`). Jalon 1.2a daté du 2026-09-05.
- 4 idiomes de code ajoutés dans `CLAUDE.md` (redirection `?next=`, amorce de recette, comptes e2e, règles partagées) — à valider, partent avec la PR 1.2b.
- À proposer en tâche isolée : hauteur des contrôles shadcn 28 px (défaut 32) avant 1.3.
- Suite : run 1.2b « Gestion des comptes et profil » (CRM-18 à CRM-21) ; MISSION à compléter : `tests/helpers/auth.ts` autorisé, désactivation révoque les sessions, réutiliser `safeNext`, API d'invitation existante.

## Run 1.2b (2026-09-05, 08:05 → 09:15)
- Worktree `../crm-workday-3`, branche `feature/CRM-18-gestion-des-comptes-et-profil`. PR #5 ouverte à 08:46 (48 commits, 1 336 lignes, 21 tests).
- Hors boucle (team-lead) : `playwright.config.ts` → `workers: 1` (amorces e2e en collision sur la base partagée).
- verifier : 0 bloquant, 3 importants (invitation d'un invité désactivé restait valable ; réactivation → actif sans mot de passe ; bouton inactif du dernier admin sans test d'écran), 4 à considérer, contrat 7/7. testeur : 7 constats (menu 128 px, erreurs en encadré global ×2, nav Paramètres sans état courant [1.3], liste 375 px à défilement interne, espacements profil, contrôles 32 px [global]).
- correcteur : 8/8 (50 Vitest, 17 Playwright). testeur v2 : 5/5 vérifiés. Rapport posté dans la PR #5 (Mergeable, 4 à relire, 3 décisions). Feature « En revue ». CI verte.
- Tâches isolées à proposer : contrôles 28 px (avant 1.3) ; fixture e2e purge `login_attempt` ; `gap-4` dans `profil/page.tsx` (1.3).
- Attente : merge humain de la PR #5, puis `sync`, puis 1.4 « Emails sortants ».

## Sync après merge de la PR #5 (2026-09-05 09:25)
- PR #5 mergée à 09:22. Worktree `crm-workday-3` supprimé, branche locale effacée, base de dev migrée. Jalon 1.2b daté, feature à 61 %, « En développement ».
- Suite : run 1.4 « Emails sortants » (CRM-22 à CRM-26), worktree `../crm-workday-4`.

## Run 1.4 (2026-09-05, 09:25 → 10:50)
- Worktree `../crm-workday-4`, branche `feature/CRM-22-emails-sortants`. PR #6 ouverte à 10:07 (45 commits, 2 945 lignes, 25 tests) ; 49 commits / 3 080 lignes après correction.
- verifier : 0 bloquant, 3 importants (contrat 33 vrai seulement en production ; chemin Resend codé avant son test ; renvoi d'une réinitialisation sans contrôle du compte), 4 à considérer, contrat 9/9. testeur : 5 constats (journal déborde de 342 px à 1280 ; « Modifier » inerte au navigateur piloté ; 2 inputs sans focus ; lignes en échec 54 px ; filtres en formulaire vs puces).
- correcteur : 4/5 corrigés (renvoi 404/409 avec test ; journal `table-fixed` + motif inline + focus-within, test e2e 1280), « Modifier » non reproduit (Playwright headless et Chrome réel : l'éditeur s'ouvre). testeur v2 : journal 3/3 corrigés ; « Modifier » toujours inerte dans son Chrome.
- Vérification du lead dans Chrome piloté : le clic de l'outil arrive en (1253, 238) sur `BODY` pour un bouton en x 1102–1175 / y 203–231 (fenêtre zoomée à 110 %, dpr 2.2) ; aucun événement n'atteint le bouton ; `button.click()` ouvre l'éditeur. Constat écarté : outil, pas application.
- Rapport posté dans la PR #6 (Mergeable, 5 à relire, 6 décisions). Feature « En revue », PR attachée. CI verte. Tâches CRM-22..26 « En revue » (intégration GitHub ; passeront « Terminée » au merge).
- Décisions remontées : contrat 33 hors production (capture prioritaire) ; « Renvoyer » admin ; pas de repli MAIL_FROM ; syntaxe `[Libellé]({{lien}})` ; filtres en formulaire ; fuseau navigateur.
- Leçons : (1) le pilotage Chrome du testeur décale les clics quand la fenêtre est zoomée ≠ 100 % : un constat « clic sans effet » se contre-vérifie par `elementsFromPoint` + `element.click()` avant d'aller au correcteur (à porter dans la fiche testeur, dépôt PILOT) ; (2) une livraison estimée L sort en XL (3 080 lignes) : la 5e tâche (CRM-26) aurait pu être une livraison à part ; (3) le testeur dépasse le seuil de 40 échanges à chaque passe (79 puis 54) : la passe outillée sur 4 écrans + navigateur piloté est trop large pour un seul agent.
- Attente : merge humain de la PR #6, puis `sync`, puis 1.3 « Coque de navigation » (CRM-27..30, dernière).

## Sync après merge de la PR #6 (2026-09-05 12:00)
- PR #6 mergée à 11:59. Worktree `crm-workday-4` supprimé, branche effacée, base de dev migrée (déjà `0002`). Jalon 1.4 daté 2026-09-05, CRM-22..26 « Terminée » par l'intégration GitHub (pièce jointe PR présente : Linear voit le dépôt), feature à 80 %, « En développement ».
- Base de dev `crm` : paramètres du cabinet « Cabinet Martin » et lignes de journal `*-e2e@exemple.fr` laissées par les tests e2e (signalé par le producteur ; pas un défaut, visible en recette 1.4).
- Suite : run 1.3 « Coque de navigation » (CRM-27..30), worktree `../crm-workday-5`, MISSION avec les retours de recette 1.2a/1.2b (date courte Accueil, `gap-4` profil, onglets Paramètres avec état courant et filtrage par rôle).

## Run 1.3 (2026-09-05, 12:05 → 13:10)
- Worktree `../crm-workday-5`, branche `feature/CRM-27-coque-de-navigation`. PR #7 ouverte à 12:43 (30 commits, 1 028 lignes, 15 tests). MISSION incluait les retours de recette 1.2a/1.2b (date courte, gap profil, onglets Paramètres).
- verifier : 0 bloquant, 2 importants (400/401 de `/api/theme` codés avant test ; échec d'enregistrement du thème silencieux depuis sidebar/palette), 5 à considérer, contrat 7/7. testeur : 0 défaut mesuré, 2 constats à trancher (motif d'échec du journal réduit à « Domai… » à côté de la sidebar ; onglets Paramètres sur deux lignes à 375 px) ; premier thème sombre réel constaté lisible.
- CI rouge sur le premier push (test palette « sombre » → `toHaveClass(/dark/)` reçoit "" ; `<html data-theme="systeme">`), verte au second sans changement de ce code : test instable en CI, signalé dans le rapport, tâche isolée à proposer.
- correcteur : 2/2 corrigés avec test (retour visible + retour au thème précédent ; ordre déterministe de la palette par `order`), build vérifié vert. Pas de seconde passe testeur (aucun défaut visuel corrigé).
- Rapport posté dans la PR #7 (Mergeable, 5 à relire, 7 décisions). Feature « En revue », PR attachée.
- Leçons : (1) un ordre d'entrées dépendant de l'ordre des imports finit par contredire le cahier de recette : tout registre porte un rang explicite ; (2) le testeur dépasse toujours 40 échanges (85) : la passe outillée + navigateur piloté sur 5 écrans est trop large ; (3) un `role="alert"` nu est ambigu dans Next.js (annonceur de route) : cibler par conteneur.
- Tâches isolées à proposer après merge : stabiliser le test palette en CI ; colonnes du journal à côté de la sidebar (masquer sous `xl`) ; toaster global (`sonner`) monté dans la coque ; contrôles 28 px ; fixture e2e purge `login_attempt`.
- Attente : merge humain de la PR #7, puis `sync` (feature 1 terminée → rétro : idiomes à graver, « Rétro faite »).
- Complément correcteur (13:10 → 13:25) : cause réelle du test rouge en CI = `saveTheme` posait la classe avant d'envoyer le `PATCH` ; un `reload()` immédiat annulait la requête en vol (course perdue en CI, gagnée en local). Corrigé : classe appliquée après réponse 2xx (`8336ada` test avec 500 ms de latence sur l'API, `ef48ba7` fix). CI verte (run 33962959185). Restent 2 tests `e2e/auth.spec.ts` (1.1) flaky au premier essai en CI (compilation du serveur de dev) → tâche isolée à proposer. Rapport PR #7 mis à jour.
- Leçon : une correction « à l'aveugle » de test instable est une erreur ; le journal complet du run donne la ligne exacte (ici après `reload()`, pas après la bascule) et une latence injectée sur l'API reproduit la course en local.
- Tâches isolées validées par Cédric et créées (13:30) : CRM-31 « Contrôles à 28 px conformes au système de design », CRM-32 « La fixture e2e purge les tentatives de connexion » (team CRM, sans feature, label code, « À faire », à traiter en `/pilot fix`). Restent à proposer : tests `e2e/auth.spec.ts` instables en début de run CI ; colonnes du journal à côté de la sidebar ; toaster global dans la coque.

## Sync de fin de feature 1 (2026-09-05 14:45)
- PR #7 mergée à 14:44. Worktree `crm-workday-5` supprimé, branche effacée, base migrée (aucune migration en 1.3). Jalon 1.3 daté, CRM-27..30 « Terminée » (intégration GitHub), feature 1 « Terminée », startDate 2026-09-04 / targetDate 2026-09-05. Aucune PR ouverte.
- Barème recalibré (≥ 2 mesures) : M = 2.2 h (médiane 1.1 h × 2), L = 3.0 h (médiane 1.0 h × 3) ; S et XL conservés. Observé : 2 jours actifs (04 et 05/09) sur la première semaine ; une feature L tient dans une journée active (3.5 h avec overhead), donc ~2 features par semaine de code.
- Recale Linear (features 2 à 8 avancées, fenêtres de 2 jours ; 9 à 13 inchangées car bloquées par des comptes externes) : F2 07→09/09, F3 09→11/09, F4 14→16/09, F5 16→18/09, F6 28→30/09 (après CRM-2 modèles juridiques, 25/09), F7 05→07/10 (après CRM-3 données légales, 02/10), F8 07→09/10 (CRM-1 Resend requis). Fin de V1 inchangée au 19/10 : bloquée par CRM-4 (Coolify, 16/10). Le calendrier dépend désormais des tâches-décisions, plus de la capacité de code.
- Alerte : CRM-1 (compte Resend et domaine d'envoi) échue depuis le 04/09, 1 jour de retard ; 3 features en dépendent (8 relances, 9 mise en ligne, et la recette réelle de 1.4).
- Rétro à faire : idiomes de code et d'interface issus des audits des 5 PR proposés à Cédric (message de fin de sync) ; feature → « Rétro faite » après validation ; commit des fichiers `.pilot/calibration.md`, notes, `CLAUDE.md` avec la prochaine PR (`/pilot fix` CRM-31 ou CRM-32).
- Rétro validée par Cédric (14:55) : 5 idiomes de code et 5 idiomes d'interface ajoutés au `CLAUDE.md` (avec les 4 de 1.2a, déjà présents, désormais validés). Feature 1 → « Rétro faite ». Ces fichiers (CLAUDE.md, calibration, notes) partent avec la prochaine PR.
- Suite : `/pilot next` → cadrage de la feature 2 « Entreprises et contacts » (07→09/09) ; `/pilot fix` CRM-31 / CRM-32 quand Cédric le demande ; CRM-1 (Resend) à faire par Cédric.

## Cadrage feature 2 « Entreprises et contacts » (2026-09-05, 15:00 → 15:30)
- Proposition v1 (25 décisions, 32 phrases) → contradicteur : 33 questions (contradiction doublon SIREN/email vs refus strict ; palette dynamique absente du registre ; groupe « Vues épinglées » inexistant ; fusion de deux personnes à profils ; changement d'entreprise et fil ; archivées et unicité ; bannière unique ; formes juridiques ; opérateurs par type ; longueurs max ; qui fusionne/supprime ; adresses multiples pour Gmail ; email de facturation ; clés d'objet du journal).
- v2 écrite dans `.pilot/cadrage/feature-2.md` : 25 décisions, 33 phrases (14 refus), 7 questions pour Cédric (Q1–Q7). En attente de validation.
- Cadrage validé par Cédric (15:40, sept propositions acceptées) ; champ dérivé **Profils** ajouté sur la personne à sa demande (« aucun / contact / consultant », colonne + filtre, déduit des profils). Décisions et contrat gravés dans la fiche Linear (contenu du projet).
- Découpage (découpeur → lead) validé (16:20) : 9 livraisons en série 2.1a → 2.1b → 2.2 → 2.3 → 2.5a → 2.5b → 2.4 → 2.6a → 2.6b, 2.5 avant 2.4, trois livraisons coupées en deux, pas de socle transverse (mécanismes génériques + garde-fou grep dès 2.1a, contrat 33 en 2.4), éditions en série des points de contact, manifeste d'objets. Frontières F1–F9 tranchées par le lead. 9 jalons (6 renommés + 3 créés), 31 tâches CRM-33..63, feature « Planifiée », label XL. Fichier : `.pilot/cadrage/feature-2-decoupage.md`.
- Suite : `run` feature 2 (worktree `../crm-workday-6`, 2.1a en premier) sur un « oui » de Cédric.
