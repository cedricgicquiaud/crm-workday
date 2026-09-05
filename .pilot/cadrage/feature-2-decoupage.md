# Découpage — feature 2 « Entreprises et contacts »

Statut : **validé** le 2026-09-05 par Cédric (découpeur, repris par le lead). Tâches CRM-33 à CRM-63 créées, 9 jalons, feature « Planifiée ». Feature XL au barème (neuf livraisons L/M produites en série, Agents en parallèle : 1).

| # | Livraison (résultat constaté) | Taille | Contrat | Produite après |
|---|---|---|---|---|
| 2.1a | Une entreprise se crée, se modifie sur sa fiche en trois colonnes, chaque changement est dans l'historique | L | 1, 2, 4, 5 | — |
| 2.1b | La palette Cmd+K retrouve une entreprise par son nom ou son SIREN | M | 3 | 2.1a |
| 2.2 | Une personne existe, porte ses adresses, se rattache à une entreprise comme contact | L | 6, 8, 9, 10 | 2.1a |
| 2.3 | Notes, appels, tâches et emails forment le fil de la fiche ; une tâche échue s'affiche en bannière | L | 7, 11–16 | 2.2 |
| 2.5a | La liste se filtre, se trie, se configure, s'édite en place ; son URL se partage | L | 23, 25, 27 | 2.2 |
| 2.5b | Une vue se sauvegarde, se partage et s'épingle dans la barre latérale | M | 24, 26 | 2.5a |
| 2.4 | Un administrateur définit des champs personnalisés qui se saisissent, se filtrent et s'historisent sans code | L | 17–22, 33 | 2.5b |
| 2.6a | Un doublon probable est signalé ; un administrateur fusionne deux fiches | L | 28, 29, 32 | 2.4 |
| 2.6b | Une fiche s'archive et se restaure ; elle ne se supprime que sans lien, par un administrateur | M | 30, 31 | 2.6a |

