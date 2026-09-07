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
- Agents en parallèle : `1` (livraisons produites en même temps par `run` ; monter à 2 ou 3
  quand la boucle a fait ses preuves sur ce projet)
- Barème et capacité : `.pilot/calibration.md`
- Cahier de recette : `UAT.md` à la racine, lié depuis chaque feature
- Direction visuelle : `.pilot/design.md`, système de design : `.pilot/design/` (déposé le 2026-09-04 ; lire `.pilot/design/README.md` avant tout écran)

**Selon le projet** — une ligne absente vaut « non », et ce qu'on perd est dit à côté

- Lancer l'app : `npm run dev` — Next.js sur `http://localhost:3000/`
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

- Les fichiers chargés par Playwright (`e2e/global-setup.ts`, `e2e/**`) n'importent jamais de module applicatif par l'alias `@/` : son chargeur ne le résout pas en CI. Passer par un sous-processus `tsx` ou des imports relatifs.
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
- Un registre (palette, navigation, colonnes) porte un rang explicite (`order`) et trie ; l'ordre ne dépend jamais de l'ordre des imports.
- Une action déclenchée depuis un journal ou une liste (renvoyer, relancer) vérifie l'état de sa cible (compte existant, actif) avant d'appeler un service tiers, et répond 404 / 409 sinon : jamais un 200 pour une action qui n'a rien fait.
- Aucune écriture serveur avalée en silence (`.catch(() => null)` sans suite) : un échec produit un message visible (`role="alert"` sous l'élément, ou toast) et remet l'écran dans l'état enregistré.
- Dans un test d'écran, un `role="alert"` se cible par son conteneur (`[data-slot="sidebar"]`, le formulaire) : Next.js pose un annonceur de route vide avec le même rôle dans le `body`.

## Idiomes d'interface

- `CardTitle` de shadcn (style base-nova) rend un `div` : un titre de page ou de carte est un vrai `<h1>` / `<h2>`, pour l'accessibilité et pour `getByRole("heading")`.
- Aucun défilement horizontal à 375 px ; chaque page a exactement un `<h1>`.
- Liste dense : tableau à largeur fixe (`table-fixed`), colonnes tronquées par points de suspension avec le texte complet en `title`, motif d'un échec sur la ligne du badge ; jamais de conteneur à défilement horizontal, la page tient dans 1280 px avec la barre latérale ouverte.
- Tout élément focalisable montre le contour de focus des fondations au clavier : `focus-visible`, et `focus-within` pour les champs composés (`input type="date"`).
- Les dates de contexte (Accueil, listes) s'écrivent en format court « 5 sept. 2026 » (`day: "numeric", month: "short", year: "numeric"`, `Europe/Paris`).
- Sous-navigation par onglets : l'entrée courante porte `aria-current="page"` et un marquage visible ; les entrées réservées aux administrateurs sont filtrées côté serveur, les pages restent protégées par `requireAdmin()`.
- Les composants shadcn qui gardent un texte `sr-only` permanent (`SidebarTrigger`, `CommandDialog`) font échouer le contrôle de débordement à 375 px : les recomposer avec un `aria-label` sur le bouton et un `DialogTitle` dans le dialogue.
- Un élément masqué par `opacity-0` reste cliquable et recouvre ses voisins : lui poser aussi `pointer-events-none` (le libellé de groupe de la barre latérale repliée avalait les clics sur « Mon profil », CRM-64).
- Le bloc `nextjs-agent-rules` en fin de ce fichier est réécrit par `next dev` : on le commite tel quel, on n'y touche pas.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
