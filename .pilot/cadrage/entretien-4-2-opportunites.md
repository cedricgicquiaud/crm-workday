# Entretien de cadrage — 4.2 « Opportunités » (2026-09-17)

Entretien mené avec Cédric le 2026-09-17, de 14 h 40 environ : trois rounds, 26 questions, toutes acceptées dans le sens recommandé (« OK pour toutes tes recommandations », « ok pour tout », « ok pour tout »). Périmètre : le jalon « Opportunités » de la feature 4, pas le reste de la feature. Glossaire : section « Les affaires » de `CONTEXT.md`, ajoutée à l'issue du round 3.

## Round 1 — le périmètre et l'objet

- **Q1 Périmètre** : objet complet, propositions de consultants, opportunité à la conversion d'un lead. Hors : kanban (4.3), calendrier (4.4), tableau de bord, pipeline pondéré, « affaire qui dort » (4.5), mission à la victoire (features 5 et 6), proposition PDF, fusion.
- **Q2 Étapes** : les six du PRD plus Gagnée et Perdue, liste fermée dans le code ; passage libre entre les étapes en cours ; fins posées par « Marquer gagnée » / « Marquer perdue » ; « Rouvrir » ramène à Négociation.
- **Q3 Motif de perte** : obligatoire, liste fermée (Prix, Profil non retenu, Concurrent, Projet abandonné ou reporté, Pas de réponse, Autre), commentaire facultatif.
- **Q4 Probabilité** : dérivée de l'étape, lecture seule (10, 20, 30, 50, 70, 80, 100, 0 %).
- **Q5 Champs** : titre, entreprise, contact, modules (au moins un), besoin, TJM de vente cible, durée estimée en jours, montant estimé calculé, démarrage souhaité, clôture prévue (obligatoire), étape, probabilité, responsable.
- **Q6 Contact** : seulement un contact de l'entreprise de l'opportunité (sinon 400) ; changer d'entreprise vide le contact ; un contact parti reste lié, « a quitté … ».
- **Q7 Consultants proposés** : section dédiée ; résultat Proposé → Entretien → Retenu / Refusé ; TJM proposé pré-rempli du cible ; un seul retenu ; visible sur la fiche du consultant ; consultant en mission accepté, état affiché.
- **Q8 Création** : liste, palette, bouton sur la fiche entreprise ; création rapide à quatre champs (titre, entreprise, modules, clôture prévue) ; étape Nouveau besoin.
- **Q9 Liste par défaut** : « Opportunités en cours », tri par clôture prévue croissante ; colonnes Titre, Entreprise, Étape, Probabilité, Montant estimé, Clôture prévue, Responsable ; après « Leads ».
- **Q10 Conversion** : case « Créer une opportunité », cochée si le lead a un besoin ; titre « Besoin Workday · Banque X », modules, clôture prévue ; besoin recopié ; étape Qualifié ; même transaction.

## Round 2 — la fin d'une affaire et les liens

- **Q11 Marquer gagnée** : exige un retenu (409 sinon) ; les autres propositions en cours passent Refusé ; une ligne d'historique pour le geste ; aucune mission.
- **Q12 Entreprise cliente** : prospect → client à la victoire, même transaction ; autres types inchangés ; pas de retour arrière à la réouverture.
- **Q13 Après la fin** : champs et propositions figés (409 « rouvrir d'abord »), fil vivant, bandeau gagnée / perdue.
- **Q14 Rouvrir** : depuis gagnée ou perdue, vers Négociation ; motif vidé, historique gardé ; propositions inchangées.
- **Q15 Droits** : tout membre ; suppression définitive admin (D21) ; une gagnée ne se supprime pas ; actions refusées sur une archivée.
- **Q16 Fiches liées** : colonnes des liens de l'entreprise, du contact, des consultants ; refus de suppression ; fusion : les liens suivent, doublon de proposition résolu par le résultat le plus avancé ; entreprise ou contact archivé non choisissable.
- **Q17 Retirer un consultant** : permis en cours, retenu compris ; une ligne d'historique par geste, sur l'opportunité seulement.
- **Q18 Palette** : titre ou entreprise, sous-titre « Étape · Entreprise », gagnées et perdues incluses, archivées exclues.
- **Q19 Clôture dépassée** : acceptée, aucun signal avant 4.5.
- **Q20 375 px** : cartes, une colonne, actions atteignables, boutons de confirmation visibles.

## Round 3 — cas limites et vocabulaire

- **Q21** : l'opportunité prend l'entreprise retenue par la conversion (« garder Acme » → Acme), titre pré-rempli qui suit.
- **Q22** : case cochée et champ manquant → 400, rien n'est créé ; case décochée → conversion de 4.1.
- **Q23** : consultant archivé non ajoutable ; déjà proposé, reste marqué ; gagner avec un retenu archivé → 409.
- **Q24** : TJM de 0 exclu à 5 000 €, deux décimales ; durée entière de 1 à 1 000 jours ; montant estimé triable et filtrable, absent en fin.
- **Q25** : « Résultat » pour la situation d'une proposition ; section « Les affaires » du glossaire.
- **Q26** : table dédiée `opportunity_consultant`, déclarée en dépendante ; pas de mécanisme générique ; pas d'ADR.

## Ajouts du rédacteur, non tranchés explicitement

Signalés à la présentation du cadrage : relation lead → opportunité et refus de suppression d'une opportunité issue d'un lead (extension de D19) ; fenêtre de confirmation de « Marquer gagnée » ; commentaire de perte borné à 500 caractères ; ordre des bannières (fin avant converti) ; sélecteurs bornés à 200 ; relecture sous verrou pour gagnée, perdue, rouvrir et « Retenu ».
