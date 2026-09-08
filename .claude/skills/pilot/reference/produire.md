# Produire — `run`

_Détail de la boucle de production : worktrees, `MISSION.md`, `tdd-writer`, audit par_
`verifier` et `testeur`, correction, PR. La seule commande qui tourne sans l'humain._

---

## `run <feature>` — produire toutes les livraisons en boucle agents

La production tourne sans l'humain, de la feature « Planifiée » aux PR auditées. Recette
complète dans `BOUCLE-AGENTS.md` (dépôt `AlanZien/pilot`) ; l'essentiel ici.

**Annonce chaque transition, au fil.** L'humain ne voit rien de ce qui se passe entre le
lancement et le rapport final : ni l'avancement, ni la dépense. Une ligne suffit, à chaque fois
qu'un agent démarre ou rend, sans attendre qu'on te le demande :

```
Livraison 1/3 « Saisie des lignes » — producteur lancé
Livraison 1/3 — PR #42 ouverte, audit en cours
Livraison 1/3 — verifier : 2 points importants · testeur : 1 défaut → correcteur
Livraison 2/3 « Numérotation » — producteur lancé
```

Une ligne par événement, jamais un paragraphe. Un run muet pendant vingt minutes est un run
qu'on ne peut pas interrompre au bon moment. **L'accusé d'arrêt d'un agent qui a déjà rendu
son rapport ne vaut pas une ligne** : cinq « accusé d'arrêt, déjà pris en compte » par
livraison, c'est du bruit qui cache les vraies transitions.

1. Pré-requis : feature « Planifiée », `.claude/settings.json` (allowlist) et
   `.pilot/MISSION.template.md` présents, branche principale à jour. Lire `Agents en
   parallèle : n` dans la section Pilot (**défaut 1** : les livraisons se font l'une après
   l'autre tant que le projet n'a pas prouvé sa boucle ; l'humain monte la valeur quand il
   le décide). Annoncer le plan en trois lignes : livraisons, agents en parallèle, critère
   d'arrêt — et proposer à l'humain de le verrouiller avant de lancer :
   `/goal Chaque livraison de la feature <X> a une PR ouverte, auditée par verifier sans
   bloquant ni important, passe visuelle du testeur sans défaut constaté, tests verts,
   décisions à trancher listées dans la PR. Un défaut encore présent après un aller-retour
   de correction : PR ouverte quand même, marquée non mergeable, et le but est déclaré non
   atteint.`
   Lire aussi `Lancer l'app :` et `Testeur :` dans la section Pilot : sans commande de
   lancement, le testeur n'a pas d'application à ouvrir — le dire avant de lancer, pas après.
   Feature → « En développement ».
2. **Un worktree par livraison, toujours créé depuis `main` à jour** : `git fetch && git
   worktree add ../<repo>-<n> -b feature/<CODE>-<n° première tâche>-<slug> origin/main`. Même
   en série (n = 1), jamais depuis la branche de la livraison précédente : les livraisons sont
   disjointes, leurs PR doivent être indépendantes et mergeables dans n'importe quel ordre, sans
   rebase. Des PR empilées obligent à merger dans l'ordre et à retarger les bases.

   **Un worktree se crée au moment où son producteur démarre, pas au début du run.** Le
   découpage a peut-être laissé un point de contact : deux livraisons qui ajoutent chacune une
   ligne au même fichier partagé. Créer leurs deux worktrees d'avance les fait partir du même
   `main`, et les deux lignes se retrouvent au même endroit au merge. Le découpage indique ces
   contacts ; en série, la livraison suivante part après le merge de la précédente. Y écrire
   `MISSION.md` depuis le gabarit. **Il ne porte que le variable** : tâches (codes), fichiers
   modifiables (ceux du jalon), décisions produit recopiées de la fiche feature, **le texte des
   phrases du contrat** affectées à cette livraison (le numéro seul ne dit pas ce qu'il faut
   prouver), idiomes du `CLAUDE.md` qui touchent ces fichiers, commande de tests, titre de la PR.
   **La liste des fichiers se déduit du contrat, phrase par phrase** : pour chaque phrase,
   écris les fichiers qui la portent, et vérifie qu'ils sont dans la liste. Deux fois de suite
   sur crm-workday, une phrase du contrat demandait un écran que la liste n'ouvrait pas ; le
   producteur a signalé et s'est arrêté, comme sa fiche le veut, et il a fallu le relancer.
   Quand ça arrive quand même, **le producteur relancé ouvre un nouveau cycle** : son code
   n'a jamais été relu, donc `verifier` et `testeur` repassent, puis une correction, une
   seule. Ce n'est pas une seconde correction sur le même audit, c'est le premier aller-retour
   d'un second cycle.
   La façon de travailler — ordre des commits, périmètre, « tu ne tranches pas », `UAT.md`, stop
   après la PR, format du rapport — est dans la fiche de l'agent, pas ici : deux textes qui
   disent la même chose finissent par se contredire. L'exclure de git (`.git/info/exclude`).
   **Deux producteurs à la fois : chaque worktree a son poste.** Sur une page statique, deux
   worktrees vivent côte à côte sans rien partager. Sur une application avec serveur et base,
   ils partagent tout : le port, la base de développement, la base de test, et le journal des
   migrations. Le second serveur refuse de démarrer, les tests de l'un cassent sur les tables
   de l'autre, et l'outil de passe visuelle photographie l'application du voisin. Avant de
   monter `Agents en parallèle` à 2, la section Pilot porte une ligne `Poste par worktree :`
   qui dit ce qui change d'un worktree à l'autre — sur crm-workday, un fichier `.env.local`
   par poste, A ou B, avec son port et ses deux bases. Au moment de créer le worktree, le lead
   lui attribue un poste libre et y copie ce fichier ; `Lancer l'app` reste la même commande.
   Le testeur reçoit l'URL du poste. **Une migration au plus par paire** : le journal des
   migrations est un fichier partagé, deux branches qui y ajoutent chacune une entrée se
   contredisent au merge ; le découpeur le déclare comme contact. Sans ligne `Poste par
   worktree`, on reste à 1.
   C'est ce qui permet l'épreuve des deux heures de la méthode : deux livraisons disjointes,
   deux worktrees, l'écran fermé, et deux PR à relire au retour.
