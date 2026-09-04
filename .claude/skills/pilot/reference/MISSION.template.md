# MISSION — <CODE Linear> <titre de la livraison>

_Ordre de mission d'une livraison. Copier en `MISSION.md` à la racine du worktree (fichier_
_exclu de git via `.git/info/exclude`)._

_Ce fichier ne porte que **ce qui change d'une livraison à l'autre**. La façon de travailler —_
_ordre des commits, périmètre, « tu ne tranches pas », `UAT.md`, PR, stop, format du rapport —_
_vit dans la fiche de l'agent (`.claude/agents/tdd-writer.md`), qui s'applique dans les deux_
_modes de lancement._

## Ta mission

- Feature Linear : **<nom de la feature>** — livraison <n>/<total> « <titre> »
- Tâches : <CODE>-a, <CODE>-b, <CODE>-c
- Branche : `feature/<CODE>-<n>-<slug>` (déjà créée, tu es dessus)
- Titre de ta PR : `<CODE>-<n> <titre de la livraison>`

## Fichiers que tu modifies

- `<fichier ou dossier 1>`
- `<fichier ou dossier 2>`
- `tests/<fichier>.test.js`
- `UAT.md` (section de cette livraison seulement)

## Décisions produit déjà prises

_Recopiées de la fiche feature. Elles sont tranchées : tu les appliques, tu ne les rediscutes pas._

- <décision 1, une ligne>
- <décision 2>

## Contrat de validation — ce que ta livraison doit rendre vrai

_Les phrases du contrat de la feature affectées à cette livraison, avec leur numéro d'origine._
_En toutes lettres : le numéro seul ne dit pas ce qu'il faut prouver._

4. <phrase du contrat>
5. <phrase du contrat>
6. <refus : ce qui doit rester impossible>

## Idiomes de ce projet

_Les règles du `CLAUDE.md` qui concernent les fichiers ci-dessus. Relis ton diff contre elles_
_avant de pousser._

- <idiome 1>
- <idiome 2>

## Commande de tests

`<npm test | node --test tests/*.test.js | pytest>`
