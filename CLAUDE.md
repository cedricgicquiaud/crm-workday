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
- Dans un gabarit d'email, une phrase avec variable s'écrit en gabarit de chaîne (`{`Bonjour ${prenom},`}`) : React insère sinon des commentaires `<!-- -->` qui cassent la recherche de texte.

## Idiomes d'interface

- `CardTitle` de shadcn (style base-nova) rend un `div` : un titre de page ou de carte est un vrai `<h1>` / `<h2>`, pour l'accessibilité et pour `getByRole("heading")`.
- Aucun défilement horizontal à 375 px ; chaque page a exactement un `<h1>`.
- Le bloc `nextjs-agent-rules` en fin de ce fichier est réécrit par `next dev` : on le commite tel quel, on n'y touche pas.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
