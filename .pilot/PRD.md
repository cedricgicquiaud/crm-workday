# PRD — CRM sur mesure pour le placement de consultants Workday

Version 0.2 — 2026-09-04 — statut : **validé** le 2026-09-04.
PRD = Product Requirements Document, le document qui décrit ce que le produit doit faire avant qu'on l'écrive.

## 1. En une phrase

Un outil unique, moderne et automatisé pour suivre les prospects, les clients, les consultants Workday (salariés et freelances), leurs missions, les contrats et les factures, avec des relances qui partent toutes seules.

## 2. Le métier à couvrir

Le cabinet trouve des besoins Workday chez des clients (banques, assurances, grands comptes) et y place des consultants Workday, salariés du cabinet ou freelances, (paramétrage, intégration, conseil). Le cycle complet est :

1. Un **lead** (contact froid ou besoin repéré) devient une **opportunité** (un besoin précis chez un client).
2. On propose un ou plusieurs **consultants** (salariés du cabinet ou freelances) ; le client en retient un.
3. L'opportunité gagnée devient une **mission** : un consultant, un client, des dates, un tarif journalier de vente et un coût d'achat.
4. Des **contrats** encadrent la mission : un contrat client (ou bon de commande), et pour un freelance un contrat de sous-traitance.
5. Chaque mois, le consultant remet son **CRA** (compte rendu d'activité, le décompte des jours travaillés). Il sert de base à la **facture** client, et à la facture du freelance quand il y en a un.
6. Le CRM **relance** automatiquement : client qui ne paie pas, CRA non reçu, mission qui se termine, opportunité qui dort.

## 3. Ce que fait le meilleur du marché, et ce qu'on en reprend

| Source d'inspiration | Ce qu'on reprend |
|---|---|
| **BoondManager** (ERP français des ESN) | La chaîne complète opportunité → mission → CRA → facture, les alertes de fin de mission. |
| **Attio / Twenty** (CRM nouvelle génération) | L'ergonomie : palette de commandes Cmd+K, vues sauvegardées, édition directe dans les tableaux, fiche à trois colonnes avec fil d'activité. |
| **Napta / Vincere** (staffing) | La timeline des consultants en mission et la vue des disponibilités. |
| **folk / HubSpot** | Les séquences de relance par email et les rappels automatiques. |
| **Linear** (référence design) | Densité, raccourcis clavier, interface sobre, mode sombre. |

Décision proposée : **partir de zéro** plutôt que de forker Twenty (CRM open source). Twenty n'a ni facturation ni CRA, et sa maintenance demande un développeur à plein temps. Un socle Next.js + shadcn/ui donne le même niveau d'interface avec un code qui reste à nous.

## 4. Utilisateurs

- **Le dirigeant / commercial** (toi) : usage quotidien, sur ordinateur, parfois sur téléphone.
- **Deux collaborateurs dès le départ** : trois comptes, deux rôles simples (administrateur, membre). Chacun voit tout ; les tâches et les fiches ont un responsable.
- **Les consultants** (salariés ou freelances) : au départ, pas de compte. Ils reçoivent des emails (CRA à envoyer, contrat à signer). Un espace consultant est prévu en version ultérieure.
- **Les clients** : jamais d'accès direct. Ils reçoivent des documents (propositions, factures).

## 5. Les objets du CRM

Chaque objet a une fiche, une liste, et apparaît dans les vues ci-dessous.

| Objet | Ce qu'il contient | Liens |
|---|---|---|
| **Entreprise** | Raison sociale, SIREN, adresse, secteur, type (prospect, client, partenaire, société de portage), conditions de paiement, notes. | Contacts, opportunités, missions, contrats, factures. |
| **Personne** | Identité unique : nom, email, téléphone, LinkedIn, notes, fil d'activité. Porte un ou plusieurs **profils** : contact, consultant. Une adresse email = une personne. | Profils, activités, emails. |
| **Profil contact** (sur une personne) | Entreprise de rattachement, poste, rôle dans la décision (décideur, acheteur, utilisateur). | Entreprise, opportunités. |
| **Lead** | Origine (LinkedIn, recommandation, appel d'offres, partenaire), statut (nouveau, contacté, qualifié, écarté), score. Une piste, pas une personne. | Converti en personne (créée ou retrouvée par son email) + profil contact + entreprise + opportunité. |
| **Opportunité** | Titre, client, module Workday concerné, durée estimée, TJM cible, probabilité, date de clôture prévue, étape du pipeline, consultants proposés. | Entreprise, contact, consultants, mission. |
| **Profil consultant** (sur une personne) | **Statut : salarié, freelance ou portage**, société et SIREN (freelance), modules Workday (HCM, Payroll, Integration, Finance, Absence, Time Tracking, Compensation, Recruiting…), certifications, années d'expérience Workday, coût journalier (TJM d'achat pour un freelance, coût chargé pour un salarié), disponibilité (date), langues, CV, état (disponible, en mission, indisponible). | Missions, contrats, CRA, factures fournisseur (freelance seulement). |
| **Mission** | Client, consultant, dates début/fin, TJM vente, coût journalier, marge calculée, jours prévus, renouvellements, statut (à démarrer, en cours, terminée). | Opportunité d'origine, contrats, CRA, factures. |
| **Contrat** | Type (contrat cadre client, bon de commande, contrat de sous-traitance freelance, ordre de mission salarié), dates, montant ou TJM, document PDF, statut (brouillon, envoyé, signé, expiré). | Entreprise ou consultant, mission. |
| **CRA** | Mois, consultant, mission, jours travaillés, justificatif, statut (attendu, reçu, validé par le client). | Mission, factures. |
| **Facture** | Client ou fournisseur (freelance), numéro, dates (émission, échéance), lignes, HT / TVA / TTC, statut (brouillon, envoyée, payée, en retard), relances envoyées, PDF. | Mission, CRA, entreprise ou consultant. |
| **Activité** | Note, appel, email, réunion, tâche avec échéance et responsable. | Tout objet. |

Pipeline d'opportunité proposé, à ajuster : Nouveau besoin → Qualifié → Profils proposés → Entretien client → Proposition envoyée → Négociation → Gagné / Perdu.

Chaque objet accepte des **champs personnalisés** (texte, liste, date, nombre) sans toucher au code. On ne va pas jusqu'aux objets entièrement personnalisés d'Attio : c'est le principal gain de simplicité.

## 6. Les vues

- **Liste** : tableau dense, tri, filtres, colonnes choisies, édition directe dans la cellule.
- **Kanban** (tableau à colonnes, une colonne par étape) : opportunités par étape, leads par statut, factures par statut, CRA par état. Déplacement par glisser-déposer.
- **Timeline de staffing** : une ligne par consultant (salariés et freelances), une barre par mission dans le temps. On voit d'un coup d'œil qui est en mission, jusqu'à quand, et qui est libre. Un salarié sans mission est signalé en priorité : c'est un coût qui court. Fins de mission et renouvellements en couleur.
- **Calendrier** : tâches, relances, entretiens, échéances de factures.
- **Fiche** (page d'un objet) : trois colonnes, avec à gauche les liens, au centre les champs, à droite le fil d'activité (emails, notes, tâches, changements).
- **Tableau de bord** : pipeline pondéré, chiffre d'affaires facturé et prévu, marge par mission, taux d'occupation des consultants (salariés à part), factures en retard, prochaines fins de mission.
- **Vues sauvegardées** : chaque combinaison filtres + tri + type de vue peut être enregistrée et épinglée dans la barre latérale.
- **Palette de commandes** Cmd+K : recherche globale, navigation, création rapide.

## 7. Automatisations et relances

Principe : une règle = un déclencheur, une condition optionnelle, une ou plusieurs actions. Les règles ci-dessous sont livrées prêtes à l'emploi et modifiables. Un éditeur simple permet d'en créer d'autres sans coder.

| Déclencheur | Action automatique |
|---|---|
| Facture échue depuis J+3, J+10, J+20 | Email de relance au contact facturation, ton progressif ; tâche pour toi à J+30. |
| Le 25 du mois, CRA non reçu | Email au consultant ; rappel à J+3 ; tâche si toujours rien au 1er. |
| Mission se termine dans 45 jours | Tâche « proposer le renouvellement », email au client à 30 jours si non traité. |
| Contrat expire dans 30 jours | Tâche et alerte sur la fiche. |
| Opportunité sans activité depuis 10 jours | Alerte « affaire qui dort », suggestion de prochaine action. |
| Lead créé | Séquence : email J0, relance J+4, relance J+10, puis clôture automatique si aucune réponse. |
| Opportunité gagnée | Création de la mission, des contrats en brouillon (client, et sous-traitance si freelance), des CRA mensuels attendus. |
| CRA validé | Facture client générée en brouillon ; facture fournisseur attendue si le consultant est freelance. |
| Consultant disponible dans 30 jours | Alerte « à replacer », apparaît dans la timeline ; immédiate pour un salarié. |

Toutes les relances par email passent par des **modèles** modifiables. Chaque envoi est journalisé sur la fiche. Rien ne part sans historique.

## 8. Facturation : contraintes légales françaises

- Numérotation continue sans trou, mentions obligatoires (SIREN des deux parties, TVA, échéance, pénalités de retard, indemnité forfaitaire de 40 €), PDF conforme.
- Depuis le 1er septembre 2026, toute entreprise doit pouvoir **recevoir** des factures électroniques ; l'obligation d'**émettre** s'applique aux PME le 1er septembre 2027. Le CRM produira les factures au format **Factur-X** (PDF avec données lisibles par machine) dès la première version, et la connexion à une plateforme agréée sera ajoutée avant septembre 2027.
- Euros et TVA française uniquement pour le moment ; le modèle garde une devise par facture pour ne pas se fermer la porte.
- Export comptable au format **FEC** (Fichier des Écritures Comptables, le format légal que tout logiciel de comptabilité importe) plus un CSV des factures. Connexion directe à **Pennylane** en version ultérieure si l'expert-comptable l'utilise (voir décisions).

## 9. Design

- **Tailwind CSS** et **shadcn/ui** (bibliothèque de composants sobres et accessibles) comme demandé.
- Interface dense mais lisible, dans l'esprit Linear / Attio : barre latérale, palette Cmd+K, panneaux latéraux plutôt que pages entières, édition en place, mode clair et sombre.
- Responsive : utilisable sur téléphone pour consulter et ajouter une note ; les vues lourdes (timeline, kanban) sont pensées pour l'ordinateur.

## 10. Stack technique proposée

| Brique | Choix | Pourquoi |
|---|---|---|
| Application | Next.js (App Router), TypeScript | Standard du marché, un seul projet pour l'interface et le serveur. |
| Base de données | PostgreSQL + Drizzle ORM | Fiable, léger, migrations claires. |
| Authentification | Better Auth | Open source, comptes dans notre base, pas de coût par utilisateur. |
| Tableaux | TanStack Table + data-table shadcn | Référence pour les listes denses et éditables. |
| Kanban | dnd-kit | Glisser-déposer robuste et accessible. |
| Timeline | SVAR React Gantt ou composant maison | Choix tranché en cadrage de la livraison « missions ». |
| Tâches planifiées et relances | pg-boss (file d'attente dans Postgres) | Zéro service externe ; Trigger.dev en alternative si besoin. |
| Emails | Resend + React Email | Modèles en composants, journal des envois. |
| PDF (factures, contrats) | Puppeteer | Rendu fidèle à l'écran, Factur-X possible. |
| Signature électronique | Yousign (API) | Français, hébergé en France, tarif PME. Version ultérieure. |
| Emails entrants et envoi | Gmail (API Google Workspace) | Boîte du cabinet ; synchronisation des échanges sur les fiches en livraison 5. |
| Hébergement | Coolify sur le VPS OVH existant | Application + Postgres en conteneurs, sauvegardes quotidiennes de la base. |
| Tests | Vitest + Playwright | Tests avant code, comme prévu par la méthode. |

## 11. Découpage en livraisons

Chaque livraison est utilisable seule et validée avant la suivante.

1. **Socle commercial** : entreprises, contacts, leads, opportunités ; vues liste et kanban ; fiche trois colonnes ; activités et tâches ; Cmd+K ; authentification ; vues sauvegardées.
2. **Staffing** : consultants salariés et freelances (compétences Workday, disponibilité, coût), missions, timeline de staffing, calcul de marge, tableau de bord.
3. **Contractuel et facturation** : contrats, CRA, factures client et fournisseur, PDF Factur-X, export FEC, relances de paiement automatiques.
4. **Automatisations** : moteur de règles, séquences email, alertes fin de mission / CRA / contrats, modèles d'emails.
5. **Ouverture** : synchronisation Gmail, signature électronique, espace consultant (dépôt de CRA), plateforme de facturation agréée, connexion Pennylane.

## 12. Hors périmètre (pour l'instant)

Application mobile native, paie des salariés, multi-sociétés, autres devises, matching automatique consultant ↔ mission par IA, portail client. À rediscuter après la livraison 3.

## 13. Décisions prises le 2026-09-04

| Question | Décision |
|---|---|
| Nom | `crm-workday` (nom de travail, produit et dépôt). |
| Utilisateurs | Toi et deux collaborateurs dès le départ. |
| Consultants | Salariés du cabinet et freelances, les deux dès la première version. |
| Boîte mail | Gmail. |
| Hébergement | Coolify sur le VPS OVH existant. |
| Comptabilité | **Pennylane** retenu (décision du 2026-09-04) ; export FEC dès la livraison 3, connexion directe Pennylane en livraison 5. |
| Devise et TVA | Euros et TVA française uniquement. |
| Volume | Activité en création, non défini : les vues sont conçues pour quelques dizaines de consultants et de clients, sans pagination lourde. |
| Modèle des personnes (décision du 2026-09-04, soir) | **Une seule fiche Personne avec des profils** (contact, consultant) plutôt que deux objets. Raisons : les gens changent de casquette dans l'écosystème Workday ; la synchronisation Gmail rattache un email à une seule personne ; une recherche et un fil d'activité uniques. Feature 2 crée la personne et le profil contact ; feature 3 ajoute le profil consultant. |

Rappel : vérifier avec l'expert-comptable qu'il accepte Pennylane. Conseil d'origine : demander d'abord à l'expert-comptable quel outil il utilise, car c'est lui qui importe. S'il laisse le choix, **Pennylane** est le meilleur pari pour une société en création : c'est l'outil le plus répandu chez les cabinets comptables français, il lit le FEC et les factures au format Factur-X, il est candidat au statut de plateforme agréée pour la facture électronique, et il a une API pour une connexion directe plus tard. Dans tous les cas l'export FEC couvre le besoin, quel que soit l'outil.
