#!/usr/bin/env python3
"""Ce qu'a coûté une boucle d'agents : durée, attente, échanges, jetons, appels navigateur, par agent.

Usage :
  python3 .claude/tools/cout-agents/cout-agents.py [dossier du projet] [--detail] [--seuils]

Lit les transcripts de sous-agents dans ~/.claude/projects/*/*/subagents/*.jsonl et garde ceux
dont le `cwd` est le projet ou l'un de ses worktrees (`<projet>-<n>`). La session principale
peut donc avoir été lancée depuis n'importe quel dossier.
L'agent est déduit du nom du fichier : agent-a<agent>-<suite>.jsonl (aprod, atest, averif…).

Trois durées par agent :
  horloge  du premier au dernier événement ;
  actif    somme des intervalles de moins de 90 s entre deux événements ;
  attente  somme des intervalles de plus de 90 s — une permission qui attend un humain, une
           commande longue, un agent laissé en veille après son rapport.
Une attente de plus de 5 min est toujours listée avec ce qui la précède. Deux cas, distingués :
  bloqué   le dernier événement avant le trou est une commande : l'agent attendait son résultat
           ou une permission ;
  veille   le dernier événement est un texte (son rapport) : l'agent avait fini et attendait
           qu'on le relance. Rien de perdu, sauf si le lead le relance tard.
"""
import json, os, sys, re, datetime, collections

TROU = 90        # secondes : au-delà, l'agent n'est pas en train de travailler
ATTENTE_MIN = 5  # minutes : au-delà, l'attente est nommée avec sa commande

# Seuils par agent : médiane observée x 2, arrondi. Recalibrés le 09/09 sur les neuf
# livraisons de crm-workday (application avec serveur, base et tests de bout en bout) ; les
# seuils du 31/08 venaient d'une page statique et le testeur les dépassait à chaque passe.
# Les minutes sont du temps actif. Un dépassement n'est pas une faute : c'est un agent à regarder.
SEUILS = {
    "prod":  {"requetes": 450, "jetons_relus_M": 70, "minutes": 90},
    "test":  {"requetes": 160, "jetons_relus_M": 10, "minutes": 25},
    "verif": {"requetes": 120, "jetons_relus_M":  8, "minutes": 15},
    "fix":   {"requetes": 250, "jetons_relus_M": 30, "minutes": 50},
    "audit": {"requetes": 120, "jetons_relus_M":  8, "minutes": 15},
}
# Les fiches actuelles s'appellent producteur, verifier, testeur, correcteur ; les seuils gardent
# les clés courtes des premiers essais (prod, verif, test, fix).
ALIAS = {"retest": "test", "testeur": "test", "retesteur": "test", "producteur": "prod",
         "tdd": "prod", "verifier": "verif", "correcteur": "fix"}

def ts(v):
    try: return datetime.datetime.fromisoformat(v.replace("Z", "+00:00"))
    except Exception: return None

def commande(item):
    """Ce qu'un tool_use a lancé, en une ligne courte."""
    inp = item.get("input") or {}
    for k in ("command", "description", "file_path", "pattern", "url"):
        if inp.get(k): return f"{item.get('name')} {str(inp[k])[:90]}"
    return item.get("name") or "?"

def lire(chemin):
    r = dict(actif=0.0, attente=0.0, veille=0.0, horloge=0.0, requetes=0, ecrits=0, relus=0, sortis=0,
             navigateur=0, captures=0, trou=0.0, trou_apres="", trou_a=None, trou_veille=False, cwd="")
    prev = None; premier = None; derniere_commande = ""; dernier_est_texte = False
    ids = set()
    for ligne in open(chemin, errors="replace"):
        try: d = json.loads(ligne)
        except Exception: continue
        if not r["cwd"] and d.get("cwd"): r["cwd"] = d["cwd"]
        t = ts(d.get("timestamp", ""))
        if t:
            if premier is None: premier = t
            if prev:
                dt = (t - prev).total_seconds()
                if dt <= TROU: r["actif"] += dt
                else:
                    r["attente"] += dt
                    if dernier_est_texte: r["veille"] += dt
                    if dt > r["trou"]:
                        r["trou"] = dt; r["trou_apres"] = derniere_commande; r["trou_a"] = prev
                        r["trou_veille"] = dernier_est_texte
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
        if d.get("type") == "assistant":
            # un tour qui finit sur du texte sans appel d'outil : l'agent a rendu, il attend
            dernier_est_texte = not any(isinstance(it, dict) and it.get("type") == "tool_use" for it in c)
        for it in c:
            if not isinstance(it, dict): continue
            if it.get("type") == "tool_use":
                derniere_commande = commande(it)
                if "claude-in-chrome" in it.get("name", ""):
                    r["navigateur"] += 1; ids.add(it.get("id"))
            elif it.get("type") == "tool_result" and it.get("tool_use_id") in ids:
                corps = it.get("content")
                for x in (corps if isinstance(corps, list) else [corps]):
                    if isinstance(x, dict) and x.get("type") == "image": r["captures"] += 1
    if premier and prev: r["horloge"] = (prev - premier).total_seconds() / 60
    r["actif"] /= 60; r["attente"] /= 60; r["veille"] /= 60; r["trou"] /= 60
    return r

