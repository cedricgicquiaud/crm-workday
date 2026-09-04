# Prompt — système de design du CRM Workday

_À coller tel quel dans un outil de maquettage (Figma Make, Claude Design, v0, Lovable…). Déposer_
_le résultat dans ce dossier `.pilot/design/` : tokens, composants, écrans-types._

---

Tu conçois le **système de design** d'un CRM sur mesure, pas ses écrans un par un. Je te demande
des briques : des tokens, des composants, et trois ou quatre écrans-types qui montrent comment
elles s'assemblent. Les producteurs composeront ensuite chaque écran avec ces briques.

## Le produit

Un CRM interne pour un cabinet de conseil qui place des consultants spécialisés Workday
(salariés et freelances) chez des grands comptes. Trois utilisateurs, sur ordinateur avant tout,
plusieurs heures par jour. Ils y suivent des entreprises, des contacts, des leads, des
opportunités, des consultants, des missions, des contrats, des CRA (comptes rendus d'activité
mensuels), des factures, et laissent l'outil relancer à leur place.

## La direction visuelle

**Registre** : dense et professionnel. Un outil de travail quotidien, sobre, rapide à lire,
jamais décoratif. Beaucoup d'information par écran, mais hiérarchisée.

**Références, et ce qu'on leur emprunte** :
- **Linear** : la densité, la typographie sobre, la barre latérale fine, le mode sombre de
  qualité, la sensation de vitesse, les raccourcis clavier visibles.
- **Attio** : la fiche en trois colonnes (relations à gauche, champs au centre, fil d'activité à
  droite), l'édition directe dans les cellules de tableau, les filtres en puces, la palette de
  commandes Cmd+K.
- **Twenty** : le kanban sobre, les vues sauvegardées épinglées, la retenue des couleurs.

**Imposé** :
- **Tailwind CSS** et **shadcn/ui** : les composants doivent correspondre à ceux de shadcn/ui
  (Button, Input, Select, Dialog, Sheet, Command, Table, Badge, Tabs, Card, Popover, Tooltip,
  Toast, Sidebar, Calendar) et à leur système de variables CSS. Pas d'autre bibliothèque de
  composants.
- **Police** : Inter (ou Geist), chiffres tabulaires pour les montants, les dates et les
  colonnes numériques.
- **Palette** : neutres froids (gris) + **une seule couleur d'accent** que tu proposes, +
  quatre couleurs sémantiques (succès, avertissement, danger, information) utilisées avec
  parcimonie. Pas de logo ni de charte existante : propose, en restant discret.
- **Thème clair et thème sombre**, tous deux de première qualité, avec un contraste conforme
  WCAG AA.

## Ce que je te demande

### 1. Un fichier de tokens séparé

En **variables CSS**, au format shadcn/ui (`--background`, `--foreground`, `--primary`,
`--muted`, `--border`, `--ring`, `--radius`…), pour le thème clair (`:root`) et le thème sombre
(`.dark`). Ajoute : les couleurs sémantiques, une échelle de tailles de texte adaptée à la
densité (12 / 13 / 14 px comme tailles de travail), une échelle d'espacements serrée, les rayons,
les ombres (peu), les durées de transition (courtes).

### 2. Les composants, par famille

Décris chaque composant avec ses variantes et ses états (repos, survol, focus clavier, actif,
désactivé, chargement, erreur, vide). Familles attendues :

- **Coque** : barre latérale repliable avec les objets et les vues sauvegardées épinglées, barre
  supérieure fine, palette de commandes Cmd+K, bascule de thème, avatar et rôle.
- **Liste dense** : tableau à colonnes triables, réordonnables, masquables ; cellules
  éditables en place (double-clic, Tab, Échap) ; sélection multiple ; puces de filtres ;
  bascule liste / kanban / calendrier / timeline ; pagination ou défilement.
- **Kanban** : colonnes = étapes avec compteur et total en euros, cartes compactes, glisser-
  déposer, état vide de colonne.
- **Fiche** (page d'un objet) : en-tête avec titre, statut et actions ; trois colonnes ;
  onglets ; fil d'activité chronologique avec filtres par type (note, email, appel, tâche,
  changement) ; zone de saisie rapide d'une note ou d'une tâche.
- **Timeline de staffing** : une ligne par consultant, une barre par mission, échelle de temps
  semaines / mois, aujourd'hui marqué, barres colorées par état (en cours, à démarrer,
  renouvellement à traiter), ligne signalée pour un salarié sans mission.
- **Calendrier** : mois et semaine, événements de plusieurs types (tâche, entretien,
  échéance de facture, fin de mission).
- **Tableau de bord** : tuiles de chiffres clés (pipeline pondéré, facturé, en retard,
  occupation), listes courtes « à traiter cette semaine », graphiques simples (barres, anneau)
  dans la même palette.
- **Formulaires** : création rapide en modale (Cmd+Shift+N) et panneau latéral (Sheet) pour
  l'édition longue ; champs date, montant en euros, sélecteur d'objet lié avec recherche,
  liste à choix multiples (modules Workday), pièce jointe.
- **Signalement** : badges de statut (une teinte par famille de statut, pas une par valeur),
  bannière d'alerte discrète sur une fiche (facture échue, contrat qui expire), toasts,
  états vides avec action, squelettes de chargement.
- **Documents** : gabarit imprimable A4 pour la facture et le contrat (en-tête du cabinet,
  tableau de lignes, totaux HT / TVA / TTC, mentions légales en pied), en niveaux de gris
  compatibles PDF.
- **Email** : gabarit d'email transactionnel sobre (relance de facture, rappel de CRA) avec
  la même typographie, lisible sans images.

### 3. Trois ou quatre écrans-types

Assemble les briques sur : **la liste des opportunités** (liste dense avec filtres, et la même
en kanban), **la fiche d'une mission** (trois colonnes, fil d'activité, bannière de fin de
mission proche), **la timeline de staffing**, et **le tableau de bord**. Chaque écran en clair
et en sombre. Montre aussi la palette Cmd+K ouverte sur l'un d'eux.

### 4. Les contraintes qui se voient

- Ordinateur d'abord ; sur téléphone, la coque se replie et la fiche passe en une colonne avec le
  fil d'activité en onglet. Les vues lourdes (timeline, kanban) restent réservées à l'ordinateur.
- Densité : une ligne de tableau fait 36 px au plus ; les marges sont serrées ; l'écran de
  liste montre au moins 20 lignes sur un portable 13 pouces.
- Accessibilité : focus clavier visible partout, contraste AA, aucune information portée par
  la couleur seule.
- Tout texte en français ; les montants en euros au format « 12 500,00 € » ; les dates au format
  « 4 sept. 2026 ».

Livre : le fichier de tokens, la description des composants avec leurs variantes et états, et
les écrans-types. Pas de liste exhaustive d'écrans : le système doit permettre d'en composer de
nouveaux sans revenir vers toi.
