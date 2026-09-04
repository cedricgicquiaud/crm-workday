---
name: pilot
description: >-
  Pilotage de projet avec Linear (tableau de bord), GitHub (code) et Claude Code
  (exécution). Utiliser dès que l'utilisateur parle de Linear, de roadmap, de
  features ou de tâches à suivre, dit « pilotage », « prochaine feature »,
  « nouvelle feature », « tâches isolées », « pose la roadmap », « run »,
  « lance la boucle », « où en est-on », ou tape /pilot <commande>. S'applique
  aussi automatiquement dans tout projet dont le CLAUDE.md contient une
  section « ## Pilot » : avant de coder, après un cadrage, et à la livraison.
  Commandes : init, roadmap, feature, run, next, fix, sync, benchmark.
---

# Pilotage — Linear · GitHub · Claude

## Le principe

- **Linear** est le tableau de bord : roadmap, features, tâches, statuts. C'est ce que
  l'humain regarde.
- **GitHub** est l'atelier : code, branches, PR. L'humain n'y va que pour relire et merger.
- **Claude** est l'ouvrier : il lit son travail dans Linear, le fait dans GitHub, met Linear
  à jour en chemin.

**La règle unique** : le code Linear d'une tâche (`ABC-12`) est dans le nom de la branche
et le titre de la PR. C'est ce fil qui permet à GitHub de faire avancer Linear sans personne.

## Vocabulaire

Gestion de projet classique, quatre étages :

| Linear dit | On dit | Échelle | Ce que c'est |
|---|---|---|---|
| Team | **Projet** | Mois | Un dépôt, un produit. Clé à 3 lettres (`ABC`). |
| Project | **Feature** | Semaines | Une grande fonctionnalité (« Authentification », « Partage de listes »). **Une barre sur la roadmap.** Livrée en une ou plusieurs PR. |
| Milestone | **Livraison** | Jours | Une partie livrable d'une feature = **une PR** (« Écran d'inscription », « Mot de passe oublié »). Une petite feature n'a qu'une livraison. |
| Issue | **Tâche** | Heures | Une étape d'une livraison, ou une tâche isolée (bug, retouche) sans feature. |
| Initiative | Cap (facultatif) | Trimestre | Regroupement de features (une version, un thème). Seulement sur un gros projet. Inclus en gratuit. |

**Règle de taille d'une feature** : elle se juge à sa durée sur la roadmap. Une feature doit
couvrir **au moins une semaine calendaire** avec la capacité du projet (barème × jours actifs
par semaine) ; en dessous, c'est une livraison, à fusionner dans une feature voisine. Sur un
petit projet, une seule feature pour tout le MVP est normal. Une feature de plus de 6
livraisons : couper. Ses livraisons, elles, peuvent durer un jour.

**Les jalons ne sont pas obligatoires.** Une feature qui se livre en une seule PR (S, M)
n'a pas de jalon : ses tâches sont rattachées directement à elle. Proposer des jalons
seulement quand la feature demande plusieurs PR (L, XL), ou en cours de route si un
découpage dépasse 7 tâches. Jamais de jalon par réflexe.

Ne jamais dire « projet » pour un Project Linear : c'est une feature.

## Quand cette skill s'applique

1. **Commande explicite** : `/pilot init|roadmap|feature|run|next|fix|sync|benchmark`.
2. **Demande en français** : « nouvelle feature : … », « prochaine feature », « pose la
   roadmap », « run », « lance la boucle », « produis », « traite les tâches isolées », « corrige … »,
   « où en est-on » dans un projet piloté.
3. **Projet piloté** : le `CLAUDE.md` du projet contient `## Pilot`. Alors, dans toute
   conversation :
   - **après un cadrage** (plan validé, README produit, PRD) → proposer `roadmap` ;
   - **avant de coder** → vérifier qu'une fiche Linear existe (sinon `feature` ou `fix`) ;
   - **à la livraison** → PR titrée avec le code, tâches citées, arrêt.
4. **Sans section `## Pilot`** : le projet n'est pas piloté. Ne rien faire dans Linear.
   Si l'utilisateur demande une commande autre que `init`, répondre : « Projet non piloté.
   Lancer `/pilot init` d'abord. »

## Règles dures

- **Rien n'est créé dans Linear sans liste validée** par l'humain (« validé », « ok », « go »).
  Toujours proposer un squelette d'abord : titres + une ligne, pas de descriptions complètes.
