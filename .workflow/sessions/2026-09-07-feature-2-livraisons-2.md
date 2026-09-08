# Session du 2026-09-07 — méthode à jour, trois livraisons de la feature 2

Session précédente : `2026-09-06-reprise-feature-2.md`. Ce fichier est le résumé de reprise.

## État à la fermeture (2026-09-07, 23:00)

- **Feature 2 « Entreprises et contacts »** : « En développement », **4 livraisons sur 9 mergées**
  (2.1a, 2.1b, 2.2, 2.3). Restent 2.5a → 2.5b → 2.4 → 2.6a → 2.6b, toutes en série :
  2.3 et 2.5a étaient la dernière paire parallélisable.
- **Dépôt** `~/Desktop/crm-workday` sur `main` en `4c1ff65`, CI verte. Aucun worktree ouvert,
  aucune branche de feature locale.
- **Base de dev** `crm` migrée jusqu'à `0005`. Amorce de recette : trois entreprises, quatre
  personnes rattachées, deux notes, un appel, une réunion, une tâche échue de la veille.
  Compte de recette `admin@exemple.fr` / `MotDePasse-Recette-1`, à ne pas supprimer.
- **Non commité** : `.pilot/calibration.md` (lignes 2.2 et 2.3, recalibrage L). Part avec la PR de 2.5a.

## Ce qui a été fait

1. **`/pilot update`** — la méthode passe de `04098b4` à `50e9b6d` (PR #9). Elle était déjà
   prête, ouverte le matin ; il a fallu la remettre sur `main` pour débloquer sa CI.
2. **CRM-64, tâche isolée** (PR #10) — le libellé « Objets » de la barre latérale repliée,
   invisible mais toujours cliquable, avalait les clics sur « Mon profil ». `main` était rouge
   sur ce test **depuis le merge de la PR #8 le 5 septembre**, sans que personne ne le voie.
3. **Livraison 2.1b « Recherche dans la palette Cmd+K »** (PR #11) — 1 h 06 d'horloge,
   0,96 h d'agents. Quatre points corrigés, aucun bloquant.
4. **Livraison 2.2 « Personnes, adresses, profil contact »** (PR #12) — 2 h 20 d'horloge,
   1,85 h d'agents, deux cycles de production. Douze défauts corrigés.
5. **Livraison 2.3 « Fil d'activité, tâches, bannière »** (PR #13) — 3 h 20 d'horloge,
   1,53 h d'agents, deux cycles de production. Neuf défauts corrigés.

## Décisions prises dans la session (à ne pas rediscuter)

- **La colonne « Historique » de la fiche disparaît** : elle devient le fil d'activité, où les
  changements sont un type d'entrée filtrable. Un changement de champ se lit à un seul endroit.
  Deux fichiers de tests d'écran existants ont été mis à jour pour cette raison, sur
  autorisation explicite, et le relecteur a contrôlé ligne à ligne qu'aucune assertion n'était
  affaiblie.
- L'entreprise d'un profil contact est portée par une colonne de `person`, pas par
  `contact_profile` : c'est ce qui permet à la colonne des liens de rester générique.
- L'amorce de recette tolère un refus 409 à la création, pour rester rejouable.
- Le composeur d'activité est au-dessus du fil ; la bannière et le fil d'une fiche ne portent
  que ses propres tâches et emails, pas ceux de ses contacts.
- Une note vide est refusée par le bouton d'enregistrement, pas par le serveur.
- **Parallélisme** : rester à un producteur à la fois, en s'appuyant sur le tuilage que la
  méthode permet déjà (l'audit d'une livraison recouvre la production de la suivante).

## La leçon de la session

**Deux livraisons de suite, l'ordre de mission a interdit un fichier que le contrat exigeait.**

- En 2.2, le contrat 6 demandait « Ajouter un contact » depuis une fiche entreprise ; ma liste
  interdisait le dialogue de création rapide. Le producteur s'est arrêté sur ce point et a livré
  le reste. Coût : un cycle de production entier.
- En 2.3, le contrat 11 demandait le fil sur la fiche personne ; ma liste n'ouvrait pas cette
  page. Coût : quinze minutes, parce que l'ordre de mission disait cette fois explicitement
  « si une phrase du contrat te paraît impossible sans toucher un fichier interdit, dis-le et
  arrête-toi sur ce point ».

**Correctif appliqué à partir de 2.3, à garder** : recopier chaque phrase du contrat en toutes
lettres dans `MISSION.md`, et vérifier avant de l'écrire que chacune a en face un fichier ouvert
qui la rend possible. Lire l'état réel des fichiers dans le dépôt plutôt que de recopier un
découpage écrit plusieurs jours plus tôt : en 2.3, cette lecture a montré que `feedParent` et le
refus 405 existaient déjà, ce qui a transformé deux clauses du contrat en non-régressions.

**Deuxième leçon, sur la lecture du relevé de coût** : j'ai failli attribuer 2,1 h d'attente du
testeur à une permission manquante sur `kill`. Vérification faite, `kill` est dans la liste
blanche et cette attente est de la veille après rapport. C'est exactement l'erreur documentée le
5 septembre sur ce projet. Toujours vérifier la cause avant de l'écrire.

## Tâches isolées ouvertes

- **CRM-1** « Compte Resend et domaine d'envoi » — échue le 04/09, **3 jours de retard**.
  Conditionne la recette réelle des emails (UAT 1.4), les relances (F8), la mise en ligne (F9).
- CRM-31 contrôles à 28 px ; CRM-32 purge des tentatives de connexion dans la fixture e2e.
- **CRM-65** la section « Champs » reste figée après un enregistrement (antérieur à 2.2, touche
  tous les objets).
- **CRM-66** le contour de focus est à 1,58 pour 1 en thème sombre (style commun du produit).

## Idiomes candidats, en attente de validation

Ils partiraient avec la PR de 2.5a, dans les sections « Idiomes » du `CLAUDE.md` :

- un champ en lecture seule se rend en texte, jamais par un contrôle désactivé : l'opacité
  réduite le rend illisible ;
- une écriture qui touche deux tables passe par une transaction, sinon un invariant du contrat
  tient au hasard des pannes ;
- le `CommandInput` de shadcn supprime le contour de focus (`outline-hidden`), à repasser par
  `className`.

## Recette humaine en attente

`UAT.md` : sections 1.3, 1.4, 2.1a, 2.1b, 2.2, 2.3.

## Prochaine commande

`/pilot next` → livraison **2.5a « Listes : filtres, tri, colonnes, édition en place, URL »**
(CRM-47 à CRM-50, taille L). Elle prend la propriété de la liste générique
(`src/features/objects/object-list.tsx`) et porte les cartes à 375 px, que la passe visuelle de
2.2 avait signalées comme manquantes.
