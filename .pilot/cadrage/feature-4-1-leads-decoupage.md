# Découpage — livraison 4.1 « Leads » (feature 4 « Le pipeline commercial »)

Statut : **validé** le 2026-09-16 par Cédric (découpeur, repris par le lead ; six frontières et quatre détails dans le sens proposé ; trois affirmations vérifiées dans le code : `writeContactProfile` ouvre sa propre transaction, `DeleteBlocker` ne rend qu'un libellé et un compte, `defaultColumnKeys` ajoute toujours « Modifiée le »). Contrat amendé (9, 14, 30) dans `feature-4-1-leads.md` et dans la fiche Linear. **Créé dans Linear le 2026-09-16** : jalons « 4.1a Créer, faire avancer et écarter un lead » (ancien jalon « Leads », renommé) et « 4.1b Convertir un lead en contact et entreprise », rangés avant « Opportunités » ; tâches T1 à T9 = **CRM-90 à CRM-98** (4.1a : CRM-90 à 94 ; 4.1b : CRM-95 à 98), label `code`, « À faire », rangées dans l'ordre ; feature « Planifiée », relevée XL (annoncée L). Annoncé / créé : 9 / 9 tâches, 2 / 2 jalons. Dates (`schedule.py`, barème L 4,6 h, XL 7,5 h, 6,7 h par jour actif, 5,3 jours actifs par semaine, départ 17/09 derrière 3.2) : 4.1a le 18/09, 4.1b le 19/09 ; 4.2 à 4.5 gardent leurs dates, à recaler par `sync`. Fiche sondée : CRM-96, conforme au moule.
Cadrage : `feature-4-1-leads.md` (23 décisions, 29 phrases de contrat).

| # | Livraison (résultat constaté) | Taille | Contrat | Produite après | Tâches |
|---|---|---|---|---|---|
| 4.1a | Un membre crée un lead depuis « Leads » ou la palette, le fait avancer, l'écarte et le rouvre ; « Leads en cours » filtre et trie par « Créé le » ; la palette le retrouve ; ni fusion ni doublon probable | XL | 1 à 13, 14 (F2) | 3.2 mergée | T1 à T5 |
| 4.1b | Un lead se convertit en personne + profil contact + entreprise en une transaction ; converti, ses champs se figent (fil vivant), il porte son bandeau, lie ses fiches « Issu du lead » même archivé, et ne se supprime plus | XL | 15 à 29, 30 (F2) | 4.1a mergée | T6 à T9 |

## Ordre de série et pourquoi

- **Rien de 4.1 ne tourne en même temps que 3.2** (CRM-85 à 88, pas encore produite) : 4.1a rouvre huit fichiers que 3.2 rouvre (`objects/registry.ts`, `lists/sort.ts`, `objects/labels.ts`, `lists/inline-edit.tsx`, `objects/object-list.tsx`, `lists/list-cards.tsx`, `tests/objets/branchement.test.ts`, `UAT.md`). Aucune tranche de 4.1 visible par l'utilisateur n'évite `registry.ts`.
- **4.1b après 4.1a** : mêmes `leads/register*.ts`, `registry*.ts`, `service.ts`, `object-sheet.tsx`, amorce, `UAT.md`.
- Trois tours en série (3.2, 4.1a, 4.1b), un producteur par tour ; le second poste prend des tâches isolées hors de ces fichiers.

## Ce que le code a déjà (D21)

| Extension | État |
|---|---|
| Lecture seule des champs selon la fiche, fil ouvert | Absente : `readOnly` = `archivedAt` (`object-sheet.tsx`, `assertWritable` de `service.ts`, appelé aussi par `activities.ts`). |
| Refus de fusion déclaré | Absent (`merge.ts`, `object-actions-menu.tsx`). |
| Refus de suppression selon la fiche | Absent ; mais une relation déclarée retient déjà la suppression, archivées comprises (`delete.ts`). |
| Actions déclarées dans l'en-tête | Absentes ; gabarit : les sections de `registry.server.ts`. |
| Bannière déclarée | Absente (`banners.tsx` fermé). |
| Vue par défaut filtrée et triée, adresse « aucun filtre » | Absente (`views.ts` `query: ""`, `url-state.ts`). |
| Valeurs non posables, champ lu en texte selon la fiche | Partiel (`retiredValues`, `editable: false` pour toutes les fiches). |
| Colonne et tri « Créé le » | Absents (« Modifiée le » seule colonne de base). |
| Action d'historique « conversion » | Absente (`HistoryAction` fermé, `feed.ts`). |
| Relation gardée « même archivée » | Absente (`links-column.tsx`) ; la fusion re-pointe déjà toute relation (C29 gratuit). |

Gratuit : entrée « Leads » de la barre latérale, « Nouveau lead » dans la palette, Paramètres → Champs, archivage et restauration, opérateur « n'est pas ».

## Livraisons et tâches

### 4.1a — XL — contrat 1 à 13, 14

- **Crée** : `src/db/schema/leads.ts` ; `drizzle/0011_leads.sql`, `drizzle/meta/0011_snapshot.json` ; `src/features/leads/{schema,register,register.server,leads,email-known}.ts`, `lead-actions.tsx` ; `src/app/(app)/leads/page.tsx`, `src/app/(app)/leads/[id]/page.tsx` ; `src/app/api/leads/route.ts`, `[id]/route.ts`, `[id]/ecarter/route.ts`, `[id]/rouvrir/route.ts` ; `tests/leads/{schema,titre,api,avancement,email-connu,liste,palette,refus}.test.ts` ; `e2e/leads-fiche.spec.ts`, `e2e/leads-liste.spec.ts`, `e2e/fixtures/leads.ts`.
- **Modifie** : `src/db/schema/index.ts`, `drizzle/meta/_journal.json` ; `src/features/objects/{registry,registry.server,manifest,manifest.server,service,fields,labels}.ts`, `{fields-section,object-sheet,object-actions-menu,object-list}.tsx` ; `src/features/lists/{columns,sort,url-state}.ts`, `{inline-edit,list-cards}.tsx` ; `src/features/views/views.ts`, `view-bar.tsx` ; `src/features/merge/merge.ts` ; `src/features/duplicates/duplicates.ts`, `duplicate-warning.tsx` ; `src/features/persons/emails.ts` (export de `holderOf`) ; `tests/objets/{mecanismes-sans-objet,branchement}.test.ts`, `tests/listes/objet-de-test.ts`, `tests/listes/{url-state,tri}.test.ts`, `tests/vues/{url,vues}.test.ts`, `tests/consultants/palette.test.ts` ; `e2e/personnes.spec.ts` et `e2e/consultants-creation.spec.ts` (une ligne chacun : « Leads » quatrième entrée), `e2e/global-setup.ts` (facultatif) ; `.pilot/amorce-recette.js` ; `UAT.md`.

| Tâche | Ce qu'on fait | Terminé quand (dont refus) |
|---|---|---|
| T1 Table `lead`, migration 0011, descripteurs, titre calculé | Seule migration de 4.1, colonnes `converted_*` comprises ; `LEAD_FIELDS` ; `leadTitle()` | Migration rejouée sans effet ; quatre formes de titre ; **refus** : score 0, 4, 2,5, email de 201 caractères, LinkedIn sans `http(s)://` → 400 sous le champ |
| T2 Le lead au registre : fiche, création rapide, API, avancement, Écarter, Rouvrir | Service (règle des trois champs, titre recalculé), routes, actions déclarées dans l'en-tête, `lockedWhen` sur un champ, `reserved` sur une valeur | Contrats 1 à 4, 8, 10 à 12 ; **refus** : création sans les trois champs → 400 message unique ; « converti » par l'API → 400 ; avancement d'un écarté → 409 ; écarter un archivé → 409 ; preuves sur l'objet « Test » |
| T3 « Leads en cours » : vue par défaut filtrée et triée, « Créé le », adresse « aucun filtre », cartes | Vue par défaut déclarée (nom + requête), marqueur d'URL, colonne de base « Créé le » triable pour toute liste | Contrat 5, preuve sur l'objet « Test » ; **refus** : renommer ou supprimer « Leads en cours » → 409 ; `e2e/listes.spec.ts` vert sans modification |
| T4 Palette, email déjà connu, ni fusion ni doublon | Recherche déclarée, avertissement par source déclarée de la route des doublons, `mergeable: false` | Contrats 7, 9, 13 ; **refus** : `POST /api/objets/lead/fusion` → 405 ; lead écarté à la même adresse ne déclenche rien ; deux leads homonymes sans bannière |
| T5 Champs personnalisés, garde-fou, 375 px, recette | Garde-fou `lead`, `resetLeads()`, amorce, `UAT.md` « Feature 4 — 4.1 Leads » (deux sous-sections, remplit « Le lead ») | Contrats 6, 14 ; **refus** : citer `lead` dans un mécanisme rend le garde-fou rouge ; aucun défilement horizontal à 375 px |

### 4.1b — XL — contrat 15 à 29, 30

- **Crée** : `src/features/leads/conversion.ts`, `convert-dialog.tsx` ; `src/app/api/leads/[id]/conversion/route.ts` ; `tests/leads/{conversion,conversion-refus,conversion-fenetre,converti,issus}.test.ts` ; `e2e/leads-conversion.spec.ts`.
- **Modifie** : `src/features/leads/{register,register.server,leads,schema}.ts`, `lead-actions.tsx` ; `src/features/objects/{registry,registry.server,service}.ts`, `{object-sheet,banners,links-column}.tsx` ; `src/features/archive/delete.ts`, `delete-dialog.tsx` (F6) ; `src/features/history/history.ts`, `src/features/activities/feed.ts` ; `src/features/persons/contact-profile.ts` (F8) ; `tests/objets/branchement.test.ts`, `tests/activites/bannieres.test.ts` (si la forme d'une bannière change) ; `e2e/fixtures/{leads,objets,personnes}.ts` (F10) ; `.pilot/amorce-recette.js` ; `UAT.md`.

| Tâche | Ce qu'on fait | Terminé quand (dont refus) |
|---|---|---|
| T6 Aperçu et écriture de la conversion, en une transaction | `GET` (personne par toutes ses adresses, entreprises proches, différences), `POST` (verrou `FOR UPDATE`, personne, profil contact, entreprise, lead, historique) | Contrats 15 à 23, 25 à 27 par Vitest ; **refus** : rejouer → 409 ; fiche archivée → 409 sans écriture ; échec en chemin → base intacte ; deux conversions simultanées → une seule |
| T7 La fenêtre « Convertir » | Une étape : personne, entreprise (propositions à la frappe, « même nom que », « archivée », « laquelle garder »), poste et rôle, différences ; pied fixe | Contrats 15, 18 à 20 à l'écran, 30 ; **refus** : bouton absent sur converti, écarté, archivé ; confirmer sans entreprise → 400 sous le champ |
| T8 Le lead converti : champs figés, fil vivant, bandeau, liens, suppression refusée | `frozen` (409 par la mise à jour, jamais par les activités), bannière déclarée, `keepArchived`, refus de suppression déclaré, action d'historique déclarée | Contrats 24, 28, 29, preuves sur l'objet « Test » ; **refus** : `PATCH` d'un converti → 409 ; `DELETE` d'un converti → 409 ; `DELETE` d'une personne issue d'un lead archivé → 409 qui le nomme ; une note s'ajoute encore |
| T9 Recette de la conversion | Spec e2e (nouvelle personne, retrouvée, « garder Acme », archivée, 375 px), fixtures, amorce (un converti), `UAT.md` | Spec verte ; **refus** : `resetObjects()` lancé après la suite des leads ne bute sur aucune clé étrangère |

## Principes retenus

- **Pas de socle transverse** : `lockedWhen`, `reserved`, `mergeable`, vue par défaut, « Créé le », actions déclarées en 4.1a ; `frozen`, `keepArchived`, bannière, refus de suppression, action d'historique en 4.1b. Chaque extension est générique et prouvée sur l'objet « Test » ; le garde-fou interdit `lead` dans les mécanismes dès T5.
- **Une seule migration**, `0011_leads.sql`, en 4.1a.
- **La conversion réutilise les écritures des personnes** (création générique, profil contact, `recomputeProfiles`, `holderOf`) dans sa transaction.
- **Fixtures** : enfants avant parents ; `lead.converted_*` sans cascade, donc les leads e2e se purgent avant personnes et entreprises.

## Contrôles

- Contrat : 30 phrases après F2, chacune dans une seule livraison (1 à 14 → 4.1a ; 15 à 30 → 4.1b).
- Fichiers : aucun fichier créé par deux livraisons ; les éditions successives sont en série (3.2, 4.1a, 4.1b).
- Tâches : 9 (5 + 4), chacune avec au moins un refus ; jalons : 2 (le jalon « Leads » existant devient 4.1a, un jalon 4.1b est ajouté — F1).

## Frontières à trancher

1. **F1 — Deux XL en série** plutôt que trois livraisons (couper 4.1a coûterait un cycle de contrôle sans gagner de parallélisme). Si l'audit de 4.1a sort deux bloquants, couper 4.1b en « conversion » (T6, T7) et « lead converti » (T8, T9) avant de la lancer. Recommandé.
2. **F2 — Scinder le contrat 14** : 14 « la liste en cartes sans défilement horizontal, « Nouveau lead » atteignable ; la fiche en une colonne, « Écarter » atteignable » → 4.1a ; **30** « « Convertir » reste atteignable à 375 px et la fenêtre de conversion garde son bouton de confirmation visible » → 4.1b. Amende le contrat 14.
3. **F3 — « Modifiée le » dans « Leads en cours »** : une liste peut citer les colonnes de base dans ses colonnes, et « Modifiée le » ne s'ajoute d'office que si aucune n'est citée. Contrat 5 intact, listes existantes inchangées. Recommandé.
4. **F4 — Avertissement d'email sur la fiche** : D8 le prévoit, aucune phrase ne le vérifie. Ajouter au contrat 9 « saisir cette adresse dans le champ Email d'un lead affiche le même avertissement sous le champ ». Amende le contrat 9.
5. **F6 — « En nommant ce lead » (contrat 29)** : aujourd'hui le refus dit « Issu du lead : 1 ». Étendre les bloqueurs de relation aux titres des fiches (trois au plus), pour tout objet : la suppression d'une entreprise nommera aussi les contacts qui la retiennent. Recommandé.
6. **F9 — Pas de parallèle forcé avec 3.2** (un merge manuel sur huit fichiers). Recommandé.

Détails, réponse par défaut appliquée sauf avis contraire :
- F5 : l'avertissement passe par la route générique des doublons (`/api/objets/lead/doublons`, source déclarée), pas par `GET /api/leads/doublon-email` — D22 le permet déjà.
- F7 : les contrats 5 et 7, en 4.1a, posent un lead « converti » directement en base dans leurs tests.
- F8 : `writeContactProfile` reçoit un paramètre `exec` pour écrire dans la transaction de la conversion.
- F10 : les fixtures `objets.ts` et `personnes.ts` purgent d'abord les leads e2e (une ligne chacune, en 4.1b).