- **Le moule** : titre **court** (5–6 mots, 45 caractères max, pas de phrase ni de verbe
  conjugué : « Case à cocher par tâche », « Export CSV », « Écran d'inscription ») ; le
  résultat vérifiable va dans « Terminé quand », pas dans le titre. Description en trois temps
  selon le template (`reference/template-*.md`) ; « Terminé quand » en cases à cocher, des
  constats observables. Même règle pour les features et les livraisons.
- **Granularité** : une tâche = un résultat livrable, quelques jours au plus. Trop gros →
  feature ou sous-tâches. Trop fin → une case à cocher.
- **Une PR par livraison** (jalon), titrée `<CODE>-<n> <titre de la livraison>`. Branche
  `feature/<CODE>-<n° première tâche>-<slug>`.
- **Description de PR au gabarit** — elle raconte la LIVRAISON, jamais les fiches (Linear les
  déplie déjà sous la description) : ligne d'ancrage `**Feature « <nom> »** — livraison
  <n>/<total> « <titre> »`, puis `## Ce qui change` (fonctionnel, lisible par un non-dev : **une puce par
  changement**, une phrase chacune, jamais un paragraphe),
  `## Comment` (pour le relecteur : fichiers et fonctions nommés, choix faits et écartés,
  par où relire — **une idée par puce**, courte), `## Preuve` (du constaté : CI verte, sortie
  réelle, capture si UI — jamais de cases à cocher), `## Hors périmètre / risques` (souvent :
  les livraisons suivantes), et en dernière ligne `Closes <CODE>-a, <CODE>-b, …` (toutes les
  tâches de la livraison). Tâche isolée (fix/chore) : même gabarit sans la ligne Feature.
  Chaque dépôt piloté pose ce gabarit dans `.github/PULL_REQUEST_TEMPLATE.md` (pré-rempli par
  GitHub pour les PR manuelles).
- **Branches et environnements** : `main` est la branche de travail de tous les projets : les
  branches de feature en partent et y reviennent par PR ; l'environnement de développement la
  déploie. Dès qu'un environnement porte des utilisateurs (testeurs, clients), le projet déclare
  `Release : release` dans sa section Pilot : la branche `release` ne reçoit que des PR
  `main → release` (titre `Release <AAAA-MM-JJ>`, mergées par l'humain, jamais de fiche Linear
  requise), et les environnements de recette puis de production déploient `release`. Correctif
  urgent : branche depuis `release`, PR vers `release`, puis report sur `main`. Sans ligne
  `Release`, le projet n'a qu'une branche et rien ne change.
- **Jamais de push sur la branche principale ni sur `release`. Jamais de merge.** Le merge est
  humain, à chaque livraison : c'est l'endroit où l'arbitrage reste à l'humain. Claude ouvre la
  PR avec le rapport d'audit et s'arrête.
- **Le contrat de validation précède le code.** Au cadrage d'une feature, on écrit la liste de
  « ce qui devra être vrai » à la fin (10 à 30 phrases, dont des refus : « une facture à zéro
  ne s'envoie pas »). Des tests écrits après le code confirment des décisions, ils n'attrapent
  pas de bugs ; écrits avant, ils sont le cahier des charges. Chaque phrase est affectée à une
  livraison au découpage ; la somme des livraisons couvre tout le contrat.
- **Les livraisons sont disjointes.** Deux livraisons ne touchent pas les mêmes fichiers,
  fichiers de tests compris (un fichier de tests par livraison). C'est ce qui autorise à les
  produire en parallèle sans conflit ; le découpage liste les fichiers de chaque livraison.
  Un point de contact inévitable (navigation, `UAT.md`) se règle au merge, pas en production.
- **Pas de code sans test préalable.** Le producteur est l'agent `tdd-writer` : test rouge,
  code minimal, vert, refactor, un commit par transition. L'historique en est la preuve et le
  `verifier` la contrôle. Ça ne freine pas le parallélisme : le TDD se joue dans une livraison,
  le parallélisme entre livraisons.
- **Les décisions de fond remontent.** Un agent qui rencontre un choix produit ou
  d'architecture non couvert par sa fiche prend l'option la plus réversible et le signale dans
  son rapport ; il ne tranche pas. L'humain tranche au merge, Claude grave la décision dans la
  fiche feature.
- **Compter après chaque création** : annoncé / créé dans Linear. Deux nombres égaux, ou une
  explication.
- **Taille, jamais d'heures** : chaque **livraison** porte une taille S / M / L / XL (critères :
  nombre de tâches S ≤ 2, M 3–4, L 5–7, XL > 7 ; zones touchées ; nouveauté ; dépendances
  externes). La feature porte le label Taille de sa somme (S ≤ 1 h, M ≤ 3 h, L ≤ 8 h, XL
  au-delà, en heures de barème). Justifié en une ligne, corrigeable.
