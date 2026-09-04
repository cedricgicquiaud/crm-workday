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
- Direction visuelle : `.pilot/design.md`, système de design : `.pilot/design/` (à venir)

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
