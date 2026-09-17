# crm-workday

CRM sur mesure d'un cabinet conseil / ESN qui place des consultants Workday (salariés et
freelances) chez des grands comptes. Cadrage : `.pilot/PRD.md` (validé le 2026-09-04),
recherche : `.pilot/recherche.md`, direction visuelle : `.pilot/design.md`.

Stack : Next.js (App Router) + TypeScript, PostgreSQL + Drizzle, Better Auth, Tailwind +
shadcn/ui, pg-boss, Resend + React Email, Puppeteer. Tests : Vitest + Playwright.
Hébergement : Coolify sur le VPS OVH. Comptabilité : export FEC, connexion Pennylane prévue.

## Pilot

_Configuration de ce projet. Les règles de la méthode vivent dans la skill `pilot`_
_(`.claude/skills/pilot/`) ; ici, seulement ce qui est propre à ce dépôt._

**Posé par `init`**

- Workspace Linear : `gm5` (connexion MCP `linear` ; clé `~/.config/pilot/linear-gm5.env`)
- Team : `CRM Workday` — clé `CRM` — id `395e04f1-06f4-4c2b-b88d-e17d440bc6eb`
- Agents en parallèle : `2` (livraisons produites en même temps par `run` ; passé de 1 à 2
  le 2026-09-08 pour l'épreuve des deux heures, sur une paire déclarée disjointe par le découpeur)
- Barème et capacité : `.pilot/calibration.md`
- Cahier de recette : `UAT.md` à la racine, lié depuis chaque feature
- Direction visuelle : `.pilot/design.md`, système de design : `.pilot/design/` (déposé le 2026-09-04 ; lire `.pilot/design/README.md` avant tout écran)

**Selon le projet** — une ligne absente vaut « non », et ce qu'on perd est dit à côté

- Lancer l'app : `npm run dev` — Next.js sur l'adresse `APP_URL` de `.env.local`
  (`http://localhost:3000/` dans le dépôt principal)
- Poste par worktree : un `.env.local` copié du dépôt principal, avec les trois lignes du poste.
  Poste A : `APP_URL=http://localhost:3001`, `DATABASE_URL=postgres://crm:crm@localhost:5433/crm_a`,
  `TEST_DATABASE_URL=postgres://crm:crm@localhost:5433/crm_test_a`. Poste B : `3002`, `crm_b`,
  `crm_test_b`. Les quatre bases existent dans le conteneur Postgres (créées le 2026-09-08).
  À la création du worktree : `npm ci` (un lien symbolique vers les `node_modules` du dépôt
  principal est refusé par Next), puis `npm run db:migrate` pour la base du poste ; la base de
  test se migre seule au premier `npm test`. Vérifié le 2026-09-08 : 171 tests unitaires et
  70 tests d'écran sur le poste A, le port 3000 et la base `crm` intacts. Un poste se libère
  au merge.
- Amorce de recette : `.pilot/amorce-recette.js` — ouvre une session et pose des données ;
  sans elle, le `testeur` photographie des écrans vides (à écrire avec la livraison 1)
- Testeur : `passe visuelle automatisée`

**Le contrat de ce projet** : aucun développement sans fiche Linear ; rien n'est créé dans
Linear sans liste validée.

## Sessions

- Fin de session : résumé dans `.workflow/sessions/AAAA-MM-JJ-description.md`.
- Début de session : lire le dernier fichier de `.workflow/sessions/`, puis `/pilot next`.

## Idiomes de code

_Fautes déjà commises sur ce dépôt et attrapées à l'audit ou au merge. Le producteur relit son diff contre elles._

- Les fichiers chargés par Playwright (`e2e/global-setup.ts`, `e2e/**`) n'importent jamais de module applicatif par l'alias `@/` : son chargeur ne le résout pas en CI. Passer par un sous-processus `tsx` ou des imports relatifs. Un utilitaire servi à deux fichiers de test vit dans `e2e/helpers/`, jamais recopié (`fitsTheScreen` en 3.2, `parisDayFromToday` en CRM-99).
- Pas de `await` au niveau module dans un fichier lancé par `tsx` (`scripts/`, `src/db/migrate.ts`) : le paquet est en CommonJS. Écrire une fonction `main()`.
- `process.env.NODE_ENV` est en lecture seule pour TypeScript : `Object.assign(process.env, { NODE_ENV: "test" })`.
- L'environnement se lit par `getEnv()` à la demande, jamais au chargement d'un module importé par une page : `next build` évalue les modules sans les secrets.
- Toute page qui affiche la date ou dépend de la session déclare `export const dynamic = "force-dynamic"`, sinon Next.js la fige au build.
- `pg-boss` s'importe en export nommé : `import { PgBoss } from "pg-boss"`.
- Toute redirection lue dans l'URL (`?next=`) se résout avec `new URL(next, origin)` et n'est suivie que si l'origine est identique ; tout `\` est refusé (`safeNext` dans `src/features/auth/routes.ts`, à réutiliser, jamais réécrire).
- `.pilot/amorce-recette.js` est enveloppé par l'outil dans `(async () => { … })()` : du `await` de premier niveau, aucune fonction auto-appelée non attendue, aucune navigation (l'outil recharge lui-même).
- Les tests d'écran amorcent leurs comptes `*-e2e@exemple.fr` dans la base `crm` de développement et n'effacent que ceux-là : le compte de recette `admin@exemple.fr` / `MotDePasse-Recette-1` cohabite, ne pas le supprimer.
- Une règle métier (longueur du mot de passe, statut d'un compte) s'applique dans les scripts et les API autant que dans les formulaires : la constante partagée (`src/features/auth/password-rule.ts`) est la seule source.
- Dans un gabarit d'email, une phrase avec variable s'écrit en gabarit de chaîne (`{`Bonjour ${prenom},`}`) : React insère sinon des commentaires `<!-- -->` qui cassent la recherche de texte.
- Une préférence enregistrée côté serveur (thème, réglage) s'applique à l'écran après la réponse 2xx, jamais avant : un rechargement immédiat annulerait la requête en vol et perdrait le choix (attrapé par la CI en 1.3).
- Un registre (palette, navigation, colonnes) porte un rang explicite (`order`) et trie ; l'ordre ne dépend jamais de l'ordre des imports. Il refuse à l'enregistrement une déclaration incomplète ou une clé en double, par une erreur qui la nomme, jamais au rendu (3.0).
- Une action déclenchée depuis un journal ou une liste (renvoyer, relancer) vérifie l'état de sa cible (compte existant, actif) avant d'appeler un service tiers, et répond 404 / 409 sinon : jamais un 200 pour une action qui n'a rien fait.
- Aucune écriture serveur avalée en silence (`.catch(() => null)` sans suite) : un échec produit un message visible (`role="alert"` sous l'élément, ou toast) et remet l'écran dans l'état enregistré.
- Dans un test d'écran, un `role="alert"` se cible par son conteneur (`[data-slot="sidebar"]`, le formulaire) : Next.js pose un annonceur de route vide avec le même rôle dans le `body`.
- Plusieurs écritures qui n'ont de sens qu'ensemble (une fiche et son profil, un réordonnancement, une suppression et son historique, une fusion) tiennent dans une seule `db.transaction` : un échec au milieu laisserait la base à moitié rangée (attrapé hors transaction en 2.2, 2.5b, 2.4).
- L'historique écrit une ligne par geste de l'utilisateur, pas une par écriture en base : cocher trois modules puis quitter la liste écrit une seule ligne « Modules : … » (3.1).
- Toute entrée est validée contre le registre avant la première requête : un corps d'un autre type que le champ répond 400 par champ, un identifiant mal formé répond 404, un paramètre d'URL invalide (champ, opérateur, valeur, vue) est écarté avec un avertissement visible ; jamais un 500 de Postgres ni un silence (2.1a, 2.5a, 2.5b). Une clé que le geste ne prévoit pas (hors des champs du dialogue, du profil) répond 400, jamais ignorée ni enregistrée (3.1, 3.2).
- Une fixture de test efface tout ce qu'elle a créé, enfants avant parents (les clés étrangères sont sans cascade), et chaque suite d'écran purge dans `beforeEach` ce que ses tests posent : un test qui laisse une donnée derrière lui rend la suite rouge dans l'ordre normal (bloquant 2.4, oublis 2.6b et 2.6a).
- Toute lecture qui alimente un écran est bornée et annonce le reste (« et N autres ») : sélecteur 200, colonne des liens 20, fil 50 ; jamais « toutes les fiches » (2.2 chargeait toutes les entreprises).
- Une donnée chargée par la page (fiche, options d'utilisateurs, épingles, définitions) se passe aux briques en paramètre ou se mémorise par requête (`cache` de React) ; aucune brique ne la recharge pour son compte (double appels en 2.3, 2.5b, 2.6b, 2.4). De même, une écriture lit la fiche une fois et passe ce qu'elle a lu à ses étapes, sauf la relecture sous verrou, dans la transaction, juste avant l'écriture (3.1 relisait personne et profil deux fois par modification).
- Ce qui désigne une fiche (relations, activités, emails, valeurs personnalisées, adresses, profil) se parcourt par déclaration du manifeste (`relations`, `dependents`), jamais par une liste écrite à la main dans un mécanisme : la suppression avait oublié les valeurs personnalisées (2.4), la fusion les adresses et le profil (2.6a).
- Une action irréversible rejouée avec les mêmes paramètres refuse (400 ou 409) au lieu de s'exécuter une seconde fois : les identifiants se comparent après résolution des redirections, et une redirection en base ne se suit que d'un saut (bloquant 2.6a : rejouer une fusion détruisait la fiche conservée).
- Une règle de date « à partir du lendemain » se compare sur le jour civil Europe/Paris (chaîne AAAA-MM-JJ), jamais sur minuit UTC (2.3). Même règle dans les tests : une date relative (« demain », « dans 3 jours ») se calcule par `parisDayFromToday` (`e2e/helpers/paris-day.ts`), jamais par `Date.now() + 86_400_000` ni `toISOString().slice(0, 10)` ; sinon le test échoue entre 0 h et 2 h à Paris (CRM-99).
- Avant les tests d'écran, aucun `next dev` d'un autre dossier n'occupe le port du poste : Playwright réutilise le serveur trouvé et testerait le code de `main` (2.5a).
- Dans un test d'écran, un libellé contenu dans un autre se cible avec `exact: true` (« Champs » / « Autres champs »), et deux écritures successives attendent chacune leur réponse (`waitForResponse`) : deux clics enchaînés rendent le test instable (2.4, 2.5b).

## Idiomes d'interface

- `CardTitle` de shadcn (style base-nova) rend un `div` : un titre de page ou de carte est un vrai `<h1>` / `<h2>`, pour l'accessibilité et pour `getByRole("heading")`.
- Aucun défilement horizontal à 375 px ; chaque page a exactement un `<h1>`.
- Liste dense : tableau à largeur fixe (`table-fixed`), colonnes tronquées par points de suspension avec le texte complet en `title`, motif d'un échec sur la ligne du badge ; jamais de conteneur à défilement horizontal, la page tient dans 1280 px avec la barre latérale ouverte. La somme des parts de colonnes ne dépasse jamais 100 % (3.2 : six colonnes à 18 % écrasaient le nom) ; une cellule sans valeur affiche « — » ; une valeur absente se trie en fin de liste, jamais avec une valeur réelle (3.2 : une personne sans profil rangée avec « Indisponible »).
- Tout élément focalisable montre le contour de focus des fondations au clavier : `focus-visible`, et `focus-within` pour les champs composés (`input type="date"`).
- Les dates de contexte (Accueil, listes) s'écrivent en format court « 5 sept. 2026 » (`day: "numeric", month: "short", year: "numeric"`, `Europe/Paris`). Les nombres et montants s'affichent en format français par leur descripteur, trois décimales au plus (« 650,00 € », « 1 234,568 ») ; pendant la saisie, le champ montre la valeur brute (« 650 ») (3.1, D33).
- Sous-navigation par onglets : l'entrée courante porte `aria-current="page"` et un marquage visible ; les entrées réservées aux administrateurs sont filtrées côté serveur, les pages restent protégées par `requireAdmin()`.
- Les composants shadcn qui gardent un texte `sr-only` permanent (`SidebarTrigger`, `CommandDialog`) font échouer le contrôle de débordement à 375 px : les recomposer avec un `aria-label` sur le bouton et un `DialogTitle` dans le dialogue.
- Un élément masqué par `opacity-0` reste cliquable et recouvre ses voisins : lui poser aussi `pointer-events-none` (le libellé de groupe de la barre latérale repliée avalait les clics sur « Mon profil », CRM-64).
- Une valeur en lecture seule (champ dérivé, fiche archivée) se rend en texte lié par `aria-labelledby`, jamais par un contrôle `disabled` dont l'opacité la rend illisible (« Contact » à 3,3:1 en 2.2) ; une case à cocher inerte prend `readOnly` (2.6b).
- Un dialogue de formulaire n'a pas de croix (`showCloseButton={false}`) : deux boutons « Annuler » / « Créer » ; un dialogue long garde en-tête et pied fixes, seule la zone centrale défile, et le bouton de confirmation reste visible à 375 px (2.1a, 2.6a).
- Un texte saisi par l'utilisateur (nom de vue, libellé de champ) affiché dans une ligne flex ou un menu porte `min-w-0` et une troncature, et son conteneur borne sa largeur à l'écran ; sinon les badges et boutons voisins l'écrasent (2.4, 2.5b).
- Les hauteurs viennent des tokens (`--control-h`, `--row-h`, `--header-h`), pas d'un `h-7` / `h-8` en dur : le même contrôle est sorti à 32 px dans un dialogue et 28 px sur la fiche (2.1a, 2.2 ; parent de CRM-31).
- Une commande à icône seule (croix de puce, flèche, épingle) peint son icône à 20 px, étend sa zone de clic à 28 px par un pseudo-élément transparent et porte un `title` identique à son nom accessible (2.5a, 2.5b).
- Le `CommandInput` de shadcn supprime le contour de focus (`outline-hidden`) : le repasser par `className` (2.1b).
- Le bloc `nextjs-agent-rules` en fin de ce fichier est réécrit par `next dev` : on le commite tel quel, on n'y touche pas.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