def cwd_de(chemin):
    """Le dossier de travail écrit dans la première ligne qui en porte un."""
    with open(chemin, errors="replace") as f:
        for i, ligne in enumerate(f):
            if i > 20: break
            try: d = json.loads(ligne)
            except Exception: continue
            if d.get("cwd"): return d["cwd"]
    return ""

def du_projet(cwd, projet):
    """Le projet lui-même, un sous-dossier, ou un worktree frère `<projet>-<n>` / `<projet>-a`."""
    return cwd == projet or cwd.startswith(projet + "/") or re.match(re.escape(projet) + r"-[A-Za-z0-9]+(/|$)", cwd) is not None

def transcripts(projet):
    base = os.path.expanduser("~/.claude/projects")
    slug = projet.replace("/", "-")
    fichiers = []
    for racine, _, noms in os.walk(base):
        if os.path.basename(racine) != "subagents": continue
        dossier_projet = os.path.relpath(racine, base).split(os.sep)[0]
        for n in noms:
            if not n.endswith(".jsonl"): continue
            f = os.path.join(racine, n)
            cwd = cwd_de(f)
            if (cwd and du_projet(cwd, projet)) or (not cwd and dossier_projet == slug):
                fichiers.append(f)
    return fichiers

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    detail = "--detail" in sys.argv
    seuils = "--seuils" in sys.argv
    projet = os.path.abspath(args[0]) if args else os.getcwd()

    fichiers = transcripts(projet)
    if not fichiers:
        print(f"Aucun transcript de sous-agent pour {projet}\n"
              f"(cherché dans ~/.claude/projects/*/*/subagents/, par le cwd des transcripts)"); return 1

    par_agent = collections.defaultdict(list)
    for f in fichiers:
        m = re.match(r"agent-a([a-z]+?)-", os.path.basename(f))
        agent = m.group(1) if m else "autre"
        agent = ALIAS.get(agent, agent)
        r = lire(f); r["fichier"] = os.path.basename(f); par_agent[agent].append(r)

    print(f"\nCoût des sous-agents — {os.path.basename(projet)}  ({len(fichiers)} agents)\n")
    print(f"{'agent':10} {'n':>3} {'horloge':>8} {'actif':>6} {'attente':>8} {'échanges':>9} "
          f"{'écrits M':>9} {'relus M':>8} {'navig':>6} {'captures':>9}")
    tot = collections.Counter()
    for agent in sorted(par_agent, key=lambda p: -sum(x["relus"] for x in par_agent[p])):
        L = par_agent[agent]; n = len(L)
        moy = lambda k: sum(x[k] for x in L) / n
        print(f"{agent:10} {n:3} {moy('horloge'):8.1f} {moy('actif'):6.1f} {moy('attente'):8.1f} "
              f"{moy('requetes'):9.0f} {moy('ecrits')/1e6:9.2f} {moy('relus')/1e6:8.1f} "
              f"{moy('navigateur'):6.0f} {moy('captures'):9.1f}")
        for k in ("actif", "attente", "requetes", "ecrits", "relus", "sortis", "navigateur"):
            tot[k] += sum(x[k] for x in L)
    for k in ("veille",):
        tot[k] = sum(x[k] for L in par_agent.values() for x in L)
    bloque = tot['attente'] - tot['veille']
    print(f"\nTotal : {tot['actif']/60:.1f} h de travail d'agents, {bloque/60:.1f} h bloqué sur une commande, "
          f"{tot['veille']/60:.1f} h de veille après rapport, "
          f"{tot['requetes']} échanges, {tot['ecrits']/1e6:.1f} M jetons écrits, {tot['relus']/1e6:.0f} M relus.")

    attentes = [x for L in par_agent.values() for x in L if x["attente"] > ATTENTE_MIN]
    print(f"\nAttentes de plus de {ATTENTE_MIN} min :")
    if not attentes: print("  aucune")
    for x in sorted(attentes, key=lambda y: -(y["attente"] - y["veille"])):
        quand = x["trou_a"].astimezone().strftime("%d/%m %H:%M") if x["trou_a"] else "?"
        b = x["attente"] - x["veille"]
        if x["trou_veille"]:
            cause = f"VEILLE après son rapport, relancé {x['trou']:.0f} min plus tard"
        else:
            cause = f"BLOQUÉ {x['trou']:.0f} min après : {x['trou_apres'] or '(aucune commande)'}"
        print(f"  {x['fichier'][:44]:44} bloqué {b:4.0f} min, veille {x['veille']:4.0f} min — {cause} (à {quand})")

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
                if x["actif"] > s["minutes"]: d.append(f"{x['actif']:.0f} min actives > {s['minutes']}")
                if d:
                    rien = False
                    print(f"  {x['fichier'][:44]:44} {', '.join(d)}")
        if rien: print("  aucun")

    if detail:
        print("\nDétail par agent :")
        for agent, L in sorted(par_agent.items()):
            for x in sorted(L, key=lambda y: -y["relus"]):
                print(f"  {agent:7} {x['fichier'][:40]:40} {x['horloge']:6.1f} horl. {x['actif']:5.1f} actif "
                      f"{x['attente']:5.1f} att. {x['requetes']:4} éch. {x['relus']/1e6:5.1f} M relus "
                      f"{x['navigateur']:4} navig.")
    return 0

sys.exit(main())
