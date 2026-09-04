# Système de design — mode d'emploi pour les agents

Déposé le 2026-09-04 (export Claude Design, dossier `bundle/`). **Consigne de Cédric : ces
écrans sont des références, pas une règle absolue. On les adapte quand la navigation ou
l'expérience utilisateur y gagne.** Les tokens, eux, s'appliquent tels quels.

## Ce qu'il y a dans `bundle/`

| Fichier | Ce que c'est | Quand le lire |
|---|---|---|
| `tokens.css` | Les variables CSS (thème clair `:root`, sombre `.dark`, échelles de texte, espacements, densité, ombres, focus). **Source de vérité des valeurs.** Copie intégrée dans `src/app/globals.css`. | Toujours. |
| `Fondations & composants.dc.html` | Chaque brique avec ses variantes, ses états et sa règle d'emploi en regard : couleur, typographie, boutons, champs, signalement (badges, bannières, toasts, états vides, squelettes), liste dense, coque et palette ⌘K, briques de fiche, timeline, calendrier. | Avant tout écran. Lire le HTML et le CSS, pas des captures. |
| `Ecrans-types.dc.html` | Les briques assemblées : liste et kanban des opportunités, fiche d'une mission, timeline de staffing, tableau de bord, ⌘K ouverte, en clair et en sombre. | Pour composer un écran de la même famille. |
| `Facture A4.dc.html` | Gabarit imprimable de facture (niveaux de gris, `.doc-print`). | Feature 7. |
| `uploads/*.png` | Captures prises par Cédric sur le rendu ; certaines montrent des défauts de rendu de l'outil, ce ne sont pas des maquettes. | Repère visuel seulement. |
| `_ds/nocturne-…/` | Le système générique de base de l'outil (sombre, Phosphor, boutons en contour). **Ne pas l'appliquer** : le CRM en dévie (bouton principal plein, deux thèmes, lucide). | Jamais. |
| `HANDOFF-README.md`, `support.js`, `doc-page.js` | Mécanique de l'outil d'export. | Jamais. |

## Règles qui s'appliquent telles quelles (tirées des fondations)

- **Couleur** : neutres froids, un seul accent (`--primary`, blurple) réservé à trois usages : action principale, élément sélectionné, anneau de focus. Quatre sémantiques (succès, avertissement, danger, info) sur des surfaces de moins de 40 px : badge, point, barre, icône, bannière. Jamais un fond d'écran ni une ligne entière. Aucune information portée par la couleur seule.
- **Typographie** : Inter, 400 texte / 500 titres et libellés / 600 chiffres et en-têtes. Tailles de travail 12 / 13 / 14 px (`text-sm`, `text-base`, `text-md` dans Tailwind, remappés dans `globals.css`). Montants, dates et colonnes numériques en chiffres tabulaires, alignés à droite. Format : `12 500,00 €`, `4 sept. 2026`.
- **Densité** : ligne de tableau 32 px (plafond 36), en-tête 28, contrôle 28 (sm 24, lg 32), barre supérieure 40, sidebar 224 / 48 repliée, fiche en trois colonnes 260 / élastique / 380. Sous 1280 px la colonne de gauche se replie ; sous 900 px une colonne, le fil d'activité devient un onglet.
- **Boutons** : un seul bouton principal plein par écran (la création). Le reste en secondaire ou fantôme. Icônes à 14 px, jamais seules sans libellé ou tooltip. Raccourci affiché à droite du libellé dans les menus.
- **Formulaires** : libellé au-dessus (12 px / 500), aide et erreur sous le champ (11 px), jamais en tooltip seul. Création rapide en Dialog (5 champs max, ⌘⇧N, ⌘↵ pour créer, Échap ferme) ; édition longue en Sheet de 420 px, la liste reste visible derrière ; confirmation si le formulaire est sale.
- **Signalement** : cinq familles de statut (inerte, en cours, abouti, à traiter, en défaut), une teinte par famille, jamais une par valeur. Badge 20 px, point plein en cours, creux si inerte. Bannière de fiche en haut du contenu, bordure gauche 3 px, une seule à la fois (la plus grave plus un compteur). Toast succès 4 s, erreur persistante avec action de retour si réversible. Squelette à la hauteur réelle (32 px).
- **Liste dense** : pas de zébrage, bordure basse 1 px, édition en place (double-clic ou ↵, Tab enregistre et avance, Échap annule), tri au clic, colonnes réordonnables et masquables, première colonne figée, sélection par case (⇧-clic plage, ⌘A), barre d'actions groupées, pied avec compteur et total en euros, défilement continu (pagination au-delà de 500 lignes). Puces de filtres champ + opérateur + valeur en 24 px ; filtres + tri + type de vue = vue épinglée.
- **Coque** : sidebar en trois groupes (objets, vues épinglées, compte), item 26 px, compteur à droite rouge seulement en défaut. Barre 40 px : bascule de sidebar, fil d'Ariane objet → vue, notifications, action de création. ⌘K 560 px : résultats (objets préfixés de leur icône) puis actions, première ligne présélectionnée, pied avec les touches. Thème dans le pied de sidebar et dans ⌘K, système par défaut.
- **Fil d'activité** : antéchronologique, groupé par jour, filtres par type en puces, mention « automatique » en toutes lettres. **Timeline** : 28 px par consultant, barre 18 px, quatre états distingués par teinte et trait, salarié sans mission en tête « à replacer ». **Onglets** : 32 px, soulignement accent 2 px, compteur à droite, onglet vide visible à 45 %.
- **Focus clavier** : `--focus-outline` partout, jamais supprimé. Contraste AA vérifié par les tokens.

## Écarts assumés avec le bundle

- **Icônes** : le bundle utilise Phosphor ; le projet utilise **lucide-react** (livré avec shadcn/ui), aux mêmes tailles (14 px inline, 16 px dans la sidebar). Ne pas ajouter Phosphor.
- **Composants** : ceux de `src/components/ui/` (shadcn, style base-nova) sont la base ; on les habille avec les tokens, on ne recopie pas le HTML du bundle.
- **Adaptation** : quand un écran-type contredit une bonne navigation (profondeur de clics, mobile, accessibilité), on adapte et on le dit dans le rapport de la livraison. Le `verifier` et le `testeur` comparent aux fondations, pas au pixel.
