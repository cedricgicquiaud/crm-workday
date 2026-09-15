# Découpage — feature 3 « Les consultants Workday »

Statut : **validé** le 2026-09-15 par Cédric (découpeur, repris par le lead ; huit frontières tranchées dans le sens proposé). Tâches CRM-73 (réaffectée), CRM-78 à CRM-88 créées, 4 jalons, feature « Planifiée », relevée XL (annoncée M). **Quatre tours en série, un producteur par tour** : chaque livraison rouvre le registre, le tri ou la liste que la suivante rouvre aussi. Le second producteur reste libre (CRM-69, CRM-76 sont hors des fichiers ci-dessous ; CRM-72 non).

| # | Livraison (résultat constaté) | Taille | Contrat | Produite après | Tâches |
|---|---|---|---|---|---|
| 3.0 | La fiche personne est composée par la fiche générique à partir de sections déclarées ; un seul composant rend un champ (CRM-73) | L | 1 | — | CRM-73, 78, 79 |
| 3.1a | Une personne porte un profil consultant (statut, modules certifiés, société de facturation, coût, expérience, langues, CV) ; palette et fusion le connaissent | L | 3, 5, 6, 8, 9, 10 | 3.0 | CRM-80, 81, 82 |
| 3.1b | « Consultants » est dans la barre latérale ; « Nouveau consultant » crée personne et profil ; la palette gagne ses entrées de création | L | 2, 4, 7 | 3.1a | CRM-83, 84 |
| 3.2 | L'état (disponible, en mission, indisponible, « à replacer ») se lit sur la fiche et dans la liste, qui se filtre, se trie par rang, s'enregistre en vue, passe en cartes | L | 11 à 19 | 3.1b | CRM-85 à 88 |

Dates (barème L 4,1 h + 0,5 h, 5,4 jours actifs par semaine) : 3.0 le 15/09, 3.1a le 16/09, 3.1b le 17/09, 3.2 le 17/09. Fenêtres plausibles, pas des promesses.

## Ordre de série et pourquoi

- **3.0 seule** (D20) : elle réécrit `object-sheet.tsx`, `fields-section.tsx`, `quick-create-dialog.tsx`, `contact-profile-section.tsx` et les déclarations de la personne ; 3.1a rouvre quatre de ces fichiers.
- **3.1a avant 3.1b** : 3.1b a besoin de la migration, du type `multilist`, du descripteur `profile` et du chargeur `attach` ; le contrat 2 exige la liste, donc 3.1b ne peut pas attendre 3.2.
- **3.2 après 3.1b** : `registry.ts` (3.1a : `multilist`, `profile`, `unit`, `lists` ; 3.1b : `lists` ; 3.2 : `display`, `sortKey`), `sort.ts`, `labels.ts`, `object-list.tsx`, `persons/register*.ts`, `consultants/*` sont rouverts à chaque tour : un seul écrivain possible par tour.
- **Couper 3.1 en deux** (frontière F1) : 3.1 entière dépassait 2.6a (4 200 lignes), dont l'audit avait trouvé deux bloquants ; aucun coût de calendrier, toujours en série.

## Principes retenus

