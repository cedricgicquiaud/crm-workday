# Barème de charge

Source : AlanZien/SLICE, weme-studio/Nexus — 344 PR mergées.

## Paramètres (utilisés par `roadmap` et `sync`)

```yaml
# heures de session par feature, selon sa taille
feature_hours_S: 0.22
feature_hours_M: 2.1   # recalibré sync 2026-09-07 : médiane 1.05 h (1.2a 0.75, 2.1b 1.0, 1.2b 1.1, 1.3 1.4) × 2
feature_hours_L: 3.0   # recalibré sync 2026-09-05 : médiane 1.0 h (1.1 0.6, 1.4 1.4) × 3
feature_hours_XL: 3.27
feature_overhead_hours: 0.5   # validation du découpage + relecture de PR, hypothèse initiale recalibrée par sync
hours_per_active_day: 6.7
days_per_week: observed   # remplacer par un nombre (ex. 2) pour forcer la capacité
```

## Observations

| Taille | Diff (lignes) | Livraisons | Temps médian par livraison (h) | Heures par feature (× facteur) |
|---|---|---|---|---|
| S | 1–150 | 117 | 0.22 | 0.22 (×1) |
| M | 151–600 | 139 | 0.34 | 0.69 (×2) |
| L | 601–2000 | 74 | 0.65 | 1.94 (×3) |
| XL | > 2000 | 14 | 0.65 | 3.27 (×5) |

| Dépôt | PR | Période | Jours actifs | Heures / jour actif | Jours actifs / semaine |
|---|---|---|---|---|---|
| AlanZien/SLICE | 44 | 2026-05-25 → 2026-07-22 | 9 | 6.3 | 1.1 |
| weme-studio/Nexus | 300 | 2026-06-10 → 2026-08-19 | 45 | 7.1 | 4.5 |

## Comment lire

- Avec Claude Code, une PR est mergée en quelques minutes : le temps d'attente humaine ne
  mesure rien. Ce qui compte est le **temps de session** par livraison et le **nombre de
  jours** où l'humain travaille sur le projet.
- Temps par livraison = intervalle entre deux merges d'une même session (< 4 h).
- Heures par feature = temps par livraison × facteur (S=1, M=2, L=3, XL=5), car une
  feature regroupe plusieurs tâches et des validations. Point de départ, recalibré par `sync`.
- Fenêtre d'une feature = heures cumulées ÷ heures par jour actif ÷ jours actifs par semaine.

## Historique des features (rempli par `next` et `sync`)

| Feature | Taille | Tâches | Début | PR ouverte | Mergée | Heures réelles |
|---|---|---|---|---|---|---|
| L'équipe entre dans le CRM — 1.1 Première page en ligne | L | 6 | 2026-09-04 21:05 | 2026-09-04 21:41 | 2026-09-04 22:05 | 0.6 (hors boucle, Claude en session ; + 0.1 correction CI) |
| L'équipe entre dans le CRM — 1.2a Connexion, invitation, réinitialisation | M (réel : L, 2 146 lignes) | 4 | 2026-09-05 00:10 | 2026-09-05 00:40 | 2026-09-05 07:58 | relevé cout-agents : tdd-writer 34 min / 209 échanges, verifier 5 min / 39, testeur 5 min / 58 (2 passes, au-dessus du seuil de 40), correcteur 6 min / 57 ; ≈ 0.85 h d'agents, 0.75 h réel (tuilage verifier ∥ testeur), 0 h d'attente humaine dans la boucle |
| L'équipe entre dans le CRM — 1.2b Gestion des comptes et profil | M (réel : L, 1 336 lignes) | 4 | 2026-09-05 08:05 | 2026-09-05 08:46 | 2026-09-05 09:22 | relevé cout-agents : tdd-writer ≈ 60 min / ~190 échanges, verifier ≈ 6 min / ~50, testeur ≈ 10 min / 55 (2 passes, au-dessus du seuil de 40), correcteur ≈ 12 min / ~75 ; ≈ 1.5 h d'agents, 1.1 h réel, 0 h d'attente humaine dans la boucle |
| L'équipe entre dans le CRM — 1.4 Emails sortants | L (réel : XL, 3 080 lignes) | 5 | 2026-09-05 09:25 | 2026-09-05 10:07 | 2026-09-05 11:59 | relevé cout-agents : tdd-writer 43 min / 183 échanges, verifier 6 min / 39, testeur 9 min / 79 + 7 min / 54 (2 passes, au-dessus du seuil de 40), correcteur 17 min / 103 ; ≈ 1.35 h d'agents, 1.4 h réel (09:25 → 10:50, dont 6 min de vérification manuelle du lead), 0 h d'attente humaine dans la boucle |
| L'équipe entre dans le CRM — 1.3 Coque de navigation | M (réel : L, 1 028 lignes + corrections) | 4 | 2026-09-05 12:05 | 2026-09-05 12:43 | 2026-09-05 14:44 | relevé cout-agents : tdd-writer 39 min / 155 échanges, verifier 7 min / 38, testeur 8 min / 85 (1 passe, au-dessus du seuil de 40), correcteur 30 min / ~110 (2 passes, dont le diagnostic du test rouge en CI) ; ≈ 1.45 h d'agents, 1.4 h réel (12:05 → 13:25), 0 h d'attente humaine dans la boucle |
| Entreprises et contacts — 2.1a Entreprises : fiche, édition, historique | L (réel : XL, 3 503 lignes + corrections) | 4 | 2026-09-05 17:38 | 2026-09-05 19:37 | 2026-09-06 00:03 | relevé cout-agents du 07/09 (temps actif, hors attentes) : tdd-writer 41 min / 188 échanges, verifier 9 min / 63, testeur 8 min / 75 + 7 min / 69 (2 passes, au-dessus du seuil de 40), correcteur 16 min / 107 (9 corrections dont 5 avec test) ; **≈ 1.35 h d'agents**, 6.1 h d'horloge (17:38 → 23:45) dont **4.6 h d'attente de permission** sur trois commandes composées (producteur 73 min après `kill … ; sleep ; curl`, verifier 152 min après `echo … ; git show … \| sort`, correcteur 53 min après `lsof … && kill … ; npm run build`), personne devant l'écran. La ligne écrite le 06/09 (« 6.1 h d'agents, verifier 161 min à relancer les tests ») était une estimation d'horloge présentée comme un relevé : l'outil n'avait pas trouvé les transcriptions. Mesure L retenue pour la médiane : 1.35 h |
| Entreprises et contacts — 2.1b Recherche dans la palette Cmd+K | M (réel : L, 736 lignes) | 3 | 2026-09-07 13:56 | 2026-09-07 14:31 | 2026-09-07 15:48 | relevé cout-agents du 07/09 (temps actif) : tdd-writer 33 min / 205 échanges, verifier 5 min / 31, testeur 10 min / 87 (2 passes, au-dessus du seuil de 40), correcteur 10 min / 60 (4 corrections, 1 avec test) ; ≈ 0.96 h d'agents, 1.0 h réel (13:56 → 14:58, tuilage verifier ∥ testeur), 0 h d'attente de permission, 0 h d'attente humaine dans la boucle |
