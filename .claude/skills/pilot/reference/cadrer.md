# Cadrer — `init`, `roadmap`, `feature`

_Détail des trois commandes de cadrage. Chacune s'arrête sur une validation humaine :_
_le PRD, la liste des features, le contrat de validation, le découpage._

---

## `init` — cadrer et déclarer un projet piloté

Pré-requis : dépôt git avec remote GitHub ; clé API du workspace dans `~/.config/pilot/`
(`linear.env`, ou `linear-<slug>.env` pour un autre workspace) ; connexion MCP authentifiée
sur ce workspace ; intégration GitHub activée dans ce workspace (Settings → Integrations).

0. **Chercher, puis cadrer, s'il n'y a rien à lire.** Si le dépôt n'a ni PRD ni README qui
   dise ce que le produit fait et pour qui :
   **D'abord la recherche.** Demander en une phrase de quoi parle le produit, puis lancer la
   skill `research-assistant` sur ce sujet : ce qui existe déjà, les standards du domaine, les
   règles extérieures qui s'imposent (réglementation, formats obligatoires, obligations
   légales), ce que font les produits comparables. Le document va dans `.pilot/recherche.md`.
   On n'ouvre pas un entretien avec des questions à blanc : au moment du PRD, personne ne sait
   encore rien, et une supposition posée là se paie sur toute la roadmap.
   **Puis l'entretien**, informé par ce qu'on a trouvé : à qui ça sert, le problème, ce
   que l'utilisateur pourra faire, ce qui est hors périmètre, les contraintes (stack,
   échéance, environnements), les versions ou thèmes s'il y en a. Poser les questions par
   petits lots, pas un questionnaire. Écrire le résultat dans `.pilot/PRD.md` (une page :
   utilisateurs, problème, périmètre V1, hors périmètre, contraintes, grandes fonctionnalités
   pressenties). Annoncer d'emblée le nombre de lots (trois, en général : utilisateurs et
   problème ; périmètre et hors périmètre ; contraintes et versions). **S'arrêter : l'humain
   valide le PRD.** Si un cadrage existe déjà, le lire et passer à l'étape 1.

0 bis. **La direction visuelle**, si le produit a des écrans. Sans elle, les agents rendront
   l'interface que le modèle produit par défaut — et personne ne pourra dire qu'elle est fausse,
   puisque rien ne disait ce qui était attendu. Trois questions, pas plus :
   **des produits dont tu aimes l'interface** (URL, captures d'écran, un nom suffit) ; **ce qui
   est imposé** (logo, couleurs, police, charte existante, bibliothèque de composants) ; **le
   registre** — dense et professionnel, ou aéré et grand public.
   La recherche de l'étape 0 sert aussi ici : elle a regardé les produits comparables, elle peut
   dire à quoi ils ressemblent.
   Écrire `.pilot/design.md` : les références avec ce qu'on leur emprunte, ce qui est imposé, le
   registre. Rien sur les écrans à ce stade — ils ne seront connus qu'après la roadmap.
   **S'arrêter : l'humain valide.** Produit sans écran (bibliothèque, API, script) : sauter
   cette étape et le dire.
