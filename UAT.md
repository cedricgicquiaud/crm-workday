# Cahier de recette — crm-workday

Une section par feature, ajoutée à son cadrage. Chaque ligne est un constat observable,
coché à la recette humaine.

## Feature 1 — L'équipe entre dans le CRM

Chaque livraison remplit uniquement sa sous-section. Les titres et lignes d'introduction ne bougent pas.

### 1.1 Première page en ligne

Recette du socle, sur un clone frais avec Docker démarré.

- [ ] `docker compose up -d`, `cp .env.example .env.local`, `npm ci`, `npm run db:migrate`, `npm test` : tout passe au vert.
- [ ] `npm run dev` puis `http://localhost:3000/` : renvoie vers la page de connexion.
- [ ] `http://localhost:3000/api/health` : `status ok`, `version` égale à celle de `package.json`, `commit` égal à `git rev-parse --short HEAD`.
- [ ] Sans `DATABASE_URL` dans `.env.local`, `npm run db:migrate` s'arrête en nommant la variable.
- [ ] `npm run test:e2e` passe au vert.

### 1.2a Connexion, invitation, réinitialisation

En attente de la livraison.

### 1.2b Gestion des comptes et profil

En attente de la livraison.

### 1.4 Emails sortants

En attente de la livraison.

### 1.3 Coque de navigation

En attente de la livraison.
