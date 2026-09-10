#!/bin/sh
# Hook SubagentStart : ouvre un panneau cmux qui suit les grandes étapes de l'agent qui démarre.
# Reçoit sur l'entrée standard le JSON du hook (session_id, transcript_path, cwd, agent_id,
# agent_type). Sans cmux, ne fait rien. Ne bloque jamais l'agent : sort toujours en 0.
#
# Disposition : le premier panneau s'ouvre à droite de la session ; les suivants s'ouvrent sous
# le dernier panneau d'agent, pour former une colonne. Le panneau porte le nom de l'agent en
# titre, et son flux s'affiche dans la couleur de sa fiche (`color:`).
command -v cmux >/dev/null 2>&1 || exit 0
[ -n "$CMUX_WORKSPACE_ID" ] || exit 0
j=$(cat)
lire() { printf '%s' "$j" | python3 -c "import json,sys; print(json.load(sys.stdin).get('$1',''))" 2>/dev/null; }
session=$(lire session_id); transcript=$(lire transcript_path); agent=$(lire agent_id); cwd=$(lire cwd); type=$(lire agent_type)
[ -n "$session" ] && [ -n "$transcript" ] && [ -n "$agent" ] || exit 0
[ -n "$PILOT_PANNEAU_TRACE" ] && printf '%s %s %s %s\n' "$(date +%T)" "$session" "$agent" "$type" >> "$PILOT_PANNEAU_TRACE"
journal="$(dirname "$transcript")/$session/subagents/agent-$agent.jsonl"
outil="$cwd/.claude/tools/cout-agents/cout-agents.py"
[ -f "$outil" ] || outil="$(dirname "$0")/cout-agents.py"
couleur=$(sed -n 's/^color: *//p' "$cwd/.claude/agents/$type.md" 2>/dev/null | head -1)

# le dernier panneau d'agent ouvert dans cet espace de travail, s'il vit encore
etat="${TMPDIR:-/tmp}/pilot-panneau-$(printf '%s' "$CMUX_WORKSPACE_ID" | tr -c 'A-Za-z0-9' '_')"
# un verrou : deux agents lancés dans le même message arrivent ici en même temps
verrou="$etat.verrou"; n=0
until mkdir "$verrou" 2>/dev/null; do n=$((n+1)); [ $n -ge 50 ] && break; sleep 0.2; done
trap 'rmdir "$verrou" 2>/dev/null' EXIT
dernier=$(cat "$etat" 2>/dev/null)
ref=""
# cmux ignore en silence un --surface qui n'existe plus : vérifier que le dernier panneau vit encore
if [ -n "$dernier" ] && cmux list-panes --json 2>/dev/null | grep -q "\"$dernier\""; then
  ref=$(cmux new-split down --surface "$dernier" --focus false 2>/dev/null | grep -oE 'surface:[0-9]+' | head -1)
fi
if [ -z "$ref" ]; then
  ref=$(cmux new-split right --surface "${CMUX_SURFACE_ID:-}" --focus false 2>/dev/null | grep -oE 'surface:[0-9]+' | head -1)
  # la colonne des agents prend un quart de la largeur : on pousse le bord droit du panneau
  # de la session (un panneau ne se redimensionne que par un bord qui touche un voisin)
  # CMUX_SURFACE_ID est l'identifiant long ; la liste donne les deux formes avec --id-format both
  [ -n "$ref" ] && sleep 0.3 && cmux list-panes --json --id-format both 2>/dev/null | python3 -c "
import json, sys, subprocess
d = json.load(sys.stdin); large = d['container_frame']['width']
moi = '${CMUX_SURFACE_ID:-}'.lower()
for p in d['panes']:
    ids = ' '.join(str(v) for v in p.values()).lower()
    if moi and moi in ids:
        delta = int(large * 3 / 4 - p['pixel_frame']['width'])
        if delta > 0: subprocess.run(['cmux', 'resize-pane', '--pane', p['ref'], '-R', '--amount', str(delta)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
" 2>/dev/null
fi
[ -n "$ref" ] || exit 0
printf '%s' "$ref" > "$etat"
cmux send --surface "$ref" "clear; python3 '$outil' --journal '$journal' --couleur '$couleur'; exit\n" >/dev/null 2>&1
exit 0