1. Demander le **workspace** (slug d'URL ; s'il y a plusieurs connexions MCP, laquelle), le
   **nom** du projet et la **clé** (3 lettres, proposer une valeur d'après le nom).
   Rappeler : plan gratuit = 2 teams par workspace.
2. Lancer `python3 .claude/skills/pilot/scripts/init_team.py --name "<nom>" --key <CLE>
   [--workspace <slug>]`.
   Le script est idempotent : il **adopte** une team existante portant cette clé et complète
   ce qui manque. Montrer le rapport. S'il liste des actions « MANUEL », les donner à
   l'utilisateur avec le chemin exact dans Linear.
3. Écrire la section `## Pilot` dans le `CLAUDE.md` du projet à partir de
   `reference/section-pilot.md` (remplir workspace, nom, clé, id). Créer le fichier s'il
   n'existe pas. Ne pas toucher au reste du fichier.
4. Créer `.pilot/` à la racine avec `calibration.md` (copie du barème global
   `~/.config/pilot/calibration.md` s'il existe, sinon un barème vide et une note
   « lancer `/pilot benchmark` »). Le dossier contient déjà `PRD.md` et `recherche.md`
   depuis l'étape 0.
4 bis. **Projet à plusieurs** (dès qu'un second membre est prévu) : écrire `.mcp.json` à la
   racine,
   `{"mcpServers": {"<connexion>": {"type": "http", "url": "https://mcp.linear.app/mcp"}}}`.
   Chaque membre clone, fait `/mcp` → s'authentifie avec son compte Linear. La méthode est
   déjà dans `.claude/`, versionnée avec le dépôt : tout le monde travaille avec la même.
   Aucune clé API dans le dépôt.
5. Vérifier que le dépôt est couvert par l'intégration GitHub de Linear : demander à
   l'utilisateur de confirmer que l'organisation du dépôt apparaît dans Linear → Settings →
   Integrations → GitHub → Connected organizations. Sinon lui indiquer le bouton « + ».
6. Poser les gabarits GitHub du dépôt :
   - `.github/PULL_REQUEST_TEMPLATE.md` au gabarit de PR (codes du projet), s'il manque ;
   - `.github/ISSUE_TEMPLATE/config.yml` qui neutralise les issues GitHub et renvoie vers
     Linear :
     `blank_issues_enabled: false` + `contact_links: [{name: "Les tâches se suivent dans
     Linear", url: "<url de la team>/all", about: "Aucune issue GitHub sur ce projet."}]`
     (le suffixe `/all` ouvre directement la liste des tâches, pas l'accueil de la team).
7. Poser la base de la boucle : les lignes `Lancer l'app :` et `Testeur :` de la section
   Pilot (déduites de la stack : page statique → `python3 -m http.server 8765` et navigateur
   piloté ; app avec serveur → sa commande de dev ; mobile Expo → simulateur + Maestro),
   confirmées d'un mot ; `.claude/settings.json` avec l'allowlist (commande de tests
   du projet, `git status/diff/log/add/commit/push/branch`, lectures, outils MCP Linear de
   lecture et `save_issue`/`save_project`/`save_comment`) s'il n'existe pas ; `.pilot/MISSION.template.md`
   copié depuis `reference/MISSION.template.md`, commande de tests adaptée.
8. Si aucun barème n'existe : proposer `benchmark`.
9. Suite proposée : `roadmap`.

## `roadmap` — poser toutes les features du projet

1. Lire le cadrage disponible (PRD, spec, README, plan validé, backlog existant).
2. Proposer **la liste complète des features** (grandes fonctionnalités, échelle semaines) et,
   pour chacune, **ses livraisons** (titre-résultat + taille S/M/L/XL) et l'ordre suggéré.
   Signaler ce qui existe déjà dans Linear. **Ne rien créer.**
3. Dialoguer : fusions, coupes, rejets, réordonnancement. Attendre « validé ».
   Rappel : on ne découpe pas en tâches à ce stade ; le découpage complet d'une feature se
   fait à son ouverture (`feature` / `next`), jamais avant, jamais par morceaux.
   Deux renforts, à ce niveau seulement : l'agent `contradicteur` sur la liste proposée (ce
   qui manque, ce qui se contredit, ce qu'on ne saura pas vérifier) ; et, si la roadmap engage
   plusieurs mois, proposer à l'humain de basculer sa session (`/model`) sur le modèle le plus
   capable le temps de la poser. Une roadmap est un dialogue : elle ne se délègue pas à un
   agent, mais le modèle qui la tient peut être choisi.
4. Créer chaque feature (`save_project`) : team du projet, statut « À cadrer », description au
   template Feature (avec la liste des livraisons), label `Taille`, priorité selon la règle,
   dans l'ordre ; puis ses livraisons (`save_milestone`, ou API `projectMilestoneCreate`,
   `sortOrder` = rang). Initiatives seulement si le cadrage définit des versions. Icône et
   couleur par initiative (règle « Icônes et couleurs »). **Aucune tâche.**
5. Dates : `python3 .claude/skills/pilot/scripts/schedule.py --calibration
   .pilot/calibration.md --start <prochain jour actif> "Livraison:S" "Livraison:M" …`
   sur **les livraisons** dans l'ordre validé (non terminées seulement, feature en cours
   d'abord). Il lit `feature_hours_<T>` (= heures par livraison de taille T),
   `feature_overhead_hours`, `hours_per_active_day`, `days_per_week` et enchaîne les livraisons
   sur les jours actifs. Poser `targetDate` sur chaque jalon, `startDate` / `targetDate` sur
   chaque feature (première / dernière livraison). Ce sont des fenêtres plausibles, pas des promesses :
   le dire. Sans barème, laisser vide et proposer `benchmark`. Contrainte : une feature
   n'est jamais datée avant la fin de sa bloquante.
5 bis. Dépendances : celles retenues par le test de l'inversion figuraient dans la liste
   validée (ligne « dépend de ») ; les poser (`projectRelationCreate`). Les décisions et
   accès externes deviennent des tâches isolées avec échéance, citées dans les fiches des
   features conditionnées (règles « Dépendances » et « Scénario retenu »).
6. Compter et montrer le lien vers la roadmap.
6 bis. **Le prompt du système de design**, si `.pilot/design.md` existe et que l'humain veut un
   système. C'est le seul moment où l'on sait à la fois ce que le produit fait, à quoi il doit
   ressembler, et quelles familles d'écrans la roadmap suppose.
   Écrire `.pilot/design/PROMPT.md`, prêt à coller dans un outil de maquettage : le produit et
   ses utilisateurs en trois lignes ; la direction visuelle en toutes lettres (références, ce
   qui est imposé, registre) ; **les familles d'écrans déduites de la roadmap**, jamais la liste
   exhaustive — « une liste filtrable », « un formulaire de création », « un tableau de bord »,
   « une page publique sans session » ; la demande explicite d'un fichier de tokens séparé, en
   variables CSS, thème clair et sombre ; les contraintes qui se voient à l'écran (mobile
   d'abord, bibliothèque imposée).
   **Demander des briques, pas des écrans** : tokens, composants, et trois ou quatre écrans-types
   qui montrent comment ils s'assemblent. Un système sert justement à ne pas maquetter chaque
   écran : les producteurs composeront avec ces briques.
   **S'arrêter.** L'humain maquette de son côté et dépose le résultat dans `.pilot/design/`.
   S'il n'en veut pas, ne pas insister : un projet sans système de design est un projet où les
   agents décident du rendu, et où le `verifier` et le `testeur` n'ont rien à comparer. Le dire
   une fois, passer.
7. Suite proposée : `feature <première de l'ordre validé>` (cadrage).
Relançable : ne propose que les features nouvelles.

## `feature <description>` — cadrer puis découper une feature

Deux temps, deux validations. Le cadrage dit ce qui devra être vrai ; le découpage dit qui le
fabrique et dans quel fichier.

**Temps 1 — cadrer.**
1. Retrouver la feature dans Linear (titre proche, statut « À cadrer ») ou en créer une
   nouvelle (après validation, comme `roadmap`). Lire sa fiche, le PRD, le code concerné.
2. Poser les questions qui restent (par petits lots) et proposer, sans rien créer :
   - les **décisions produit** (choix tranchés, avec l'option retenue) ;
   - le **contrat de validation** : 10 à 30 phrases « ce qui devra être vrai », observables
     par l'utilisateur, dont au moins un tiers de refus (ce qui doit être impossible ou
     rejeté). Pas de formule générique valable pour n'importe quelle feature.
   Avant de présenter, lance l'agent `contradicteur` sur ce que tu viens d'écrire : il rend
   les cas non prévus, les phrases invérifiables, les règles qui se contredisent et le supposé
   connu. Présente ses questions à l'humain **avec** ta proposition, sans y répondre à sa
   place : chacune se solde par « à ajouter » ou « hors périmètre ». Un cadrage validé sans
   ce passage est un cadrage validé à l'aveugle — c'est le seul moment où un oubli coûte
   encore une phrase et pas une journée.
3. **S'arrêter : l'humain valide.** Puis écrire les deux sections dans la fiche feature
   (`save_project` → `content`, sections « Décisions produit » et « Contrat de validation »
   du template Feature). La feature reste « À cadrer ».

**Temps 2 — découper.**
4. Lance d'abord l'agent `decoupeur` sur la feature cadrée : il propose les livraisons,
   les fichiers que chacune ouvrira, ce qui les rend indépendantes, et **les frontières dont
   il n'est pas sûr**. Son découpage est une proposition, pas une décision : tu le reprends,
   tu le corriges si le dépôt le contredit, et les frontières incertaines vont à l'humain.
   Puis proposer le **squelette de toute la feature** : pour chaque livraison (jalon), ses tâches
   (titre court + une ligne, label Type), **les fichiers qu'elle touche** (code et fichier de
   tests, disjoints de ceux des autres livraisons), et **les phrases du contrat qu'elle
   couvre** (par numéro). Vérifier : chaque phrase du contrat a une livraison ; aucun fichier
   n'apparaît dans deux livraisons ; chaque tâche a un « Terminé quand » avec au moins un
   constat de refus. **Toutes les tâches de la feature sont créées à son ouverture**, pas
   livraison par livraison : Linear calcule l'avancement sur le total, qui ne redescend jamais.
   Une feature sans jalon = une seule livraison implicite. **Ne rien créer.**
5. **S'arrêter : l'humain valide la liste.**
6. Créer les tâches (`save_issue`) : team, project = la feature, `milestone` = la livraison,
   statut « À faire », label, description au template Tâche, **dans l'ordre des livraisons puis
   des tâches**, `sortOrder` = rang (API `issueUpdate`). Dans la description de chaque jalon :
   ses fichiers et ses numéros de contrat (c'est ce que `run` recopie dans les `MISSION.md`).
   Passer la feature « Planifiée ». Mettre le lien recette (`UAT.md#<slug>` ou Notion).
7. Compter : annoncé / créé. Sonder une fiche au hasard contre le moule.
8. Suite proposée : `run <feature>`.
