# Recherche — CRM pour le placement de freelances Workday

Date : 2026-09-04. Trois recherches web, synthétisées ici. Les conclusions sont reprises dans `PRD.md`.

## 1. Ce qui existe (CRM / ATS staffing et ESN)

| Outil | Objets métier | Vues | Automatisations | Point fort |
|---|---|---|---|---|
| BoondManager (FR, ESN) | consultants, missions, opportunités, contrats, factures, timesheets | kanban, calendrier, dashboards | génération contrats/factures, alertes renouvellement, e-signature | chaîne CRM → staffing → facturation native |
| Bullhorn | candidats, clients, jobs, placements | kanban, timeline, calendrier | IA sourcing/matching, follow-ups, sync Gmail/Outlook | matching candidat-mission |
| Vincere | candidats, clients, missions, dispo, timesheets, paie | kanban, LiveList partagée | séquences email, nudges, workflows no-code | TimeTemp (timesheets contractors) |
| Recruit CRM | candidats, jobs, contractors, facturation | kanban, timeline | agents IA, workflows | Bill & Pay (facturation + paie contractors + CRA) |
| Napta | employés, compétences, projets, missions | matrice compétences, occupation | allocation par compétence | planning temps réel, taux d'occupation |
| Attio | objets standards + custom illimités | kanban, timeline, calendrier | agents IA, scoring, séquences | flexibilité du modèle de données |
| Twenty (open source, AGPL) | companies, people, opportunities + custom | kanban, timeline, calendrier | workflows no-code, API | self-host, extensible ; ni facturation ni CRA |
| folk | contacts, opportunités | kanban | séquences email, enrichissement LinkedIn | UX épurée |
| HubSpot / Pipedrive | contacts, entreprises, deals | pipeline, calendrier | workflows, séquences | écosystème d'intégrations |

Ce que « le meilleur du marché » possède et qu'on reprend : pipeline multi-vues (kanban + timeline + calendrier), objets staffing natifs (freelance, mission, contrat, CRA), workflows déclenchés par événement, disponibilités et occupation des consultants, facturation reliée aux CRA, email intégré, champs personnalisés, modèles de documents.

## 2. Ergonomie des CRM modernes (Attio, Twenty, folk, Linear)

- Sidebar d'objets + palette de commandes Cmd+K ; vues sauvegardées par objet ; filtres en puces inline.
- Liste dense éditable en place (double-clic, Tab, Échap) ; bascule liste ↔ kanban ; calendrier par champ date.
- Fiche en trois colonnes : relations à gauche, champs au centre, fil d'activité à droite.
- Quick-add en modale (Cmd+Shift+N), raccourcis clavier, mode sombre, transitions courtes.
- Automatisation : déclencheur → condition → action, séquences email, rappels de relance.
- Tarifs remplacés : Attio 35–79 $/utilisateur/mois, folk 24–48 $, HubSpot 2 000–5 000 €/an pour une petite équipe.

## 3. Stack et contraintes (septembre 2026)

- Next.js 15+ App Router, TypeScript ; Postgres + Drizzle ; Better Auth ; shadcn/ui + Tailwind ; TanStack Table ; dnd-kit ; SVAR React Gantt (timeline) ; FullCalendar ou schedule-x ; Resend + React Email ; Puppeteer pour les PDF ; Yousign pour la signature.
- Jobs et relances : pg-boss (dans Postgres, aucun service externe) ; Trigger.dev ou Inngest en alternative SaaS.
- Facturation électronique France : réception obligatoire pour toutes les entreprises au 1er septembre 2026 ; émission obligatoire ETI/grands groupes au 1er septembre 2026, PME et micro au 1er septembre 2027 ; formats Factur-X, UBL, CII via plateforme agréée (PA, ex-PDP). Nouvelles mentions : SIREN client, adresse de livraison, catégorie d'opération, option TVA sur les débits. Amende 50 €/facture non conforme, plafond 15 000 €/an.
- Mentions classiques : identité complète du vendeur, numéro unique séquentiel, lignes HT, TVA, TTC, échéance, pénalités de retard (≥ 3 × taux légal), indemnité forfaitaire 40 €.
- Twenty : fork crédible seulement avec un développeur senior sur 6 mois ; sinon partir de zéro.

## Sources principales

- https://www.boondmanager.com/en/solutions/business
- https://www.bullhorn.com/products/applicant-tracking-crm/
- https://www.vincere.io/ · https://recruitcrm.io/bill-and-pay-recruit-crm/ · https://www.napta.io/en/product/resource-management
- https://attio.com/ · https://twenty.com/product · https://www.folk.app/crm-for-x/recruiting
- https://crm.org/news/attio-review · https://marmelab.com/blog/2026/01/09/open-source-crm-benchmark-2026.html
- https://encore.dev/articles/drizzle-vs-prisma · https://makerkit.dev/blog/tutorials/better-auth-vs-clerk
- https://svar.dev/blog/top-react-gantt-charts/ · https://www.buildmvpfast.com/blog/inngest-vs-trigger-dev-vs-bullmq-background-jobs-nextjs-2026
- https://digital-solutions.konicaminolta.fr/gestion-documentaire/article-calendrier-facture-electronique/
- https://www.indy.fr/guide/facturation/modele/mentions-obligatoires/
- https://www.fiducial.fr/facturation-electronique/faq/sanctions-non-conformite-obligation-facturation-electronique
- https://www.myfrenchtool.com/blog/yousign-vs-docusign
