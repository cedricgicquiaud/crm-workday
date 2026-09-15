# Session du 2026-09-15 — CI, cadrage et découpage de la feature 3, run de la livraison 3.0

Session précédente : `2026-09-14-retro-feature-2.md`.

## État à la fermeture (2026-09-15, ~20:40)

- **Feature 3 « Les consultants Workday »** : « En revue ». Cadrage validé (22 décisions + 6 amendées, contrat de 19 phrases, 23 questions du contradicteur intégrées), découpage validé (quatre livraisons **en série** : 3.0, 3.1a, 3.1b, 3.2 ; 11 tâches CRM-73, CRM-78 à CRM-88 ; feature relevée XL). **PR #33 (3.0, CRM-73) ouverte, auditée, recettée, mergeable**, rapport en commentaire, 3 décisions à trancher, CI en cours.
- **Worktree** `~/Desktop/crm-workday-10` (poste A : port 3001, `crm_a` / `crm_test_a`), branche `feature/CRM-73-fiche-personne-recomposee`. À supprimer au `sync` après merge.
- `main` en `06fea10` : cadrage, `CONTEXT.md` (glossaire, créé ce jour), CI en trois parts (PR #32, CRM-89) mergés.
- Linear : dates recalées d'un jour (V1 22/10, V2 05/11). Tâches isolées : CRM-1 (Resend) échue depuis 11 jours ; CRM-69, CRM-76 libres pour le second producteur pendant la feature.

## Ce qui a été fait

1. `next` + correction de la CI : CRM-77 (tests du fil instables : `getByText` lisait la saisie du `textarea` avant la réponse du serveur ; `waitForResponse`), PR #30 mergée ; PR #29 relancée et mergée.
2. CRM-89 : CI en trois parts avec chauffe du serveur de dev par `global-setup.ts` (connexion avec en-tête `Origin`), délais CI élargis, saut des tests d'écran sur PR de documentation : 15 min → 7 min. PR #32 mergée.
3. `feature` « Les consultants Workday » : deux rounds d'entretien (18 questions), contradicteur (23 questions), fiche Linear, `CONTEXT.md`, decoupeur, 8 frontières tranchées, jalons, tâches, dates, PR #31 mergée.
4. `run` 3.0 : worktree, contrôle du poste A, `MISSION.md`, producteur (16 commits, 1 passe), verifier ∥ testeur, correcteur (3 corrections), captures, rapport, feature « En revue ».

## Décisions prises dans la session (à confirmer au merge de la PR #33)

- Chargeur de fiche déclaré par l'objet (`loadRecord`, option prise par le producteur, générique).
- Deux fichiers hors liste ouverts au correcteur (`contact-profile.ts`, `persons.ts`) pour lire le profil une fois par requête sans casser l'écriture.
- Dans le dialogue de création rapide, date et nombre restent saisis en texte jusqu'à 3.1b.

## Leçons de méthode (pour le dépôt PILOT)

- **Le verifier et le testeur ne partagent pas un poste pendant une suite d'écran** : l'outil de passe visuelle démarre et arrête `next dev` sur le port du poste ; le Playwright du verifier, qui réutilise le serveur trouvé, le voit tomber (66 `ECONNREFUSED`). Solution : le verifier lance lui-même son serveur ou attend la fin du testeur ; ou un port dédié pour la passe visuelle.
- **Le cercle « N » en bas à gauche à 375 px est l'indicateur des outils de développement de Next.js**, pas un bouton de l'application : à ajouter au « déjà connu » de la consigne du testeur (rapporté comme défaut ce jour).
- Le verifier s'est encore mis en veille pendant la suite d'écran (relancé par message) ; le producteur aussi après son rapport (20 min).
- Le verrou git lit la branche du dépôt principal, pas celle du worktree : depuis un worktree, pousser par `git push origin <branche>` explicite.
- Le grep BSD de macOS rend 1 sur `grep -vq` dès qu'une ligne matche : ne pas l'utiliser dans un filtre de CI.
- Chaque part de CI démarre son serveur à froid : la première ouverture d'une route compile (10 à 20 s) ; une chauffe des routes en `global-setup` règle le cas.

## Tâches isolées ouvertes

CRM-1 (échue), CRM-2 à 7, CRM-31, 32, 65, 66, 67, 69, 70, 71, 72, 74, 75, 76.

## Recette humaine en attente

`UAT.md` : features 1 et 2 (aucune jouée), 3.0 (section créée, à jouer après merge).

## Prochaine commande

Merge humain de la PR #33, puis `/pilot next` (`sync` : jalon 3.0 daté, worktree supprimé, calibration), puis `/pilot run` pour 3.1a « Profil consultant » (migration 0010, type `multilist`).
