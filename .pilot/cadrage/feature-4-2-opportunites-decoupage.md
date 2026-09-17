# Découpage — livraison 4.2 « Opportunités » (feature 4 « Le pipeline commercial »)

Statut : **validé** le 2026-09-17 par Cédric (proposé par le decoupeur, relu contre le dépôt), avec trois amendements :
1. pas de tâche « Recette » séparée : la recette de chaque livraison entre dans sa dernière tâche ;
2. CRM-100 (« Tests d'écran liés à leur dossier ») est produite **avant** le run de 4.2a ; CRM-102 plus tard ;
3. **seule la livraison 4.2a et ses tâches sont créées dans Linear**. 4.2b, 4.2c et 4.2d restent écrites ici et attendent une décision après le run de 4.2a (écart assumé à la règle « toutes les tâches à l'ouverture »).

Source : `feature-4-2-opportunites.md` (D30 à D56, contrat 31 à 59, amendé ci-dessous en 31 à 62).

## Amendements du cadrage (décisions humaines, 2026-09-17)

57. **Amende le contrat 59** (F2) : il se coupe en quatre, une phrase par livraison.
   - **59** (4.2a) : à 375 px, la liste des opportunités s'affiche en cartes sans défilement horizontal avec « Nouvelle opportunité » atteignable, et la fiche en une colonne.
   - **60** (4.2b) : à 375 px, « Ajouter un consultant » reste atteignable et la section « Consultants proposés » tient sans défilement horizontal.
   - **61** (4.2c) : à 375 px, la fenêtre de conversion, case « Créer une opportunité » et modules compris, garde son bouton de confirmation visible.
   - **62** (4.2d) : à 375 px, « Marquer gagnée », « Marquer perdue » et « Rouvrir » restent atteignables, et leurs fenêtres gardent leur bouton de confirmation visible.
   Le contrat de 4.2 compte 32 phrases.
58. **Complète D55** (F4) : `GET /api/opportunites/:id/gagnee` rend l'aperçu de la victoire (retenu, propositions qui passeront « Refusé », entreprise qui deviendra cliente) et répond `409` quand rien ne permet de gagner, sur le modèle de l'aperçu de conversion.
59. **Précise D43** (F5) : le refus de suppression « issue d'un lead » est **déclaré** en 4.2a (`deletable` à deux motifs) et **prouvé** en 4.2c (contrat 58) ; « gagnée » est prouvé en 4.2d (contrat 49).
60. **Précise D54** (F6) : l'entreprise et le contact s'éditent dans « Champs » par un **type de champ « relation »** des mécanismes communs (sélecteur de fiche liée, options par condition déclarée, titre de la fiche liée en colonne, tri sur le titre) — première relation modifiable en « Champs » du CRM.
61. **Précise D47 et le contrat 52** (F7) : le sous-titre d'une fiche liée (étape, résultat) arrive en 4.2b ; entre les merges de 4.2a et 4.2b, l'entreprise et le contact montrent leurs opportunités sans étape.
62. **Précise D41 et D54** (F8) : `frozen` est déclaré en 4.2d avec sa preuve, pas en 4.2a.
63. **Précise D54** (F9) : le choix de plusieurs valeurs d'une liste (modules) est un contrôle commun, `src/features/objects/set-control.tsx`, créé en 4.2a et réutilisé par la conversion ; `consultants/module-checklist.tsx` n'est pas touché.

## Vue d'ensemble

| Tour | Livraison | Taille | Contrat | Tâches | Dans Linear |
|---|---|---|---|---|---|
| 1 | **4.2a** Créer une opportunité, la faire avancer et la retrouver | XL | 31 à 42, 59 | T1 à T4 | oui (2026-09-17) |
| 2 | **4.2b** Proposer des consultants et en retenir un | XL | 51 à 54, 60 | T5, T6 | après le run de 4.2a |
| 2, en parallèle | **4.2c** Convertir un lead en opportunité | L | 55 à 58, 61 | T7, T8 | après le run de 4.2a |
| 3 | **4.2d** Marquer gagnée ou perdue, figer, rouvrir | XL | 43 à 50, 62 | T9 à T11 | après le run de 4.2a |

Préalable : **CRM-100** mergée avant le run de 4.2a (elle modifie `e2e/global-setup.ts` et `e2e/fixtures/**`, que 4.2a modifie aussi, et corrige les suites lancées depuis le dépôt principal pour une copie). CRM-102 attend : elle touche `e2e/personnes.spec.ts`, modifié par 4.2a.

## Ce que le code a déjà (relevé du decoupeur, vérifié)

- Présent : valeur de liste réservée (`ListValue.reserved`), vue par défaut filtrée et triée, champ dérivé filtrable et triable (`attach`, `display`, `sortKey`, vides en fin), tri par rang (`sortKey`), actions d'en-tête, bannière et action d'historique déclarées, `deletable`, `createObject(…, exec, { customRequired })`, `prefill` dans la colonne des liens (« Ajouter une opportunité » gratuit), entrée de barre latérale et commande de palette par le registre, `mergeable: false`.
- Absent : relation modifiable dans « Champs » (`FieldsSection.kindOf` ne connaît ni relation ni `multilist`) ; contrôle d'ensemble hors profil consultant ; gel étendu aux sections et aux cellules ; dépendante à deux rôles (retient la suppression, suit et dédoublonne la fusion, lue par la colonne des liens) ; sous-titre d'une fiche liée.
- Deux tests énumèrent les objets en dur : `tests/consultants/liste-declaree.test.ts:53`, `tests/consultants/palette.test.ts:89`.

## Livraison 4.2a — Créer une opportunité, la faire avancer et la retrouver — XL

- **Crée** : `src/db/schema/opportunities.ts` ; `drizzle/0012_opportunites.sql`, `drizzle/meta/0012_snapshot.json` (trois tables `opportunity`, `opportunity_module`, `opportunity_consultant` — **seule migration de 4.2**) ; `src/features/opportunities/{schema,register,register.server,opportunities}.ts` ; `src/features/objects/set-control.tsx` ; `src/app/(app)/opportunites/page.tsx`, `src/app/(app)/opportunites/[id]/page.tsx` ; `src/app/api/opportunites/route.ts`, `src/app/api/opportunites/[id]/route.ts` ; `tests/opportunites/{schema,api,creation,contact,etape,liste,palette,champs-perso,archivage,refus}.test.ts` ; `e2e/opportunites-liste.spec.ts`, `e2e/opportunites-fiche.spec.ts`, `e2e/fixtures/opportunites.ts`.
- **Modifie** : `src/db/schema/index.ts`, `drizzle/meta/_journal.json` ; `src/features/objects/{registry,registry.server,manifest,manifest.server,service,fields,labels}.ts`, `src/features/objects/{fields-section,field-control,quick-create-dialog,object-sheet,object-list}.tsx` ; `src/features/lists/{sort,operators,filters}.ts`, `src/features/lists/inline-edit.tsx` (type « relation ») ; `src/app/api/objets/[type]/options/route.ts` (seulement si les options conditionnées passent par la route) ; `tests/objets/{branchement,mecanismes-sans-objet}.test.ts`, `tests/consultants/{liste-declaree,palette}.test.ts` ; `e2e/{personnes,consultants-creation,leads-liste}.spec.ts` (une ligne chacune : « Opportunités » cinquième entrée) ; `e2e/fixtures/{leads,objets,personnes}.ts` (une ligne chacune : `resetOpportunities()` en tête) ; `e2e/global-setup.ts` (facultatif) ; `.pilot/amorce-recette.js` ; `UAT.md`.
- **Interdits** : `src/features/leads/**`, `src/features/consultants/**` (lecture de `MODULES` seulement), `src/features/persons/**`, `src/features/companies/**`, `src/features/merge/**`, `src/features/archive/**`, `src/features/objects/links-column.tsx` (4.2b), `tests/leads/**`, `e2e/leads-fiche.spec.ts`, `e2e/leads-conversion.spec.ts` ; toute autre migration.
- **Toutes les listes fermées** de 4.2 vivent dans `src/features/opportunities/schema.ts` dès 4.2a : étapes et rangs, probabilités, motifs de perte, résultats et leur rang. 4.2b et 4.2d les lisent sans y toucher.
- **Déclarés dès 4.2a** pour que 4.2c et 4.2d ne rouvrent pas `register*.ts` pour cela : la relation `leadId` (« Issu du lead » / « Opportunité », `keepArchived`), `deletable` à deux motifs (gagnée, issue d'un lead), `createOpportunity` avec `exec` et une option de geste (étape, `leadId`, `customRequired: false`).
- **Points de contact du tour 2** : l'amorce se termine par trois ancres de commentaire « Livraison 4.2b », « Livraison 4.2c », « Livraison 4.2d » ; `UAT.md` § « Feature 4 — 4.2 Opportunités » porte quatre sous-sections dans l'ordre (L'opportunité ; Les propositions ; La conversion d'un lead en opportunité ; Gagnée, perdue, rouvrir), la première remplie, les trois autres avec leur titre et une ligne « Préparation ».
- Contrat : 31 à 42, 59. Décisions : 30 à 38, 43 (déclaration), 48, 49 (liste et fiche), 53, 54, 55 (création, modification, clés posées par un geste), 56, 57, 59, 60, 63.

### T1 — Opportunité : champs, montant et bornes

Terminé quand :
- [ ] Titre obligatoire, non vide après retrait des espaces, 120 caractères au plus ; 121 → `400` sous le champ (D31, contrat 39).
- [ ] Entreprise obligatoire (D31, contrat 39).
- [ ] Modules Workday : au moins un, pris dans la liste des modules des consultants ; un module hors liste → `400` sous le champ (D31, contrat 39).
- [ ] Un module retiré de la liste reste lisible « retiré » sur l'opportunité qui le porte et ne se choisit plus (D31).
- [ ] Besoin facultatif, 2 000 caractères au plus (D31).
- [ ] TJM de vente cible facultatif ; 0, 5 000,01 ou trois décimales → `400` sous le champ (D31, contrat 39).
- [ ] Durée estimée facultative ; 0, 1 001 ou 2,5 → `400` sous le champ (D31, contrat 39).
- [ ] TJM 650 et durée 60 : le montant estimé affiche « 39 000,00 € » sur la fiche et dans la liste (D31, contrat 33).
- [ ] Le montant estimé affiche « — » quand le TJM ou la durée manque ; vider la durée l'y ramène (D31, contrat 33).
- [ ] Montant estimé en lecture seule, jamais saisissable (D31).
- [ ] Clôture prévue obligatoire ; une date passée est acceptée à la création et en modification (D31, D48).
- [ ] Démarrage souhaité : date facultative (D31).
- [ ] Nombres et montants au format français sur la fiche et dans la liste ; valeur brute pendant la saisie (D31).
- [ ] Refus : sur la fiche, vider le titre, l'entreprise ou la clôture prévue, ou retirer le dernier module, répond `400` sous le champ et la valeur enregistrée revient (D34, contrat 39).
- [ ] Refus : une clé imprévue à la création ou en modification répond `400` et rien n'est écrit (D55).

Cas de test attendus : chaque borne des nombres et des textes ; montant calculé et montant absent ; module retiré ; date passée acceptée ; vider chacun des quatre champs obligatoires sur la fiche ; clé imprévue.

### T2 — Création rapide et contact de l'entreprise

Terminé quand :
- [ ] « Nouvelle opportunité » depuis la liste ouvre la création rapide à quatre champs : titre, entreprise, modules, clôture prévue (D34, contrat 31).
- [ ] Créée, l'opportunité s'ouvre à « Nouveau besoin », probabilité « 10 % », le créateur en responsable, et figure dans « Opportunités en cours » (D34, contrat 31).
- [ ] La palette ⌘K propose « Nouvelle opportunité », qui ouvre la même création rapide (D34, D48, contrat 32).
- [ ] Sur la fiche d'une entreprise, « Ajouter une opportunité » dans la colonne des liens ouvre la création rapide, entreprise pré-remplie et modifiable (D34, contrat 32).
- [ ] L'entreprise et le contact se modifient dans « Champs » par un sélecteur de fiche liée (D60).
- [ ] Le sélecteur de contact ne propose que les personnes portant un profil contact de l'entreprise de l'opportunité, 200 au plus, « et N autres » (D35, contrat 35).
- [ ] Changer l'entreprise vide le contact dans la même écriture, et l'historique garde l'ancien contact (D35, contrat 35).
- [ ] Une écriture qui change l'entreprise **et** désigne un contact le vérifie contre la nouvelle entreprise (D35, contrat 41).
- [ ] Chaque champ modifié écrit une ligne d'historique avec ancienne et nouvelle valeur (D35).
- [ ] Un contact passé ensuite dans une autre entreprise reste lié, affiché « a quitté Banque X » (D35, contrat 41).
- [ ] Une entreprise ou un contact archivé après coup reste lié, marqué « archivée » / « archivé » (D36, contrat 41).
- [ ] Refus : créer sans titre, sans entreprise, sans module ou sans clôture prévue répond `400` sous le champ, et rien n'est créé (D34, contrat 39).
- [ ] Refus : un contact sans profil contact chez l'entreprise de l'opportunité répond `400` sous le champ (D35, contrat 41).
- [ ] Refus : une entreprise ou un contact archivé, à la création comme en modification, répond `409` avec un message qui nomme la fiche (D36, contrat 41).

Cas de test attendus : création depuis la liste, la palette et l'entreprise ; options du contact bornées à l'entreprise ; changement d'entreprise seul et avec contact ; contact parti ; fiche liée archivée après coup ; les refus 400 et 409 ; preuve sur l'objet « Test » d'une relation à options conditionnées.

### T3 — Étape, probabilité et historique

Terminé quand :
- [ ] Étapes dans cet ordre : Nouveau besoin, Qualifié, Profils proposés, Entretien client, Proposition envoyée, Négociation, Gagnée, Perdue (D32).
- [ ] On passe librement entre les six étapes en cours, dans les deux sens, sur la fiche et en cellule de liste (D32, contrat 34).
- [ ] La probabilité suit l'étape : 10, 20, 30, 50, 70, 80, 100, 0 % ; « Entretien client » affiche 50 %, retour à « Qualifié » 20 % (D33, contrat 34).
- [ ] La probabilité est en lecture seule sur la fiche et en cellule (D33).
- [ ] Chaque passage d'étape écrit une ligne d'historique avec ancienne et nouvelle valeur, auteur et date ; aucune ligne de probabilité (D32, D33, contrat 34).
- [ ] Aucun passage automatique : une note ou une tâche ajoutée ne change pas l'étape (D32).
- [ ] Trier par étape suit le rang du pipeline : Nouveau besoin avant Qualifié, Gagnée puis Perdue en dernier (D32, contrat 36).
- [ ] Refus : « Gagnée » et « Perdue » ne sont proposées ni dans le sélecteur de la fiche ni dans la cellule (D32, contrat 40).
- [ ] Refus : poser « Gagnée » ou « Perdue » par une modification répond `400` (D32, contrat 40).
- [ ] Refus : fournir une probabilité, un montant estimé, une date « Gagnée ou perdue le », un motif ou un commentaire de perte, ou un lien vers un lead, à une création ou une modification, répond `400` (D55, contrat 40).

Cas de test attendus : chaque étape et sa probabilité ; aller-retour d'étape et historique ; activité sans effet sur l'étape ; tri par rang ; valeurs réservées absentes et refusées ; chaque clé posée par un geste refusée.

### T4 — Liste, vues, palette et recette

Terminé quand :
- [ ] « Opportunités » apparaît dans la barre latérale juste après « Leads » (D38, contrat 31).
- [ ] La vue par défaut « Opportunités en cours » porte les puces « Étape n'est pas gagnée » et « Étape n'est pas perdue », trie par clôture prévue croissante et exclut les archivées (D38, contrat 36).
- [ ] Colonnes par défaut : Titre, Entreprise, Étape, Probabilité, Montant estimé, Clôture prévue, Responsable ; Contact, Modules Workday, TJM de vente cible, Durée estimée, Démarrage souhaité, Motif de perte, Créé le disponibles (D38, contrat 36).
- [ ] Retirer les deux puces fait apparaître les opportunités gagnées et perdues (D38, contrat 36).
- [ ] « Probabilité plus grand que 50 » ne garde que Proposition envoyée, Négociation et Gagnée (D33, contrat 36).
- [ ] « Montant estimé plus grand que 30 000 », triée par montant, range les opportunités sans montant en dernier ; la vue s'enregistre, s'épingle et se rouvre (D31, D37, contrat 36).
- [ ] La palette ⌘K retrouve une opportunité par « payr » ou « banque x », sous-titre « Négociation · Banque X », gagnées et perdues comprises (D48, contrat 37).
- [ ] Paramètres → Champs propose « Opportunités » ; un champ personnalisé se saisit sur la fiche et devient colonne et filtre (D37, contrat 38).
- [ ] Une opportunité s'archive et se restaure ; un administrateur supprime définitivement une opportunité en cours, et ses modules partent avec elle (D37, D43).
- [ ] À 375 px, la liste s'affiche en cartes sans défilement horizontal avec « Nouvelle opportunité » atteignable, et la fiche en une colonne (D49, contrat 59).
- [ ] Recette : `UAT.md` § « Feature 4 — 4.2 Opportunités » porte ses quatre sous-sections, la première remplie ; l'amorce pose une opportunité par étape en cours et un lead qualifié avec besoin, et finit par les ancres 4.2b, 4.2c, 4.2d (D56).
- [ ] Refus : une opportunité archivée n'apparaît pas dans la palette (D48, contrat 37).
- [ ] Refus : « Opportunités en cours » ne se renomme ni ne se supprime (`409`) (D38).
- [ ] Refus : une opportunité n'offre pas « Fusionner… », l'API de fusion répond `405`, et deux opportunités de même titre ne portent aucune bannière « doublon probable » (D37, contrat 42).
- [ ] Refus : citer `opportunity` dans un mécanisme commun rend le garde-fou rouge (D54).

Cas de test attendus : vue par défaut, puces retirées, filtres probabilité et montant, vue enregistrée et épinglée ; palette et archivée exclue ; champ personnalisé ; archivage, restauration, suppression avec modules ; vue par défaut non renommable ; fusion 405 ; garde-fou ; 1280 et 375 px par Playwright.

## Livraison 4.2b — Proposer des consultants et en retenir un — XL (non créée)

- **Crée** : `src/features/opportunities/proposals.ts`, `proposals-section.tsx` ; `src/app/api/opportunites/[id]/propositions/route.ts`, `src/app/api/opportunites/[id]/propositions/[personId]/route.ts` ; `tests/opportunites/{propositions,propositions-refus,liens,fusion-propositions}.test.ts` ; `e2e/opportunites-propositions.spec.ts`.
- **Modifie** : `src/features/opportunities/{register,register.server}.ts` ; `src/features/objects/{registry.server.ts,links-column.tsx}` ; `src/features/archive/delete.ts`, `delete-dialog.tsx` (peut-être) ; `src/features/merge/merge.ts` ; `src/features/persons/register.server.ts` ; `tests/objets/branchement.test.ts` ; `tests/archivage/suppression.test.ts`, `tests/fusion/*.test.ts` (si la forme change) ; `.pilot/amorce-recette.js` (sous son ancre) ; `UAT.md` (sa sous-section).
- **Interdits** : `src/features/leads/**`, `src/features/opportunities/{opportunities,schema}.ts`, `src/features/objects/*` hors `registry.server.ts` et `links-column.tsx`, `src/features/consultants/**`, `tests/leads/**`, `e2e/leads-*.spec.ts`, `e2e/fixtures/**`, `drizzle/**`, `src/db/**`.
- Produite après 4.2a, en parallèle de 4.2c. Contrat : 51 à 54, 60. Décisions : 44 à 47, 49, 54 (dépendante à deux rôles), 55 (routes des propositions), 56, 61.
- **T5 — Consultants proposés et résultat** : section, sélecteur borné avec l'état, TJM proposé facultatif pré-rempli, résultat libre, un seul « Retenu » relu sous verrou, retrait, consultant archivé après ajout ; une ligne d'historique par geste. Contrats 51, 53.
- **T6 — Liens, suppression, fusion et recette** : `DependentTable` à rôles déclarés (retient la suppression, lue par la colonne des liens, suit la fusion et se dédoublonne par résultat), sous-titre d'une fiche liée, fusion permise sur une opportunité figée ; spec e2e, amorce sous l'ancre 4.2b, `UAT.md` § Les propositions, 375 px. Contrats 52, 54, 60.

## Livraison 4.2c — Convertir un lead en opportunité — L (non créée)

- **Crée** : `tests/leads/{conversion-opportunite,conversion-opportunite-refus,conversion-opportunite-fenetre}.test.ts` ; `e2e/leads-conversion-opportunite.spec.ts`.
- **Modifie** : `src/features/leads/{conversion.ts,convert-dialog.tsx,register.server.ts}` ; `src/features/opportunities/opportunities.ts` (s'il faut compléter le chemin de geste) ; `e2e/leads-conversion.spec.ts` (seulement si un cas existant change) ; `.pilot/amorce-recette.js` (sous son ancre) ; `UAT.md` (sa sous-section).
- **Interdits** : `src/features/opportunities/{register,register.server,schema,proposals*}`, `src/features/objects/**`, `src/features/persons/**`, `src/features/archive/**`, `src/features/merge/**`, `tests/objets/**`, `tests/opportunites/**`, `e2e/opportunites-*.spec.ts`, `e2e/fixtures/**`, `drizzle/**`, `src/db/**`, `src/app/api/leads/[id]/conversion/route.ts`.
- Produite après 4.2a, en parallèle de 4.2b. Contrat : 55 à 58, 61. Décisions : 43 (preuve « issue d'un lead »), 49, 50, 51, 52, 55 (conversion étendue), 56.
- **T7 — Conversion qui crée l'opportunité** : bloc `opportunity` validé avant la première écriture, étape « Qualifié », entreprise retenue, contact, besoin, responsable, `leadId`, champ personnalisé obligatoire non exigé, historique du lead ; refus 400 sans rien créer ; suppression d'une opportunité issue d'un lead → 409. Contrats 55 (serveur), 56, 58.
- **T8 — Case « Créer une opportunité » et recette** : case cochée si besoin, titre pré-rempli coupé à 120 qui suit l'entreprise, modules par `set-control.tsx`, clôture, bandeau du lead vers l'opportunité ; spec e2e, amorce sous l'ancre 4.2c, `UAT.md` § La conversion, 375 px. Contrats 55 (écran), 57, 61.

## Livraison 4.2d — Marquer gagnée ou perdue, figer, rouvrir — XL (non créée)

- **Crée** : `src/features/opportunities/closing.ts`, `closing-actions.tsx` ; `src/app/api/opportunites/[id]/{gagnee,perdue,rouvrir}/route.ts` ; `tests/opportunites/{gagnee,perdue,rouvrir,figee,suppression}.test.ts` ; `e2e/opportunites-fin.spec.ts`.
- **Modifie** : `src/features/opportunities/{register,register.server}.ts` ; `src/features/objects/{object-sheet,object-list}.tsx` (gel étendu aux sections et aux cellules) ; `src/features/objects/service.ts` (seulement si `updateObject` reçoit `exec`) ; `tests/objets/branchement.test.ts` ; `.pilot/amorce-recette.js` (sous son ancre) ; `UAT.md` (sa sous-section).
- **Interdits** : `src/features/leads/**`, `src/features/opportunities/{opportunities,schema,proposals*}`, `src/features/persons/**`, `src/features/companies/**` (le type s'écrit dans la transaction par `tx.update(company)` et `recordHistory`), `src/features/merge/**`, `src/features/archive/**`, `tests/leads/**`, `e2e/leads-*`, `e2e/fixtures/**`, `drizzle/**`, `src/db/**`.
- Produite après 4.2b et 4.2c. Contrat : 43 à 50, 62. Décisions : 39 à 42, 43 (sauf « issue d'un lead »), 49, 54 (gel étendu), 55, 56, 58, 62.
- **T9 — Marquer perdue** : fenêtre motif et commentaire, étape et date, propositions intactes, action d'historique. Contrats 43, 47 (perdue).
- **T10 — Marquer gagnée** : aperçu `GET` (D58), transaction relue sous verrou (étape, date, propositions refusées, prospect → client au nom du membre), une seule action d'historique ; refus sans retenu, retenu ou entreprise archivés, gestes simultanés, échec en chemin. Contrats 44, 46, 50.
- **T11 — Figer, bandeau, rouvrir et recette** : `frozen` étendu aux sections et cellules, bandeau, ordre des bannières, « Rouvrir », archivée sans gestes, gagnée non supprimable, perdue supprimée avec propositions et modules ; spec e2e, amorce sous l'ancre 4.2d, `UAT.md` § Gagnée, perdue, rouvrir, 375 px. Contrats 45, 47 (reste), 48, 49, 62.

## Ordre et parallélisme

- **Tour 1 — 4.2a seule** (poste A) : seule à ouvrir `objects/`, `lists/`, la migration, le manifeste et le garde-fou.
- **Tour 2 — 4.2b (poste A) ∥ 4.2c (poste B)** : fichiers disjoints ; `UAT.md` et l'amorce écrits chacun sous sa sous-section et son ancre (vérifié par `diff3 -m`). Cinq arbitrages à recopier dans les deux ordres de mission : (1) `leadId` et `deletable` déclarés par 4.2a ; (2) listes fermées dans `schema.ts`, lues seulement ; (3) `opportunities.ts` rouvert par 4.2c seule ; (4) amorce et `UAT.md` sous l'ancre, jamais ailleurs ; (5) fixtures e2e fermées.
- **Tour 3 — 4.2d seule** : elle a besoin des propositions et rouvre `register*.ts`, `object-sheet.tsx`, `object-list.tsx`.

## Détails appliqués par défaut

- Le passage prospect → client s'écrit dans la transaction de la victoire (`tx.update(company)` + `recordHistory`, auteur = le membre), sans toucher `companies/`.
- Le résultat d'une proposition s'historise par une action déclarée « proposition ».
- La proposition perdue à la fusion se consigne par `describe`.
- `resetOpportunities()` s'appelle en tête de `resetLeads()`, `resetPersons()` et `resetObjects()`.
- `keepArchived` sur la relation `leadId` masque le groupe inverse vide des leads sans opportunité.
