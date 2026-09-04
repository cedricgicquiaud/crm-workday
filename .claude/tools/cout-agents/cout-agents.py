#!/usr/bin/env python3
"""Ce qu'a coûté une boucle d'agents : durée, échanges, jetons, appels navigateur, par agent.

Usage :
  python3 .claude/tools/cout-agents/cout-agents.py [dossier du projet] [--detail] [--seuils]

Lit les transcripts de sous-agents de ~/.claude/projects/<projet>/*/subagents/*.jsonl.
L'agent est déduit du nom du fichier : agent-a<agent>-<suite>.jsonl (aprod, atest, averif…).
"""
import json, os, sys, re, datetime, collections

# Seuils par agent, tirés des mesures du 31/08 (médiane observée x 2, arrondi).
# Un dépassement n'est pas une faute : c'est un agent à regarder.
SEUILS = {
    "prod":  {"requetes": 140, "jetons_relus_M": 12, "minutes": 25},
    "test":  {"requetes":  40, "jetons_relus_M":  3, "minutes": 10},
    "verif": {"requetes":  45, "jetons_relus_M":  2, "minutes":  8},
    "fix":   {"requetes":  60, "jetons_relus_M":  3, "minutes": 12},
    "audit": {"requetes":  45, "jetons_relus_M":  2, "minutes":  8},
}

def ts(v):
    try: return datetime.datetime.fromisoformat(v.replace("Z", "+00:00"))
    except Exception: return None

def lire(chemin):
    r = dict(actif=0.0, requetes=0, ecrits=0, relus=0, sortis=0, navigateur=0, captures=0)
    prev = None
    ids = set()
    for ligne in open(chemin, errors="replace"):
        try: d = json.loads(ligne)
        except Exception: continue
        t = ts(d.get("timestamp", ""))
        if t:
            if prev and (t - prev).total_seconds() <= 90:
                r["actif"] += (t - prev).total_seconds()
            prev = t
        m = d.get("message") or {}
        u = m.get("usage") or {}
        if u:
            r["requetes"] += 1
            r["ecrits"] += (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0)
            r["relus"] += u.get("cache_read_input_tokens") or 0
            r["sortis"] += u.get("output_tokens") or 0
        c = m.get("content")
        if not isinstance(c, list): continue
        for it in c:
            if not isinstance(it, dict): continue
            if it.get("type") == "tool_use" and "claude-in-chrome" in it.get("name", ""):
                r["navigateur"] += 1; ids.add(it.get("id"))
            elif it.get("type") == "tool_result" and it.get("tool_use_id") in ids:
                corps = it.get("content")
                for x in (corps if isinstance(corps, list) else [corps]):
                    if isinstance(x, dict) and x.get("type") == "image": r["captures"] += 1
    r["actif"] /= 60
    return r

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    detail = "--detail" in sys.argv
    seuils = "--seuils" in sys.argv
    projet = os.path.abspath(args[0]) if args else os.getcwd()
    slug = projet.replace("/", "-")
    base = os.path.expanduser(f"~/.claude/projects/{slug}")
    if not os.path.isdir(base):
        print(f"Aucun transcript pour {projet}\n(cherché dans {base})"); return 1

    fichiers = []
    for racine, _, noms in os.walk(base):
        if os.path.basename(racine) != "subagents": continue
        fichiers += [os.path.join(racine, n) for n in noms if n.endswith(".jsonl")]
    if not fichiers:
        print(f"Aucun sous-agent dans {base}"); return 1

    par_agent = collections.defaultdict(list)
    for f in fichiers:
        m = re.match(r"agent-a([a-z]+?)-", os.path.basename(f))
        agent = m.group(1) if m else "autre"
        agent = {"retest": "test", "testeur": "test"}.get(agent, agent)
        r = lire(f); r["fichier"] = os.path.basename(f); par_agent[agent].append(r)

    print(f"\nCoût des sous-agents — {os.path.basename(projet)}  ({len(fichiers)} agents)\n")
    print(f"{'agent':10} {'n':>3} {'min':>6} {'échanges':>9} {'écrits M':>9} {'relus M':>8} {'navig':>6} {'captures':>9}")
    tot = collections.Counter()
    for agent in sorted(par_agent, key=lambda p: -sum(x["relus"] for x in par_agent[p])):
        L = par_agent[agent]; n = len(L)
        moy = lambda k: sum(x[k] for x in L) / n
        print(f"{agent:10} {n:3} {moy('actif'):6.1f} {moy('requetes'):9.0f} "
              f"{moy('ecrits')/1e6:9.2f} {moy('relus')/1e6:8.1f} {moy('navigateur'):6.0f} {moy('captures'):9.1f}")
        for k in ("actif", "requetes", "ecrits", "relus", "sortis", "navigateur"):
            tot[k] += sum(x[k] for x in L)
    print(f"\nTotal : {tot['actif']/60:.1f} h de travail d'agents, {tot['requetes']} échanges, "
          f"{tot['ecrits']/1e6:.1f} M jetons écrits, {tot['relus']/1e6:.0f} M relus.")

    if seuils:
        print("\nAu-dessus des seuils (agents à regarder) :")
        rien = True
        for agent, L in par_agent.items():
            s = SEUILS.get(agent)
            if not s: continue
            for x in L:
                d = []
                if x["requetes"] > s["requetes"]: d.append(f"{x['requetes']} échanges > {s['requetes']}")
                if x["relus"] / 1e6 > s["jetons_relus_M"]: d.append(f"{x['relus']/1e6:.0f} M relus > {s['jetons_relus_M']}")
                if x["actif"] > s["minutes"]: d.append(f"{x['actif']:.0f} min > {s['minutes']}")
                if d:
                    rien = False
                    print(f"  {x['fichier'][:44]:44} {', '.join(d)}")
        if rien: print("  aucun")

    if detail:
        print("\nDétail par agent :")
        for agent, L in sorted(par_agent.items()):
            for x in sorted(L, key=lambda y: -y["relus"]):
                print(f"  {agent:7} {x['fichier'][:40]:40} {x['actif']:5.1f} min "
                      f"{x['requetes']:4} éch. {x['relus']/1e6:5.1f} M relus {x['navigateur']:4} navig.")
    return 0

sys.exit(main())
