# Session du 2026-09-05 → 06 — Feature 1 close, feature 2 lancée

Journal détaillé (cadrage, runs, syncs, coûts) : `2026-09-04-cadrage-prd.md`. Ce fichier est le résumé de reprise.

## État à la fermeture (2026-09-06, 00:15)

- **Feature 1 « L'équipe entre dans le CRM »** : terminée le 2026-09-05, « Rétro faite ». 5 PR mergées (#2, #3, #4, #5, #6, #7 — #3 = design). 10 idiomes gravés dans `CLAUDE.md`. Barème recalibré (M 2.2 h, L 3.0 h).
- **Feature 2 « Entreprises et contacts »** : cadrée (25 décisions, 33 phrases, champ dérivé Profils ajouté à la demande de Cédric), découpée en **9 livraisons en série** (2.1a → 2.1b → 2.2 → 2.3 → 2.5a → 2.5b → 2.4 → 2.6a → 2.6b ; 2.5 avant 2.4), 31 tâches CRM-33..63, « En développement ».
  - **2.1a mergée** (PR #8, 2026-09-06 00:03) : registre d'objets, historique, fiche trois colonnes, liste, dialogue, entreprise. Coût anormal : 6 h d'agents (verifier 161 min). À la rétro : couper la première livraison d'une feature en « mécanismes » puis « écrans ».
  - **2.1b prête, non lancée** : worktree `~/Desktop/crm-workday-7`, branche `feature/CRM-37-recherche-palette` depuis `main` (8e33cb0), `npm ci` fait, `.env.local` copié, `MISSION.md` écrit (95 lignes, exclu de git). Reprise : lancer `tdd-writer` (sous-agent nommé `tdd-writer-21b`) avec la consigne habituelle (lire la fiche, MISSION.md, fiches CRM-37..39, ouvrir la PR `CRM-37 Recherche dans la palette Cmd+K`, s'arrêter, rapport au team-lead), puis verifier ∥ testeur (écrans : palette ouverte sur /entreprises, « acm » → ACME SAS), correcteur si besoin, rapport PR, « En revue ».
- **Dépôt principal** `~/Desktop/crm-workday` sur `main` à jour. Fichiers modifiés non commités : `.pilot/calibration.md` (ligne 2.1a datée), `.workflow/sessions/*` (ce fichier et le journal). Ils partent avec la PR de 2.1b : les copier dans le worktree et les commiter en `docs:` avant de lancer le producteur, comme pour 2.1a (commit `fe34303`).
- **Base de dev** `crm` migrée `0003` ; compte de recette `admin@exemple.fr` / `MotDePasse-Recette-1` ; trois entreprises d'amorce (Banque Solveige — modifiée à la main pendant l'audit —, Assurances Vaubourg, Groupe Ferrandi) ; traces des tests e2e (comptes `*-e2e@`, cabinet « Cabinet Martin », journal).
- **Tâches isolées** : CRM-31 (contrôles 28 px) et CRM-32 (purge `login_attempt` dans la fixture e2e) « À faire », à traiter en `/pilot fix` sur demande. Réserve à proposer : tests `e2e/auth.spec.ts:12,25` instables en début de run CI ; colonnes du journal à côté de la sidebar ; toaster global (`sonner`) dans la coque ; composant `FieldControl` commun (avant 2.5a) ; `h-7`/`h-8` en dur vs tokens.
- **Alerte** : CRM-1 (compte Resend et domaine d'envoi) échue le 04/09, 2 jours de retard ; conditionne la recette réelle des emails (UAT 1.4), les relances (F8), la mise en ligne (F9).
- **Recette humaine en attente** : UAT.md sections 1.3, 1.4, 2.1a.

## Décisions prises dans la session (à ne pas rediscuter)
- Une fiche Personne à profils ; champ Profils dérivé, jamais saisi.
- Feature 2 : vues partagées modifiables par tout membre ; plusieurs emails par personne ; fusion et suppression définitive réservées aux administrateurs ; listes à choix unique ; pas d'import CSV ; email de facturation sur l'entreprise ; rôles décideur / acheteur / utilisateur / facturation / non précisé.
- Découpage : pas de socle transverse, mécanismes génériques + garde-fou grep, contrat 33 en 2.4, éditions en série des points de contact, manifeste = registre, 9 PR, API `/api/objets/[type]/[id]/<mécanisme>`.
- Audit 2.1a : chargement des fiches liées → 2.2 ; fil en onglet < 900 px → 2.3 (jalons Linear et découpage mis à jour).

## Leçons de méthode (candidates pour ~/Desktop/PILOT)
- Clic piloté Chrome décalé quand la fenêtre est zoomée ≠ 100 % : contre-vérifier par `elementsFromPoint` + `element.click()` avant correction (fiche testeur).
- Ne jamais qualifier un test d'instable sans lire la ligne exacte du run rouge ; une latence injectée reproduit une course.
- Le testeur dépasse 40 échanges à chaque passe : passe outillée sur ≤ 3 écrans, navigateur piloté à part.
- La première livraison d'une feature (mécanismes + objet + écrans) coûte 4 à 6 fois une livraison ordinaire : à couper.
- `UAT.md` par livraison : pré-créer toutes les sous-sections à la première livraison évite les conflits (fait en 2.1a) ; le conflit vu sur le dépôt `cedricgicquiaud.github.io` (PR #31) est ce cas.

## Prochaine commande
`/pilot next` → « 2.1b prête, producteur à lancer » ; ou directement « lance 2.1b ».

## Correction du 2026-09-07 — le coût de 2.1a était une lecture d'horloge

Relecture des transcriptions des agents (`cout-agents.py` corrigé, qui sépare horloge, actif
et attente) : la livraison 2.1a a coûté **81 minutes de travail d'agents**, pas 6 h. Les
6 h d'horloge contiennent **4 h 38 d'attente de permission** sur trois commandes composées
dont un morceau n'était pas dans la liste blanche (`sleep`, `curl`, `echo`, `git show`,
`sort`, `npm run build`), sans personne devant l'écran (aucun message humain entre 17:36 et
00:01). Le relecteur a travaillé 9 minutes, pas 161 : « tests relancés + build » était une
cause inventée par le lead sans lire la transcription.

Conséquences :
- la ligne 2.1a de `.pilot/calibration.md` est corrigée (1.35 h d'agents, attente à part) ;
- la leçon « couper la première livraison d'une feature en mécanismes puis écrans » tombe :
  elle reposait sur cette lecture. Le travail réel par livraison est stable, 50 à 80 minutes ;
- la liste blanche de ce projet est complétée le 07/09 avec `sleep`, `curl`, `echo`, `sort`,
  `git show`, `ps` (`.claude/settings.json`, non touché par `update` ; `npm run build` était
  déjà couvert par `npm run:*`) ;
- la méthode a été corrigée dans le dépôt `pilot` (PR #28) : `/pilot update` ici après merge,
  avant de lancer 2.1b.
