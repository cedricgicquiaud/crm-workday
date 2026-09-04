# Suivre — `next`, `fix`, `sync`, `benchmark`

_Détail des commandes de suivi : savoir où on en est, traiter une tâche isolée,_
_réconcilier après un merge, produire le barème initial._

---

## `next` — proposer l'étape logique

`next` ne fait rien de lui-même : il lit Linear, dit où on en est, et propose la commande
suivante. On peut le taper à tout moment, y compris après une semaine d'absence.

0. **Réconciliation** (`sync`, voir plus bas).
1. Retrouver la feature en cours : « En développement » ou « En revue » s'il y en a une (on
   finit ce qu'on a commencé), sinon « Planifiée » ou « À cadrer » de priorité la plus haute
   puis de date de début la plus ancienne (Urgent posé par l'humain passe devant tout).
2. Router selon son statut :

| Statut trouvé | `next` annonce et propose |
|---|---|
| Aucune feature | « Projet sans roadmap » → `roadmap` (ou `init` si non piloté) |
| À cadrer | La feature et son résumé → `feature` (cadrage) |
| Planifiée | Les livraisons et leurs tailles → `run` |
| En développement | Les worktrees/PR en cours, ce qui manque → attendre ou relancer `run` |
| En revue | La liste des PR à lire et merger, les décisions en attente → rien à lancer |
| Terminée | Les leçons à graver → `sync` puis la feature suivante |

   Si l'utilisateur dit « tâches isolées » : la première tâche « À faire » sans feature → `fix`.
3. S'arrêter sur la proposition. Ne lancer l'étape que sur « oui ». Rester court : l'état
   en cinq lignes, la proposition en une. Les tâches isolées en attente et les idées non
   classées se signalent en une ligne chacune, pas en paragraphe.

## `fix <description>` — tâche isolée en un geste

1. Créer la tâche (`save_issue`) : template Bug ou Tâche selon le cas, label, statut
   « À faire », sans feature. Une seule phrase d'annonce, pas de squelette.
2. Branche `fix/<CODE>-<n>-<slug>` (ou `chore/…`). Bug : d'abord le test qui reproduit
   (rouge), puis la correction (vert). Chore sans comportement : pas de test exigé.
3. PR titrée `<CODE>-<n> <titre>`, description `Closes <CODE>-<n>`. S'arrêter.
4. Suite proposée : « merge, puis `next` ». **La tâche reste « À faire » jusqu'au merge** :
   c'est l'intégration GitHub qui la ferme, et `sync` qui contrôle qu'elle l'a fait.

## `sync` — réconciliation

Pour chaque feature « En revue » de la team : retrouver la PR de sa livraison en cours
(`gh pr list --search "<CODE>-<n>"`). Si mergée et toutes les tâches de la livraison
terminées → jalon terminé (ses tâches le sont) ; s'il reste des livraisons → feature
« En développement » ; sinon → feature « Terminée ». Dans
`.pilot/calibration.md`, compléter la ligne d'historique (mergée, heures réelles = temps de
session entre début et PR ouverte), puis recalculer `feature_hours_<T>` du projet = médiane
des heures réelles de cette taille (dès 2 mesures ; sinon garder le barème global) et
`days_per_week` observé = jours avec au moins un merge / semaines depuis la première feature.
**Dates réelles** : à chaque livraison mergée, poser sur le jalon `targetDate` = date du merge
(`save_milestone`) ; quand la feature se termine, `startDate` = date de la première
branche et `targetDate` = date du dernier merge (`save_project`). Sans cela, la barre
terminée reste aux dates du plan et ses jalons flottent à côté. Recaler `startDate` /
`targetDate` des features non terminées (fenêtres plausibles), sans jamais dater une
feature avant la fin de sa bloquante, ni toucher aux features en réserve (sans dates).
La roadmap devient ainsi un historique fidèle à gauche d'aujourd'hui, une prévision à
droite.
**Recale et raconte** : ouvrir le compte-rendu de `sync` par un récit court —
(a) les features décalées et la nouvelle fin de plan ; (b) la **marge restante** si la
section Pilot déclare une ligne `Échéance :` (marge négative → le dire en termes de
périmètre : « il faut choisir quoi couper », pas seulement « ça glisse ») ; (c) les
**alertes** : toute tâche isolée non terminée dont l'échéance (`dueDate`) est passée, en
soulignant les tâches-décisions citées dans des fiches de features (« la décision X a
n jours de retard, m features en dépendent »).
**Apprendre** : quand une feature passe « Terminée », relire les rapports d'audit de ses PR.
Chaque défaut trouvé par le `verifier` qui pourrait se reproduire devient une ligne dans la
section « Idiomes de code » du `CLAUDE.md` du projet (proposée, validée par l'humain, poussée
avec la PR suivante) ; **chaque remarque visuelle faite au merge** — un espacement, un libellé,
une couleur, un ordre de colonnes — devient de la même façon une ligne de la section « Idiomes
d'interface », à côté. Le premier écran d'un projet est moyen ; le dixième ressemble au produit
parce que ces lignes se sont accumulées. Un retour visuel qu'on ne grave pas se refait à chaque
livraison ; chaque décision tranchée au merge est gravée dans la section
« Décisions produit » de la fiche feature ; les idées hors périmètre deviennent des tâches
isolées. Feature → « Rétro faite ». Supprimer les worktrees de la feature
(`git worktree remove`).
**Les tâches isolées aussi.** `sync` ne regarde pas que les features : lister les tâches de la
team sans feature, encore ouvertes, et chercher leur PR (`gh pr list --search "<CODE>-<n>"`).
PR mergée et tâche ouverte → la passer « Terminée » et joindre l'URL de la PR (`save_issue`,
champ `links`). Une tâche isolée n'a personne pour la fermer : le producteur d'une livraison
pose lui-même le statut de ses tâches, `fix` ne le fait pas — il compte sur l'intégration
GitHub. Quand celle-ci tombe, les fiches restent ouvertes sans que rien ne le signale.

