# Session du 2026-09-13 / 14 — merge de 2.6a, réconciliation et rétro de la feature 2

Session précédente : `2026-09-10-livraison-2-6a.md` (run de 2.6a, PR #25).

## État à la fermeture (2026-09-14, ~10:25)

- **Feature 2 « Entreprises et contacts »** : **« Rétro faite »**. Neuf livraisons mergées, 30 tâches
  fermées, dates réelles posées (05/09 → 13/09), PR #25 mergée le 13/09 à 09:07.
- **Dépôt** `~/Desktop/crm-workday` : `main` en `6606161`. **PR de rétro `chore/retro-feature-2`**
  ouverte avec les seize idiomes dans `CLAUDE.md`, `.pilot/calibration.md` (barème XL, jours actifs
  observés, date de merge de 2.6a) et les deux résumés de session. **À merger avant le prochain
  `run`** : un worktree part d'`origin/main` et ne verrait pas les idiomes sinon.
- Aucun worktree, aucune branche de feature. Bases `crm_a` / `crm_b` intactes (paire Acme non fusionnée).
- Linear : 11 features « À cadrer », toutes décalées de deux jours ; V1 finit le 21/10, V2 le 04/11
  (dates cibles posées sur les deux initiatives). Prochaine : « Les consultants Workday »
  (M, 13/09 → 16/09, priorité Moyenne, première par date de début).

## Ce qui a été fait

1. `sync` : feature « Terminée » puis « Rétro faite », jalon 2.6a daté, intégration GitHub contrôlée
   (PR attachée à CRM-58), worktree supprimé, calibration mise à jour, dates des onze features
   recalées (+2 jours), initiatives datées.
2. Quatre décisions gravées dans la fiche feature (section « Décisions prises au merge », n° 26 à 29) :
   adresses et profil d'une personne absorbée suivent la conservée, adresse principale perdue ; 409 sur
   une fiche déjà absorbée ; déclaration `dependents` du manifeste ; `feed.ts` ouvert à 2.6a.
3. Relecture des neuf rapports d'audit par un agent ; **seize idiomes validés** (dix de code, six
   d'interface) écrits dans `CLAUDE.md`.
4. **Huit tâches isolées créées** (liste validée) : CRM-69 suppression définitive : compter et tracer
   (bug, Haute) ; CRM-70 test d'épinglage instable ; CRM-71 écritures hors transaction ; CRM-72
   recherche : accents et plafond global (bug, Haute) ; CRM-73 fiche personne recomposée, rendu de
   champ dupliqué (**à faire avant le profil consultant de la feature 3**) ; CRM-74 listes : cartes et
   tableau rendus tous deux ; CRM-75 champs personnalisés : index et longueurs ; CRM-76 contrastes hors
   seuil (bug, Haute, avec CRM-66).

## Décisions et règles posées

- Barème XL : reste à 7,0 h. La mesure de 2.6a (1,37 h) contient 0,25 h estimée (verifier relancé,
  valeur négative de l'outil) et n'entre pas dans la médiane ; une seule mesure XL complète (2.4, 1,47 h).
- Jours actifs observés : 5,4 par semaine (7 jours avec merge sur 1,3 semaine).
- Les modifications de méthode (`CLAUDE.md`, calibration) partent dans une PR `chore` quand aucune
  livraison n'est en cours, parce que le prochain worktree doit les voir.

## Leçons de méthode (pour le dépôt PILOT, pas ici)

- Le verifier s'est arrêté pendant `npx playwright test` (5 min) sans rendre son rapport ; relancé
  par message. L'outil de coût rend alors une valeur active négative : durée « estimée », hors médiane.
- La première capture d'un écran à anti-rebond peut manquer l'élément (compilation à froid de la route
  en mode dev) : à dire dans la consigne du testeur quand l'écran dépend d'une requête différée.
- `set -- $var` ne découpe pas en zsh : les boucles de `curl` GraphQL s'écrivent en appels explicites.

## Tâches isolées ouvertes

CRM-1 « Compte Resend et domaine d'envoi » : **échue le 04/09, 10 jours de retard**, conditionne la
recette réelle des emails, les relances (F8) et la mise en ligne (F9). CRM-2 à CRM-7 (contenus à
fournir, échéances du 25/09 au 30/10). CRM-31, 32, 65, 66, 67, et les huit nouvelles CRM-69 à CRM-76.

## Recette humaine en attente

`UAT.md` : sections 1.3, 1.4, 2.1a, 2.1b, 2.2, 2.3, 2.5a, 2.5b, 2.4, 2.6a, 2.6b (aucune jouée).

## Prochaine commande

Merge de la PR de rétro, puis `/pilot next` → feature « Les consultants Workday » : `feature`
(cadrage, contrat de validation, contradicteur), en traitant CRM-73 avant ou dans son découpage.