3. **Lancer les producteurs**, un agent `tdd-writer` par worktree, au plus `n` à la fois
   (une livraison finie libère une place pour la suivante ; le plafond reste le nombre de
   livraisons disjointes). Session indépendante (pane) quand le travail est long et doit être
   visible ; sous-agent quand seul le rapport compte. **Dans les deux cas la fiche doit
   s'appliquer** : un pane se lance par `claude --agent tdd-writer` dans le worktree, sinon la
   session est un Claude ordinaire et n'a aucune des règles de la boucle.
   Chaque producteur : cycles test rouge → code → vert, un commit par transition, tâches
   → « Terminée » au fil de l'eau, `UAT.md` (sa section : une case par « Terminé quand »,
   avec sa donnée et son refus, **non cochée**), push, PR au gabarit, stop.
4. **Audit et recette**, en parallèle sur chaque PR, par deux agents qui n'ont pas écrit le
   code :
   - `verifier` sur `git diff main...HEAD` : sécurité, idiomes, couverture des numéros de
     contrat de la livraison, ordre test → code dans l'historique.
   - `testeur` sur l'application lancée (`Lancer l'app`), dans le worktree de la livraison :
     il lance `.claude/tools/passe-visuelle/passe-visuelle.mjs` sur chaque écran livré
     (avec l'`Amorce de recette` déclarée, sans quoi il ne verrait que des écrans vides).
     Sa consigne porte quatre choses : **la commande `Lancer l'app`**, que l'outil lance et
     arrête lui-même (un testeur qui tue à la main un serveur lancé en tâche de fond peut
     rester bloqué une heure sur ce `kill`) ; **les écrans, trois au plus** (au-delà, une
     seconde passe ou un second testeur : sur quatre ou cinq écrans il double son budget à
     chaque fois) ; **le geste qui ouvre l'écran** quand il ne s'affiche qu'après une action
     (« ⌘K puis "acm" », « clic sur Nouveau ») ; **ce qui est déjà connu** — les tâches
     isolées ouvertes de la team et les écarts « à relire » des livraisons précédentes de la
     feature, pour qu'il ne les rapporte pas une troisième fois et que le correcteur ne soit
     pas lancé sur du connu.
     L'outil mesure en dix secondes le débordement horizontal et l'élément fautif, les
     recouvrements, le parcours clavier et la console, et dépose images et `mesures.json`
     dans `.pilot/recette/<date>-<écran>/`. L'agent ne refait pas ces mesures : il regarde
     les images et juge ce qu'aucune mesure ne dit (texte tronqué, bloc étiré, contenu
     caché, écran vide, lisibilité en sombre). Navigateur piloté en secours, 15 actions au
     plus. Il rend des faits mesurables avec leurs images ; **il ne joue pas `UAT.md`, ne
     coche rien, ne commite rien** : le cahier de recette est déroulé à la main par
     l'humain, en recette, pas par un agent.
   Les deux lisent le diff ou l'écran, jamais les deux : c'est ce qui fait deux preuves
   différentes. Ils sont en lecture seule : ils **chevauchent la production de la livraison
   suivante** (le producteur n+1 démarre dès que le producteur n a ouvert sa PR). Seuls les
   producteurs sont limités à `Agents en parallèle` ; les contrôleurs, non.
   Bloquant ou important de `verifier`, **ou défaut constaté** par `testeur` → l'agent
   `correcteur`, avec la liste fermée des corrections (les deux rapports réunis), re-tests, push.
   Il corrige cette liste et rien d'autre ; ce qu'il voit en passant, il le signale sans y toucher.
   Puis `testeur` **relance sa passe sur le seul écran corrigé** — dix secondes, il compare
   les mesures. Un aller-retour, pas plus : si le défaut persiste, la PR s'ouvre quand même,
   marquée **non mergeable** dans son rapport, défauts en tête. Mineur → commentaire.