- **Pas de socle transverse** : chaque extension de mécanisme arrive avec la livraison qui en a besoin, générique (clé d'objet en paramètre), et se prouve sur l'objet « Test » (`tests/objets/branchement.test.ts`, `tests/listes/objet-de-test.ts`) : sections déclarées (3.0), champ `multilist` et chargeur `attach` (3.1a), liste déclarée (3.1b), champ dérivé `display` / `sortKey` (3.2).
- **Le profil consultant est une déclaration de la personne** (PRD, D1, D19) : ses champs entrent dans `PERSON_FIELDS` avec `profile: "consultant"`, sa relation « Société de facturation » dans `relations`, sa liste dans `lists`, sa table dans `dependents`, ses valeurs jointes par `attach`. Aucun mécanisme ne cite `consultant` : le garde-fou l'interdit dès 3.0.
- **`fieldsOf(type)` garde tous les champs** (colonnes, filtres, tri, historique) ; un champ `profile` est écarté de « Champs », du dialogue de l'objet, de l'édition en cellule et de la validation de l'API de l'objet (`400`), et `required` s'entend dans le profil. Seuls les champs consultant portent `profile` ; « Poste » ne bouge pas (F6).
- **Une seule migration**, `drizzle/0010_consultants.sql`, en 3.1a : elle pose aussi ce que 3.1b et 3.2 lisent (clé de vue propre à une liste comprise, si colonne). 3.0, 3.1b et 3.2 n'en créent aucune.
- **Chemins** : `/consultants`, `PATCH /api/personnes/:id/profil-consultant`, `POST /api/consultants` ; les listes déclarées passent par la route générique de l'objet avec la clé de liste, filtre de base appliqué côté serveur et jamais retirable par l'URL (contrat 17).
- **Historique** : l'ancienne valeur absente s'écrit « vide » (F3, comme le fil) ; « Indisponible » est une liste oui / non rendue en case (F4) ; entrées de création de la palette générées depuis le registre pour les trois objets (F7).

## Points de contact (qui les touche, quand)

| Fichier | Traitement |
|---|---|
| `src/features/objects/registry.ts` | 3.0 : `headerFields`. 3.1a : `multilist`, `profile`, `unit` / `decimals` / `integer`, `emptyLabel`. 3.1b : `lists`. 3.2 : `display`, `sortKey`. |
| `src/features/objects/registry.server.ts` | 3.0 : `sections` (clé, rang, chargeur, rendu). 3.1a : `attach`, `describe` sur `DependentTable`. 3.1b : filtre de base d'une liste. 3.2 : rien. |
| `src/features/objects/object-sheet.tsx`, `fields-section.tsx`, `field-control.tsx` (nouveau), `links-column.tsx`, `src/features/persons/{contact-profile-section.tsx,company-picker.tsx}`, `src/app/(app)/personnes/[id]/page.tsx` | 3.0 seule. |
| `src/features/objects/quick-create-dialog.tsx` | 3.0 (`FieldControl`), puis 3.1b (création déclarée par une liste, champs `profile` exclus). |
| `src/features/persons/register.ts` | 3.0 : `headerFields`. 3.1a : champs du profil, relation « Société de facturation ». 3.1b : liste « Consultants ». 3.2 : champ « État », colonne par défaut. |
| `src/features/persons/register.server.ts` | 3.0 : section « Profil contact ». 3.1a : `dependents`, `attach`, section « Profil consultant », sous-titre de recherche. 3.1b : filtre de base. 3.2 : `attach` calcule l'état. |
| `drizzle/0010_*`, `drizzle/meta/*`, `src/db/schema/{index.ts,persons.ts,consultants.ts}`, `src/features/companies/schema.ts` | 3.1a seule. |
| `src/features/objects/{service,fields,labels}.ts`, `src/features/lists/{operators,apply-filters,sort,columns}.ts`, `lists/{filter-chips,inline-edit}.tsx`, `src/features/merge/merge.ts` | 3.1a. 3.2 rouvre `labels.ts`, `sort.ts`, `inline-edit.tsx`. |
| `src/features/objects/{object-list,objects-nav}.tsx`, `objects/palette-entries.ts` (nouveau), `src/features/lists/url-state.ts`, `src/features/views/**`, `src/app/api/vues/route.ts`, `src/app/(app)/consultants/page.tsx`, `src/app/api/consultants/route.ts`, `src/features/consultants/consultants.ts` | 3.1b. 3.2 rouvre `object-list.tsx`. |
| `src/features/consultants/{schema,consultant-profile}.ts`, `consultant-profile-section.tsx`, `module-checklist.tsx`, `billing-company-picker.tsx`, `src/app/api/personnes/[id]/profil-consultant/route.ts` | 3.1a. 3.2 rouvre `schema.ts`, `consultant-profile.ts`, `consultant-profile-section.tsx` et crée `state.ts`. |
| `src/features/lists/list-cards.tsx` | 3.2 seule. |
| `tests/objets/mecanismes-sans-objet.test.ts`, `tests/objets/composition-declaree.test.ts` | 3.0 seule. |
| `tests/objets/branchement.test.ts`, `tests/listes/objet-de-test.ts` | 3.1a (`attach`, `multilist`), 3.1b (liste déclarée), 3.2 (champ dérivé). |
| `tests/personnes/*`, `tests/fusion/personnes.test.ts` | 3.0 (`registre-personne`), 3.1a (« Profils » en ensemble, opérateur « contient », profil en fusion). |
| `e2e/personnes.spec.ts` | 3.0 : intouché (contrat 1). 3.1b : une ligne (barre latérale à trois entrées, F2). |
| `e2e/consultants-profil.spec.ts` / `consultants-creation.spec.ts` / `consultants-etat.spec.ts`, `consultants-liste.spec.ts` | 3.1a / 3.1b / 3.2 (nouveaux). |
| `UAT.md` | 3.0 pré-crée « Feature 3 » (3.0, 3.1a, 3.1b, 3.2) et remplit 3.0 ; chaque livraison remplit la sienne. |
| `.pilot/amorce-recette.js` | 3.1a seule (quatre consultants, disponibilité comprise). |
| `src/features/shell/**` (sauf `nav-entries.ts` si les entrées de création ne peuvent pas s'enregistrer depuis `objects/`), `src/features/search/**`, `archive/**`, `custom-fields/**`, `activities/**` (`feed.ts` compris), `history/**`, `duplicates/**`, `src/components/ui/*`, `e2e/fixtures/*` | Personne. |

## Livraisons et tâches

Le détail de chaque tâche (Problème, Ce qu'on fait, Terminé quand avec refus) est dans sa fiche Linear ; les fichiers et les numéros de contrat de chaque livraison sont dans la description de son jalon (ce que `run` recopie dans les `MISSION.md`).

- **3.0** : CRM-73 Sections déclarées, page personne mince · CRM-78 Un composant unique rend un champ · CRM-79 Garde-fou étendu à « consultant », cahier de recette.
- **3.1a** : CRM-80 Tables, migration 0010 et registre étendu · CRM-81 Profil consultant sur la fiche, API, historique · CRM-82 Palette, fusion, tests de la feature 2 amendés, amorce.
- **3.1b** : CRM-83 Liste « Consultants » déclarée au registre · CRM-84 « Nouveau consultant » et entrées de création dans la palette.
- **3.2** : CRM-85 État dérivé et mention « à replacer » · CRM-86 État en colonne, filtre et tri par rang · CRM-87 Liste des personnes, vues, refus d'URL · CRM-88 Cartes à 375 px et recette.

## Frontières tranchées le 2026-09-15 (réponse : la proposition, à chaque fois)

F1 couper 3.1 en 3.1a / 3.1b · F2 une ligne de `e2e/personnes.spec.ts` en 3.1b · F3 « vide » dans l'historique, contrat 3 amendé · F4 « Indisponible » en liste oui / non · F5 « Profils » colonne ou dérivé : au producteur · F6 « Poste » ne bouge pas · F7 entrées de création de la palette générées pour les trois objets · F8 clé de vue : au producteur.

## Contrôles

- Contrat : 19 phrases, chacune dans une seule livraison (1 → 3.0 ; 3, 5, 6, 8, 9, 10 → 3.1a ; 2, 4, 7 → 3.1b ; 11 à 19 → 3.2).
- Fichiers : aucun fichier créé par deux livraisons ; les éditions successives sont dans le tableau des points de contact, et les quatre tours sont en série, donc aucune ligne disputée au merge.
- Tâches : 11 (3 + 3 + 2 + 4), chacune avec au moins un refus ; jalons : 4. Annoncé / créé : 11 / 11, 4 / 4.
