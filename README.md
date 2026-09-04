# crm-workday

CRM sur mesure pour un cabinet conseil / ESN qui place des consultants Workday (salariés et
freelances) chez des grands comptes : prospects, contacts, entreprises, opportunités,
consultants, missions, contrats, CRA, factures, relances automatiques.

- Cadrage : `.pilot/PRD.md` · roadmap : `.pilot/roadmap.md` · recherche : `.pilot/recherche.md` · direction visuelle : `.pilot/design.md`
- Pilotage : Linear (team `CRM`) + GitHub + Claude Code, méthode `pilot` dans `.claude/`
- Stack : Next.js 16 (App Router), TypeScript, PostgreSQL + Drizzle, Better Auth, Tailwind + shadcn/ui, pg-boss, Resend + React Email

## Démarrer

```bash
docker compose up -d          # Postgres : bases crm (développement) et crm_test (tests)
cp .env.example .env.local    # puis renseigner BETTER_AUTH_SECRET (openssl rand -base64 32)
npm ci
npm run db:migrate            # applique les migrations sur la base de développement
npm run dev                   # http://localhost:3000
```

## Vérifier

```bash
npm run lint
npm run typecheck
npm test                      # Vitest, sur crm_test remise à zéro à chaque exécution
npm run test:e2e              # Playwright, lance le serveur de développement
```

## Base de données

- Schéma : un fichier par domaine dans `src/db/schema/`, réexporté par `index.ts`.
- Nouvelle migration : modifier le schéma, puis `npm run db:generate -- --name <nom>`, puis `npm run db:migrate`.
- Jamais de modification de table à la main : le schéma est la seule source.

## Emails

En développement et en test, aucun email ne part : chaque envoi est capturé dans la table
`email_log` (statut `capture`). En production, l'envoi passe par Resend (`RESEND_API_KEY`).