5. **Rapport dans chaque PR** (commentaire), au gabarit fixe ci-dessous. Il est lu par un
   humain qui décide de merger en trente secondes : le verdict d'abord, le fonctionnel
   ensuite, la technique repliée. Jamais de tableau à deux colonnes (il suggère une
   correspondance ligne à ligne qui n'existe pas), jamais d'identifiant de commit, de nom de
   fonction ou de fichier hors du bloc replié. Ne jamais écrire « auditée » ou « recettée »
   pour ce qui n'a pas été joué.

   ```
   ## Livraison <n>/<total> « <titre> » — <Mergeable | Non mergeable>, <k> points à relire, <d> décisions

   ### Prouvé
   - <N> tests verts (<n> nouveaux).
   - Audit du code : rien de bloquant ; <n> point(s) important(s) corrigé(s) (<en un mot ce que c'était>).
   - Recette à l'écran : <c> cas sur <t> constatés<, m refusés : …>.

   ### À relire par toi (ce que la boucle ne sait pas juger)
   - <Écran>, <élément> : <ce qu'on voit, en mots d'utilisateur>.        (5 au plus)

   ### Décisions à trancher
   - <Question ?> (choix fait en attendant : <option la plus réversible>)

   ### Suite
   - <ce qui dépend de ce merge, écarts au périmètre s'il y en a>

   <details><summary>Détails techniques</summary>
   corrections faites (commits), mineurs non corrigés, constats de process, cases non testables et pourquoi, environnement de recette.
   </details>
   ```

   Feature → « En revue », URL des PR attachées à la feature.
6. **S'arrêter.** Dire : « n PR ouvertes, auditées et recettées, sans bloquant ni défaut
   constaté ; à relire : … ; décisions à trancher : … ».
   Le merge est humain. Ne jamais enchaîner une autre feature.
7. Enregistrer dans `.pilot/calibration.md` : feature, taille, date de début, date des PR,
   nombre de tâches. Puis rendre la **chronologie du run** dans la réponse finale : une ligne
   par étape (cadrage, chaque tour de production, chaque attente de merge) avec début, fin et
   durée ; la durée cumulée de travail d'agents et le temps réel (le tuilage fait la
   différence) ; le temps d'attente humaine à part ; ce que le testeur et le verifier ont
   attrapé (nombre) ; l'écart au barème (`feature_hours_<T>`) pour que `sync` recalibre. Ce
   sont les seules mesures fiables de la boucle : sans elles, la roadmap se date sur des
   suppositions.

   **Puis, sans qu'on te le demande, lance le relevé de coût :**

   ```bash
   python3 .claude/tools/cout-agents/cout-agents.py . --seuils
   ```

   Colle son tableau dans la réponse finale, sous la chronologie, et reporte sa dernière
   ligne (heures d'agents, heures d'attente, échanges, jetons) dans `.pilot/calibration.md`
   à côté de la feature. **Si un agent ressort au-dessus des seuils, dis-le en clair** : quel
   agent, quel écart, et ce qu'il faisait — un agent qui dérape est un symptôme (consigne
   floue, test qui résiste, écran introuvable), pas une fatalité. C'est la seule occasion où
   la dépense est visible : après, plus personne ne regarde.

   **Lis la colonne « attente » avant d'écrire une cause.** Un agent qui attend une
   permission ressemble à un agent qui travaille : son horloge tourne, son rapport arrive en
   retard, et rien ne dit qu'il n'a rien fait. Le relevé nomme chaque attente de plus de cinq
   minutes avec la commande qui la précède. Si le relecteur affiche 161 minutes d'horloge
   pour 9 minutes actives après une commande composée, la cause est la permission, pas les
   tests. Le 05/09, le lead a écrit « le relecteur a relancé les tests et le build » sans
   regarder : c'était faux, et la fausse cause est devenue une fausse leçon dans la note du
   projet. Une durée que l'outil n'a pas mesurée s'écrit « estimée », jamais sous son nom.
8. Suite proposée : « merge, puis `sync` ».

Sans worktree possible (dépôt non clonable, une seule livraison) : même discipline dans la
session courante, `tdd-writer` comme producteur, `verifier` et `testeur` avant la PR.