Ordre de série : 2.1a → 2.1b → 2.2 → 2.3 → 2.5a → 2.5b → 2.4 → 2.6a → 2.6b. Écart à la roadmap : 2.5 avant 2.4 (les contrats 18 et 19 font d'un champ personnalisé une colonne, un filtre et un filtre de vue épinglée). Paires parallélisables si les agents passent à 2 : 2.1b ∥ 2.2 ; 2.3 ∥ 2.5a.

## Principes retenus

- **Pas de socle transverse séparé** : chaque mécanisme (registre d'objets, historique, fil, listes, champs personnalisés, recherche, bannières, fusion, archivage) vit dans son dossier `src/features/<mécanisme>/`, générique par construction (clé d'objet en paramètre), et arrive avec la première livraison qui en a besoin. Un test de garde-fou dès 2.1a échoue si un fichier des mécanismes cite `company` ou `person` hors de `registry*.ts` / `manifest*.ts`. Le contrat 33 (objet « Test » complet) se prouve en 2.4, quand les cinq mécanismes existent.
- **Un manifeste d'objets** (`src/features/objects/manifest.ts` côté client, `manifest.server.ts` côté serveur) : une ligne par objet, seul endroit qui les nomme. Le registre déclare par objet : clé, libellés, icône, `href(id)`, descripteurs de champs typés (`text | list | date | number | user`, valeurs, éditable, triable) qui pilotent l'édition en place, l'historique, les colonnes / filtres / tri et les champs personnalisés ; relations (`{ to, fkColumn, label, inverseLabel, prefill }`) lues par la colonne des liens, la fusion et la suppression ; `feedParent` ; côté serveur `table`, `search(q)`, `duplicateKey(record)`. Pages minces : `<ObjectList type="company" />`, `<ObjectSheet type="company" id />`.
- **Éditions en série** (une ligne, nommée) plutôt qu'un registre d'extensions de plus : `object-sheet.tsx`, `banners.tsx`, `service.ts`, `fields.ts`, `quick-create-dialog.tsx`, `object-list.tsx`, `app-sidebar.tsx`. Acceptable avec un agent ; à revoir si l'on passe à deux.
- **Chemins d'API** : `/api/entreprises`, `/api/personnes` (objets) ; `/api/objets/[type]/[id]/<mécanisme>` (historique, activités, champs, archiver, restaurer, DELETE) ; `/api/objets/[type]/{doublons,fusion}` ; `/api/recherche`, `/api/champs`, `/api/vues`, `/api/vues-epinglees`.

## Points de contact (qui les touche, quand)

| Fichier | Traitement |
|---|---|
| `src/db/schema/index.ts` | 2.1a ajoute les réexports des sept domaines (`companies`, `audit`, `persons`, `activities`, `custom-fields`, `views`, `merges`) et crée les fichiers vides ; plus jamais touché. Chaque fichier de domaine appartient ensuite à sa livraison. |
| `drizzle/000N_*.sql` + meta | 0003 entreprises (2.1a) · 0004 personnes (2.2) · 0005 activités (2.3) · 0006 vues (2.5b) · 0007 champs (2.4) · 0008 fusions (2.6a). 2.1b, 2.5a, 2.6b : aucune. |
| `manifest.ts`, `manifest.server.ts` | Créés en 2.1a (ligne `company`) ; 2.2 ajoute `person`. |
| `src/features/shell/app-sidebar.tsx` | 2.1a remplace le texte d'attente du groupe Objets par `<ObjectsNav />` ; 2.5b monte `<PinnedViewsNav />`. |
| `palette/registry.ts`, `palette/palette.tsx`, `top-bar.tsx` | 2.1b seulement (sources asynchrones, groupe « Résultats »). |
| `parametres-entries.ts`, `e2e/coque.spec.ts` (assertion « cinq entrées ») | 2.4 seulement (entrée « Champs », adminOnly). |
| `object-sheet.tsx` | 2.1a crée ; 2.3 colonne droite = fil + bannière **et, sous 900 px, le fil en onglet (D5, reporté de 2.1a)** ; 2.4 section « Autres champs » ; 2.6a menu d'actions + redirection ; 2.6b lecture seule si archivée. |
| `object-list.tsx` | 2.1a crée (minimal) ; 2.5a en devient propriétaire ; 2.5b y monte la barre des vues. |
| `links-column.tsx` | 2.1a crée (relations déclarées, état vide) ; **2.2 y ajoute le chargement générique des fiches liées** (requête par `getServerObject(relation.to).table` et `fkColumn`), testé avec la personne — décision du lead à l'audit de 2.1a. |
| `objects/service.ts`, `objects/fields.ts` | 2.1a ; 2.4 y ajoute champs obligatoires et valeurs personnalisées. |
| `objects/banners.tsx` | 2.3 crée (rangs D5) avec « tâche échue » ; 2.6a « doublon » ; 2.6b « archivée ». |
| `quick-create-dialog.tsx` | 2.1a ; 2.6a y ajoute l'avertissement doublon. |
| `UAT.md` | 2.1a pré-crée « Feature 2 » avec neuf sous-sections ; chaque livraison remplit la sienne. |
| `.pilot/amorce-recette.js` | Blocs idempotents en fin de fichier : 2.1a trois entreprises · 2.2 quatre personnes · 2.3 notes, appels, une tâche échue · 2.6a la paire « Acme » / « ACME SAS ». |
| `e2e/fixtures/*.ts` | Un fichier par livraison (`objets.ts`, `personnes.ts`, `activites.ts`…), sous-processus `tsx` comme `auth.ts`, chacun n'efface que ses lignes marquées « (e2e) ». |
| `src/proxy.ts`, `src/lib/auth/**`, `src/lib/mail/journal.ts`, `src/components/ui/*` | Personne (2.3 importe `listEmailLog` sans le modifier). |

## Livraisons et tâches

### 2.1a — Entreprises : fiche, édition, historique (L) — CRM-33 à CRM-36
Fichiers : `schema/index.ts`, `schema/companies.ts`, `schema/audit.ts`, stubs des domaines, `drizzle/0003_*` ; `src/features/objects/{registry,registry.server,manifest,manifest.server,fields,service,labels}.ts`, `objects/{object-sheet,links-column,fields-section,object-list,quick-create-dialog,objects-nav}.tsx` ; `src/features/history/{history.ts,history-list.tsx}` ; `src/features/companies/{schema,register,register.server,companies}.ts` ; `src/app/(app)/entreprises/page.tsx`, `entreprises/[id]/page.tsx` ; `src/app/api/entreprises/route.ts`, `api/entreprises/[id]/route.ts`, `api/objets/[type]/[id]/historique/route.ts` ; édite `app-sidebar.tsx` ; `UAT.md`, amorce. Tests : `tests/entreprises/*.test.ts`, `tests/objets/{registre,historique,service,mecanismes-sans-objet}.test.ts`, `e2e/entreprises.spec.ts`, `e2e/fixtures/objets.ts`.
1. Registre d'objets et règles communes — clé, champs typés, colonnes de base, service générique qui écrit l'historique. Terminé quand : un module de test enregistre un objet et obtient `fieldsOf`, `href`, un historique ; refus : PATCH sur un objet archivé → 409 ; refus : le garde-fou échoue si un mécanisme cite `company` / `person`.
2. Table et API Entreprise — migration 0003, zod, listes fermées, responsable = créateur. Terminé quand : « 123 456 789 » → « 123456789 » ; refus : SIREN à 8 chiffres → 400 ; type / conditions hors liste → 400 ; SIREN d'une entreprise archivée → 409 qui la nomme.
3. Liste des entreprises et création rapide — liste dense, tri dernière modification, compteur, groupe « Objets », dialogue 5 champs. Terminé quand : l'entreprise créée est en tête et sa fiche s'ouvre ; refus : raison sociale vide ou 121 caractères → refusée, message sous le champ.
4. Fiche trois colonnes, édition en place, historique — Terminé quand : type, conditions, adresse, email de facturation relus et présents dans l'historique (ancienne / nouvelle valeur, auteur, date) ; refus : PATCH / DELETE sur une entrée d'historique → 405 ; UAT « Feature 2 » pré-créée, amorce avec trois entreprises.

### 2.1b — Recherche dans la palette (M) — CRM-37 à CRM-39
Fichiers : `palette/registry.ts`, `palette/palette.tsx`, `shell/top-bar.tsx` ; `src/features/search/{search,register,normalize}.ts` ; `src/app/api/recherche/route.ts` ; `UAT.md`. Tests : `tests/recherche/*.test.ts`, `tests/coque/palette-sources.test.ts`, `e2e/recherche.spec.ts`.
1. Sources de résultats dans le registre de la palette — `registerPaletteSource`, groupe « Résultats », anti-rebond, trois caractères. Terminé quand : un module de test enregistre une source et ses résultats s'affichent sans toucher aux fichiers de la palette ; refus : sous trois caractères aucune source n'est appelée.
2. API de recherche transverse — parcourt le manifeste serveur, insensible casse / accents, exclut les archivées. Terminé quand : « acm », « me s », le SIREN rendent « ACME SAS » ; refus : archivée non rendue ; sans session → 401.
3. Résultats à l'écran — icône en préfixe, Entrée ouvre la fiche. Terminé quand : contrat 3 en Playwright ; refus : « zzz » → « Aucun résultat. ».

### 2.2 — Personnes et profil contact (L) — CRM-40 à CRM-42
Fichiers : `schema/persons.ts`, `drizzle/0004_*` ; `src/features/persons/{schema,register,register.server,persons,emails,contact-profile}.ts`, `persons/{contact-profile-section,company-picker}.tsx` ; `src/app/(app)/personnes/page.tsx`, `personnes/[id]/page.tsx` ; `src/app/api/personnes/route.ts`, `api/personnes/[id]/route.ts`, `api/personnes/[id]/profil-contact/route.ts` ; édite `manifest*.ts` (+1 ligne) et `objects/links-column.tsx` (chargement générique des fiches liées, ajouté à l'audit de 2.1a) ; `UAT.md`, amorce. Tests : `tests/personnes/*.test.ts`, `e2e/personnes.spec.ts`, `e2e/fixtures/personnes.ts`.
1. Tables Personne, adresses, profil contact et API — Terminé quand : une personne se crée avec prénom et nom seuls ; refus : adresse déjà portée (casse, principale ou autre, archivée comprise) → 409 nommant la personne ; adresse mal formée → 400 ; profil sans entreprise → 400 ; entreprise archivée → 409.
2. Liste et fiche Personne — entrée du registre (recherche par nom et par adresse, relation contact → entreprise avec `feedParent`), champ dérivé Profils (« aucun » / « contact ») en tête de fiche, en colonne et en filtre, section profil contact avec « Ajouter un profil contact ». Terminé quand : deux adresses, retrouvée par chacune ; Profils passe de « aucun » à « contact » quand le profil est ajouté ; rôle « décideur » réglé sur la fiche ; refus : rôle hors liste → 400 ; Profils ne se saisit pas (PATCH → 400).
3. Ajouter un contact depuis l'entreprise — dialogue pré-rempli, colonne des liens, changement d'entreprise historisé. Terminé quand : contrat 6 ; refus : le sélecteur ne propose pas une archivée.

### 2.3 — Fil d'activité, tâches, bannière (L) — CRM-43 à CRM-46
Fichiers : `schema/activities.ts`, `drizzle/0005_*` ; `src/features/activities/{schema,activities,feed,overdue}.ts`, `activities/{activity-feed,activity-composer}.tsx` ; `objects/banners.tsx` (création) ; `api/objets/[type]/[id]/activites/route.ts`, `api/activites/[id]/route.ts` ; édite `object-sheet.tsx` (fil + bannière ; sous 900 px le fil devient un onglet, D5) ; `UAT.md`, amorce. Tests : `tests/activites/*.test.ts`, `e2e/activites.spec.ts`, `e2e/fixtures/activites.ts`.
1. Table et API des activités — note, appel, réunion, tâche ; parent mémorisé à la création. Terminé quand : une note sur une personne porte son entreprise du moment ; refus : tâche sans titre / responsable → 400 ; activité sur archivée → 409.
2. Fil fusionné — activités propres et des contacts (nom affiché), historique, emails du journal ; antéchronologique, jour, puces, « automatique » si auteur système. Terminé quand : contrats 11, 13, 14 ; refus : contrat 15 (405).
3. Tâches et bannière unique — cocher = faite ; échue au lendemain 00:00 Paris ; bannière à rangs. Terminé quand : contrat 12 ; refus : échéance aujourd'hui non signalée.
4. Changement d'entreprise et fil — Terminé quand : contrat 7 entier ; refus : une activité créée après le changement n'apparaît pas dans l'ancienne.

### 2.5a — Listes : filtres, tri, colonnes, édition en place, URL (L) — CRM-47 à CRM-50
Fichiers : `src/features/lists/{filters,operators,url-state,sort,apply-filters}.ts`, `lists/{filter-chips,column-menu,inline-edit,list-cards}.tsx` ; `objects/object-list.tsx` (propriétaire) ; `api/objets/[type]/route.ts` ; `UAT.md`. Tests : `tests/listes/*.test.ts`, `e2e/listes.spec.ts`.
1. Filtres typés et URL — puces, « et », opérateurs par type (D16), bascule « archivées », état dans l'URL. Terminé quand : contrat 23 ; refus : champ inconnu / opérateur invalide → « filtre inactif », jamais une erreur.
2. Tri et colonnes — Terminé quand : tri et colonne masquée relus depuis l'URL dans un autre onglet ; refus : la première colonne ne se masque pas.
3. Édition en place — Terminé quand : contrat 25 ; refus : Échap n'envoie aucun PATCH.
4. Cartes à 375 px — Terminé quand : contrat 27 ; refus : aucun défilement horizontal, pas d'édition en place.

### 2.5b — Vues sauvegardées et épinglées (M) — CRM-51 à CRM-53
Fichiers : `schema/views.ts`, `drizzle/0006_*` ; `src/features/views/{views,pinned}.ts`, `views/{view-bar,pinned-views-nav}.tsx` ; `api/vues/route.ts`, `api/vues/[id]/route.ts`, `api/vues-epinglees/route.ts` ; édite `app-sidebar.tsx`, `object-list.tsx` ; `UAT.md`. Tests : `tests/vues/*.test.ts`, `e2e/vues.spec.ts`.
1. Table et API des vues — partagées, modifiables par tout membre ; vue par défaut synthétique. Terminé quand : un collègue modifie la vue, le premier le voit ; refus : contrat 26 (409 ×2).
2. Épingler — par utilisateur, ordre, groupe « Vues épinglées », survit à la reconnexion. Terminé quand : contrat 24 ; refus : le collègue ne voit pas l'épingle.
3. Barre des vues dans la liste — choisir, enregistrer, renommer, supprimer avec confirmation. Terminé quand : la vue supprimée disparaît de la barre du collègue ; refus : pas de suppression sans confirmation.

### 2.4 — Champs personnalisés (L) — CRM-54 à CRM-57
Fichiers : `schema/custom-fields.ts`, `drizzle/0007_*` ; `src/features/custom-fields/{schema,definitions,values,fields-source}.ts`, `custom-fields/{custom-fields-section,definitions-screen}.tsx` ; `src/app/(app)/parametres/champs/page.tsx` ; `api/champs/route.ts`, `api/champs/[id]/route.ts`, `api/objets/[type]/[id]/champs/route.ts` ; édite `parametres-entries.ts`, `e2e/coque.spec.ts`, `objects/fields.ts`, `objects/service.ts`, `object-sheet.tsx` ; `UAT.md`. Tests : `tests/champs/*.test.ts`, `tests/objets/branchement.test.ts`, `e2e/champs.spec.ts`.
1. Définitions dans Paramètres → Champs — Terminé quand : contrat 22 ; refus : contrat 20 (Accueil + 403).
2. Valeurs sur la fiche — section « Autres champs », validation par type, historique. Terminé quand : contrat 17 ; refus : contrat 21.
3. Colonnes, filtres, tri sans manipulation — Terminé quand : contrats 18, 19 ; refus : valeur retirée lisible « retirée », plus choisissable.
4. Objet « Test » branché — Terminé quand : contrat 33 ; refus : échec si un mécanisme cite `company` / `person` hors registre et manifeste.

### 2.6a — Doublons et fusion (L) — CRM-58 à CRM-60
Fichiers : `schema/merges.ts` (`object_redirect`), `drizzle/0008_*` ; `src/features/duplicates/{normalize,duplicates}.ts`, `duplicates/duplicate-warning.tsx` ; `src/features/merge/merge.ts`, `merge/{merge-dialog,object-actions-menu}.tsx` ; `api/objets/[type]/doublons/route.ts`, `api/objets/[type]/fusion/route.ts` ; édite `quick-create-dialog.tsx`, `banners.tsx`, `object-sheet.tsx` ; `UAT.md`, amorce. Tests : `tests/doublons/*.test.ts`, `tests/fusion/*.test.ts`, `e2e/fusion.spec.ts`.
1. Normalisation et signal de doublon — Terminé quand : contrat 28 ; refus : le signal ne bloque jamais la création.
2. Fusion — Terminé quand : contrat 29 ; refus : contrat 32 (400) ; membre → 403.
3. Bannière doublon — Terminé quand : sur les deux fiches avec lien de fusion ; refus : disparaît une fois fusionnées.

### 2.6b — Archivage et suppression protégée (M) — CRM-61 à CRM-63
Fichiers : `src/features/archive/{archive,delete}.ts`, `archive/delete-dialog.tsx` ; `api/objets/[type]/[id]/archiver/route.ts`, `restaurer/route.ts`, `api/objets/[type]/[id]/route.ts` (DELETE) ; édite `object-actions-menu.tsx`, `banners.tsx`, `object-sheet.tsx` ; `UAT.md`. Tests : `tests/archivage/*.test.ts`, `e2e/archivage.spec.ts`.
1. Archiver et restaurer — tout membre ; historique ; bannière ; lecture seule. Terminé quand : contrat 30 ; refus : champ, activité, tâche, profil sur une archivée → 409.
2. Suppression définitive protégée — administrateur ; liste de ce qui retient. Terminé quand : sans lien, disparaît partout ; refus : avec un contact ou une activité → 409 et liste.
3. Commandes réservées — Terminé quand : un membre ne voit ni « fusionner » ni « supprimer définitivement » ; refus : API 403.

## Frontières tranchées par le lead (à confirmer au passage)
- F1 éditions en série retenues (un agent) ; F2 contrat 33 en 2.4, garde-fou en 2.1a ; F3 contrat 7 en 2.3 ; F4 2.5 avant 2.4 ; F5 le manifeste compte comme registre ; F6 neuf PR ; F7 sélection par case et actions groupées hors périmètre (aucune action groupée dans la feature) ; F8 « épingles » retiré de D20 ; F9 chemins d'API retenus.

## Contrôles
- Contrat : 33 phrases, chacune dans une seule livraison. Fichiers : aucun créé par deux livraisons ; les éditions multiples sont dans le tableau des points de contact. Amorce : données pour le testeur dès 2.1a. Total : 31 tâches, 9 jalons.
