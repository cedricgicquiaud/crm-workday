# Roadmap — v3, validée le 2026-09-04, créée dans Linear le même jour (2 initiatives, 13 features, 46 jalons, 7 tâches isolées)

Deux versions (initiatives Linear) : **V1 — le CRM pour l'équipe** (features 1 à 9) et **V2 — ouverture** (features 10 à 13).
Décision du 2026-09-04 : le déploiement Coolify clôt la V1 au lieu d'ouvrir la feature 1.
Ordre = ordre de production. Taille des livraisons : S ≤ 2 tâches, M 3–4, L 5–7.

## 1. L'équipe entre dans le CRM — L
1. Première page en ligne : squelette Next.js, base Postgres, tests, page d'accueil qui répond — M
2. Connexion, comptes, rôles (administrateur, membre), désactivation d'un compte — M
3. Coque de navigation : barre latérale, palette Cmd+K, thème clair et sombre, format téléphone — M
4. Emails sortants : envoi Resend, modèles modifiables, journal des envois — M

## 2. Entreprises et contacts — L
1. Entreprises : liste dense, fiche trois colonnes, type, conditions de paiement — M
2. Contacts : liste, fiche, rattachement à une entreprise, rôle dans la décision — M
3. Activités sur une fiche : notes, appels, réunions, tâches ; historique des changements de champs — M
4. Champs personnalisés (texte, liste, date, nombre), règle de branchement pour tout nouvel objet — M
5. Filtres, tri, colonnes, vues sauvegardées épinglées — M
6. Fusion de doublons et suppression protégée (une fiche liée à une facture ne se supprime pas) — M
dépend de : 1

## 3. Les consultants Workday — M
1. Fiche consultant : statut salarié / freelance / portage, modules Workday, certifications, coût journalier, CV — M
2. Disponibilité, état (disponible, en mission, indisponible), liste filtrable par compétence — M
dépend de : 2

## 4. Le pipeline commercial — L
1. Leads : origine, statut, score, conversion en contact + entreprise + opportunité — M
2. Opportunités : fiche, étapes du pipeline, probabilité, module Workday, consultants proposés — M
3. Kanban des opportunités et des leads par glisser-déposer — M
4. Calendrier des tâches, entretiens et échéances (tout objet daté s'y branche) — M
5. Tableau de bord commercial ; signal « affaire qui dort » défini une fois, sur l'opportunité — M
dépend de : 3

## 5. Les missions et la timeline de staffing — L
1. Missions : client, consultant, dates, TJM vente, coût, marge, renouvellements — M
2. Timeline de staffing : une ligne par consultant, une barre par mission, salariés sans mission en tête — L
3. Tableau de bord staffing : occupation, marge, signaux « fin de mission » et « consultant à replacer » définis ici — M
dépend de : 4

## 6. Contrats et CRA — L
1. Contrats : quatre types, statuts, PDF depuis un modèle fourni par le cabinet, expiration — M
2. CRA : attendus générés chaque mois par mission, saisie des jours, justificatif, validation client — M
3. Kanban des CRA et des contrats par statut — S
4. Une opportunité gagnée crée la mission, les contrats en brouillon et les CRA attendus — M
dépend de : 5

## 7. Les factures partent et rentrent — L
1. Facture client depuis un CRA : numérotation continue, mentions légales, TVA, avoirs — L
2. PDF Factur-X et envoi par email (via les emails sortants de 1.5) — M
3. Factures fournisseur (objet unique, alimenté plus tard par 10 et 13) et suivi des paiements — M
4. Kanban des factures et tableau de bord financier : facturé, prévu, en retard — M
5. Export FEC et CSV pour Pennylane — M
dépend de : 6

## 8. Les relances partent toutes seules — L
1. Moteur de règles (déclencheur, condition, actions, planificateur) livré avec sa première règle : facture échue — L
2. Relances complètes de facturation (J+3, J+10, J+20, tâche J+30) et de CRA (25, J+3, 1er) — M
3. Alertes staffing et commercial : lisent les signaux définis en 4.5 et 5.3, contrat qui expire — M
4. Séquence lead (J0, J+4, J+10) et éditeur de règles sans code — M
dépend de : 7

## 9. Le CRM est en ligne pour l'équipe — M
1. Déploiement sur Coolify (OVH) : application, base Postgres, sauvegarde quotidienne, domaine et HTTPS — M
2. Mise en service : comptes des trois utilisateurs, emails depuis le domaine du cabinet, données de départ — S
dépend de : 8

## 10. La facture électronique est conforme 2027 — L
1. Connexion à une plateforme agréée : émission et statuts de traitement — L
2. Réception des factures fournisseur électroniques (alimente l'objet de 7.3) — M
3. Connexion Pennylane : factures et paiements synchronisés — M
dépend de : 9 ; échéance légale : 2027-09-01

## 11. La boîte Gmail est dans le CRM — L
1. Connexion du compte Google, envoi depuis la boîte du cabinet (remplace l'expéditeur de 1.5) — M
2. Emails reçus rattachés aux contacts et aux opportunités — L
3. Emails dans le fil d'activité, réponse depuis le CRM — M
dépend de : 8

## 12. Les contrats se signent en ligne — M
1. Envoi d'un contrat en signature Yousign, suivi du statut — M
2. Contrat signé archivé sur la fiche, relance si non signé (règle du moteur de 8) — S
dépend de : 8

## 13. L'espace consultant — L
1. Accès consultant : invitation par email, connexion, périmètre visible — M
2. Dépôt et signature du CRA par le consultant — M
3. Documents et contrats consultables, facture fournisseur déposée par un freelance (alimente 7.3) — M
dépend de : 8

## Décisions et accès extérieurs (tâches isolées, avec échéance)
- Compte Resend et domaine d'envoi vérifié (avant 1.4).
- Modèles juridiques des quatre contrats, à faire rédiger (avant 6.1). État au 2026-09-04 : pas encore.
- Données légales de la société : SIREN, TVA intracommunautaire, IBAN, mentions, taux de pénalités (avant 7.1). État au 2026-09-04 : pas encore.
- Base Postgres et domaine sur Coolify (avant 9.1).
- Abonnement Pennylane et accès API, validés avec l'expert-comptable ; choix de la plateforme agréée (avant 10).
- Projet Google Cloud et écran OAuth pour le Google Workspace du cabinet (avant 11). Décision du 2026-09-04 : Google Workspace, pas d'audit externe.
- Compte Yousign (avant 12).
- Licence de la timeline (SVAR : GPL ou commerciale) ou composant maison : tranché au cadrage de 5.