- **Labels** : toute tâche porte un label du groupe « Type » ; toute feature porte un label
  « Taille » (S/M/L/XL).
- **Titre de feature = résultat, pas chantier** : compréhensible par un non-développeur qui
  n'a lu aucun document (« L'agent connaît l'entreprise », pas « Contexte entreprise » ;
  « Nexus en ligne », pas « Staging »). Le nom de chantier technique va dans la description,
  sous « Repères techniques ». Même règle pour les jalons.
- **« Terminé quand » = preuves spécifiques** : des constats observables propres à la feature
  (« l'URL répond », « changer une valeur change le résultat »), jamais une formule générique
  (« toutes les livraisons sont mergées » est vrai de n'importe quelle feature, donc interdit).
- **Caps** : si le cadrage définit des versions ou des thèmes, `roadmap` crée une initiative
  par version/thème (API `initiativeCreate`, le MCP ne sait pas créer d'initiative) et y
  rattache les features (`save_project` → `setInitiatives`). La roadmap se lit alors à deux
  niveaux : initiatives (mois), features (jours). Pas d'initiative pour un projet à une seule
  version. `roadmap` et `sync` posent sur chaque initiative la date cible de sa dernière
  feature (`initiativeUpdate` → `targetDate`). La vue roadmap à deux niveaux se lit dans
  Projects → Display → Timeline → Group by Initiative (la page Initiatives est une liste).
- **Icônes et couleurs** : `roadmap` pose sur chaque initiative une couleur de la palette
  (`#4ea7fc` bleu, `#f2994a` orange, `#27ae60` vert, `#eb5757` rouge, `#26b5ce` turquoise, `#8a6cf0` violet — teintes éloignées pour rester distinctes en thème sombre — dans l'ordre des
  versions) et une icône ; chaque feature prend **la couleur de son initiative** et une icône
  selon son thème (`save_project` → `color`, `icon` ; `initiativeUpdate` par l'API). Ne colore que
  l'icône et les listes : **l'intérieur des barres de la timeline n'est pas paramétrable**
  (gris, partie faite plus foncée), ne pas le promettre. Noms d'icônes acceptés par l'API
  (vérifiés) : Rocket, Sun, Bolt, Heart, Lock, Users, Book, Euro, Dollar, Calendar, Home,
  Chart, Dashboard, Automation, Shield, CreditCard, Bank, Briefcase, Folder, Database.
  Refusés : Flag, Document, Globe, Target, Star, Mail, Key, Settings.
  Sur la frise, les barres sont blanches et seul le pourcentage change ; le statut se lit
  dans la colonne de gauche (Display → Properties → Status : coche = Terminée, cercle pointillé
  = Planifiée). Pour séparer nettement : Display → Grouping → Status, ou Display → Completed
  projects → None pour sortir le terminé de la frise. `init` le rappelle dans ses étapes manuelles.
- **Priorités** : feature → `roadmap` pose Haute (2) sur la première de l'ordre validé,
  Moyenne (3) sur les autres de la version en cours, Basse (4) sur les versions suivantes.
  **Urgent (1) est réservé à l'humain** : c'est sa façon de faire passer une feature devant.
  `next` choisit par priorité croissante, puis par date de début. Tâche isolée : bug → Haute,
  autre → Moyenne. Tâche de feature : pas de priorité propre, la feature ordonne.
- **Dépendances : rares et réelles.** Test de l'inversion : une relation ne se pose que si
  inverser l'ordre **casse** (pas si c'est « juste bizarre » — ça, c'est la file de passage,
  les dates suffisent). Entre tâches : API `issueRelationCreate`, type `blocks`. Entre
  features : API `projectRelationCreate` (`projectId` + `anchorType: "start"`,
  `relatedProjectId` + `relatedAnchorType: "end"`, `type: "dependency"` — seule valeur
  acceptée, vérifiée) ; la relation se dessine sur la frise. **Feature ↔ tâche : impossible
  dans Linear** — une décision ou un accès à obtenir reste une tâche isolée, citée dans la
  fiche des features qu'elle conditionne. Linear signale les conflits (chevauchement,
  avertissement) mais **ne décale jamais une date tout seul** : replanifier est le travail
  de `sync`.
- **Scénario retenu** : la frise datée montre **le plan auquel on croit**, y compris
  derrière une décision pas encore prise — on ne retire jamais les dates d'une feature
  suspendue à une décision. L'autre branche existe en **réserve** : des features sans
  aucune date, jamais supprimées. La fiche de la tâche-décision décrit les deux branches
  (quelles features s'annulent, lesquelles se datent) et porte une échéance (`dueDate`).
  C'est l'alerte de `sync` (décision en retard), pas l'absence de dates, qui rappelle que
  le plan est conditionnel.
- **Le facteur limitant est le temps humain disponible**, pas la taille du code : avec
  Claude, une PR se livre en minutes. La roadmap se calcule en jours actifs, jamais en
  « temps de développement ».

## Outils

- **Quotidien** (features, tâches, statuts, commentaires, documents) : les outils MCP
  `mcp__<connexion>__*` (`save_project`, `save_issue`, `list_issues`, `list_projects`,
  `get_team`, `list_issue_statuses`, `save_comment`, `save_document`…), où `<connexion>` est
  le nom donné dans la section Pilot (`linear` par défaut). Charger leurs schémas via
  ToolSearch avant usage.
- **Structure** (team, statuts, labels, templates, automatisation PR, archivage) : le script
  `scripts/init_team.py`, qui appelle l'API GraphQL avec la clé du workspace. Le MCP ne sait
  pas faire ces opérations, ni créer ou colorer une initiative (`roadmap`).
  **Tout le reste passe par le MCP** : statut de feature = `save_project` → `state` (nom du
  statut, ex. « En revue »), dates = `save_project` → `startDate` / `targetDate`, date de
  jalon = `save_milestone` → `targetDate`. En GraphQL direct, `projectCreate` limite
  `description` à 255 caractères : le corps long (template Feature) va dans `content`. Un collaborateur qui n'a que `/mcp` (pas de clé)
  peut donc jouer `feature`, `next`, `fix`, `sync` ; seule `init` (et les initiatives de
  `roadmap`) exige la clé.
- **Plusieurs workspaces Linear** (un par compte ou par client) : une connexion MCP par
  workspace, nommée `linear-<slug>` (`claude mcp add -s user -t http linear-<slug>
  https://mcp.linear.app/mcp`, puis `/mcp` pour s'authentifier avec le bon compte), et une clé
  API par workspace dans `~/.config/pilot/linear-<slug>.env` (`save-key.sh <slug>`).
  Tous les scripts acceptent `--workspace <slug>` (ou `LINEAR_WORKSPACE=<slug>`). La section
  Pilotage du projet nomme la connexion et le fichier de clé : **toujours les lire avant
  d'appeler Linear**, ne jamais supposer le workspace par défaut. Chaque workspace a son
  propre quota gratuit (2 teams).
- **Les initiatives sont au niveau workspace**, pas au niveau team : supprimer une team emporte
  ses features mais laisse ses initiatives orphelines — les supprimer explicitement
  (`initiativeDelete`) quand on retire un projet. Nommer les initiatives sans ambiguïté entre
  projets d'un même workspace (préfixer du nom du produit si besoin).
- **Historique GitHub** : `gh` (`gh pr list`, `gh pr view`, `gh pr create`).
- **Benchmark** : `scripts/benchmark.py`.

## Statuts

**Tâche** (par team) : Backlog → À faire → En cours → En revue → Terminée ; Bloquée ;
Annulée / Duplicate. « En cours », « En revue », « Terminée » sont posés par GitHub
(commit poussé sur une branche portant le code, PR ouverte, PR mergée ; une PR brouillon
vaut « En cours »). Claude coche aussi les tâches au fil de l'eau.

**Feature** (Project, statuts partagés par le workspace) : À cadrer → Planifiée →
En développement → En revue → Terminée → Rétro faite ; Annulée.
**GitHub ne change jamais le statut d'une feature.** C'est Claude qui le pose :
- « À cadrer » à la création (roadmap) ;
- « Planifiée » quand les tâches sont créées ;
- « En développement » à la création de la branche ;
- « En revue » quand les PR de la livraison sont ouvertes et auditées ;
- « Terminée » par **réconciliation** (`sync`, jouée au début de chaque `next`) : PR mergée
  et toutes les tâches terminées.

---

## Commandes

**Chaque commande s'arrête à une validation et finit en proposant la suivante** (« Découpage ? »,
« Je lance la production ? », « Feature suivante : X, cadrage ? »). L'humain n'a jamais à se
souvenir de l'ordre : il répond oui ou non. `next` lit Linear et propose l'étape logique, à
n'importe quel moment.

**Le détail de chaque commande est dans `reference/`. Lis le fichier avant d'exécuter la
commande — ne travaille jamais de mémoire :** les étapes, les arrêts et les gabarits y sont, et
une commande jouée d'après ce résumé sautera la moitié de son travail.

### Cadrer — `reference/cadrer.md`

| Commande | Ce qu'elle fait | Elle s'arrête sur |
|---|---|---|
| `init` | Une fois par projet. Cherche l'état du domaine, mène l'entretien, écrit le PRD, crée la team Linear, pose les meubles dans le dépôt. | La validation du PRD |
| `roadmap` | Propose toutes les features et leur ordre, les fait relire par le `contradicteur`, puis les crée et les date. | La validation de la liste |
| `feature` | Deux temps. Cadrer : décisions produit et contrat de validation, relus par le `contradicteur`. Découper : le `decoupeur` propose des livraisons qui ne partagent aucun fichier. | Deux validations : le cadrage, puis le découpage |

### Produire — `reference/produire.md`

| Commande | Ce qu'elle fait | Elle s'arrête sur |
|---|---|---|
| `run` | La seule qui tourne sans toi. Une copie du dépôt par livraison, un `tdd-writer` dans chacune, puis `verifier` et `testeur` en parallèle, le `correcteur` s'il y a des défauts, et un rapport dans chaque PR. | Le merge, qui est humain |

### Suivre — `reference/suivre.md`

| Commande | Ce qu'elle fait | Elle s'arrête sur |
|---|---|---|
| `next` | Lit Linear, dit où on en est en cinq lignes, propose l'étape suivante. Ne fait rien de lui-même. | Sa proposition |
| `fix` | Une tâche isolée en un geste : fiche, branche, test, PR. Ne passe pas par la boucle. | La PR ouverte |
| `sync` | Après un merge. Remet les statuts d'aplomb, recale les dates, recalcule le barème, et grave les leçons d'audit dans le `CLAUDE.md` du projet. | Rien — enchaîne sur `next` |
| `benchmark` | Produit le barème de charge initial à partir de dépôts existants. | La validation des dépôts |
| `update` | Met la méthode de ce projet à jour depuis le dépôt `pilot`. | Le commit, à valider |

## Où vit la méthode

Ce projet porte sa propre copie de la méthode, dans `.claude/` : les six fiches d'agent, cette
skill, les outils. Elle est versionnée avec lui. Tous ceux qui clonent le dépôt travaillent
donc avec la même.

**Cette copie ne se modifie jamais.** Une amélioration se fait dans le dépôt `pilot`, sur une
branche, avec une PR.

`update` va chercher la nouvelle version : `cd ~/Desktop/PILOT && git pull && ./install.sh
<ce projet>`, puis un commit `chore: update the pilot method to <version>` qui dit ce qui a
changé. Ne jamais le faire pendant qu'une livraison est en cours : un agent lancé avec
d'anciennes fiches finirait avec les nouvelles.

## Le circuit en une ligne

`init` (PRD) → `roadmap` → par feature : `feature` (cadrage, contrat ; puis découpage disjoint)
→ `run` (boucle : tdd-writer × n, verifier + testeur, correcteur, PR) → merge humain → `sync`
(réconcilie, apprend) → `next`. Quatre validations humaines par feature : cadrage, découpage,
merge, idiomes. Entre deux, Claude travaille seul.

## Vérification à l'échelle

- Compter aux trois endroits : annonce de Claude, Linear, GitHub (branches / PR).
- Sonder deux fiches au hasard contre le moule.
- Audit mensuel : labels sans tâche, tâches sans feature depuis plus d'un mois, features
  « En revue » sans PR, features à 100 % non terminées.