**Contrôler que Linear voit encore GitHub.** Sur une tâche de la livraison qu'on vient de
réconcilier, `get_issue` doit montrer sa PR en pièce jointe (`attachments`). Si la liste est
vide alors que la PR est mergée, **l'intégration ne voit plus ce dépôt** : le lien vers la fiche
ne s'affiche plus dans les PR, et les statuts de tâche ne bougent que parce que les agents les
posent à la main. Le dire dans le compte rendu, avec le chemin exact : Linear → Settings →
Integrations → GitHub → Connected organizations, ajouter l'organisation du dépôt. C'est
arrivé le 04/09 sur le sandbox, un mois après son `init` : le dépôt avait changé de
propriétaire, et rien ne l'avait signalé.

Les modifications de `.pilot/calibration.md` ne font **pas** de PR à part : elles partent
dans la PR de la livraison suivante (ou de la prochaine tâche isolée).
Suite proposée : `next`.

## `benchmark` — produire le barème initial

1. Proposer 2 ou 3 dépôts représentatifs (développés avec Claude Code, assez de PR mergées).
   Attendre validation.
2. `python3 .claude/skills/pilot/scripts/benchmark.py owner/repo … --out ~/.config/pilot/calibration.md`
3. Montrer le tableau. Copier dans `.pilot/calibration.md` du projet courant s'il est piloté.

## `update` — mettre la méthode de ce projet à jour

La méthode de ce projet est une copie, dans `.claude/`. La version de référence vit dans le
dépôt `pilot`. Cette commande apporte ici ce qui a changé là-bas.

1. **Refuser si une livraison est en cours** — une branche `feature/…` non mergée, un worktree
   ouvert. Un agent lancé avec les anciennes fiches finirait avec les nouvelles. Dire ce qui
   bloque et proposer d'attendre le merge.
2. Noter la version actuelle : la ligne « Version » de `.claude/METHODE.md`.
3. `cd ~/Desktop/PILOT && git pull && ./install.sh <racine de ce projet>`
4. `git diff --stat .claude/` : montrer ce qui a bougé. Lire les fichiers modifiés et **dire en
   trois lignes ce qui change pour le travail** — une règle nouvelle, une consigne retirée. Un
   diff de 200 lignes que personne ne lit vaut une mise à jour non faite.
5. Commit `chore: update the pilot method to <nouvelle version>`, avec ces trois lignes dans le
   corps. Il part dans la PR en cours, ou dans une PR à lui si le dépôt est propre.

Suite proposée : `next`.

---
