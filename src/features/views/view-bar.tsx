"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import "@/features/objects/manifest";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_VIEW, listStateToParams, type ListState } from "@/features/lists/url-state";
import { getList } from "@/features/objects/registry";
import type { PinnedViewEntry } from "@/features/views/pinned";
import type { ViewSummary } from "@/features/views/views";

/** `list` : la clé de la liste (celle d'un objet, ou une liste déclarée) sous laquelle ses vues se rangent. */
type Props = { list: string; state: ListState; views: readonly ViewSummary[]; pinned: readonly PinnedViewEntry[] };

/** Adresse d'une vue : la liste ouverte sur elle, et rien d'autre — c'est ce qu'on partage. */
function viewUrl(list: string, view: ViewSummary): string {
  const { href } = getList(list);
  return view.id === DEFAULT_VIEW ? href : `${href}?vue=${encodeURIComponent(view.id)}`;
}

const ACTION_FAILED = "L'action a échoué. Réessayez.";

/**
 * Appel d'une API des vues : une réponse en erreur devient le message que la barre affiche, et
 * une coupure du réseau aussi — un appel qui n'aboutit pas se dit, jamais ne s'avale.
 */
async function callViews(path: string, init: { method: string; body?: unknown }): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  try {
    const res = await fetch(path, {
      method: init.method,
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return res.ok ? { ok: true, body } : { ok: false, message: body?.message ?? ACTION_FAILED };
  } catch {
    return { ok: false, message: ACTION_FAILED };
  }
}

/**
 * Barre des vues d'une liste (contrat 24) : la vue courante et son menu — la vue par défaut de
 * l'objet, puis les vues de l'équipe —, l'épingle de chacune dans sa propre barre latérale, et
 * l'enregistrement de l'état affiché sous un nom. Une vue choisie s'ouvre par son adresse
 * (`?vue=…`), donc elle se partage et se rouvre au même état (D18).
 */
export function ViewBar({ list, state, views, pinned }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = views.find((view) => view.id === state.view) ?? views[0];
  const pinnedIds = pinned.map((view) => view.id);

  /** L'écran ne suit l'épingle qu'après la réponse du serveur : un échec laisse la barre latérale telle qu'enregistrée. */
  async function write(path: string, init: { method: string; body?: unknown }) {
    setError(null);
    const outcome = await callViews(path, init);
    if (!outcome.ok) return setError(outcome.message);
    router.refresh();
  }

  const togglePin = (view: ViewSummary) =>
    pinnedIds.includes(view.id) ? write(`/api/vues-epinglees/${encodeURIComponent(view.id)}`, { method: "DELETE" }) : write("/api/vues-epinglees", { method: "POST", body: { viewId: view.id } });

  /** État affiché, tel qu'une vue le range : la vue courante n'y figure pas, une vue ne pointe pas une vue. */
  const displayedQuery = () => listStateToParams(list, { ...state, view: null }, { absolute: true }).toString();

  /** Suppression confirmée : la vue quitte la liste des vues et les barres latérales de chacun, l'écran revient à la vue par défaut. */
  async function remove() {
    setError(null);
    const outcome = await callViews(`/api/vues/${encodeURIComponent(current.id)}`, { method: "DELETE" });
    if (!outcome.ok) return setError(outcome.message);
    setRemoving(false);
    router.push(getList(list).href);
  }

  /** Monte ou descend une vue dans la barre latérale : l'ordre est choisi, donc enregistré. */
  function movePin(view: ViewSummary, step: number) {
    const from = pinnedIds.indexOf(view.id);
    const viewIds = pinnedIds.filter((id) => id !== view.id);
    viewIds.splice(from + step, 0, view.id);
    return write("/api/vues-epinglees", { method: "PATCH", body: { viewIds } });
  }

  return (
    <div data-slot="view-bar" className="flex flex-wrap items-center gap-2">
      <Popover>
        {/* Un nom de vue est libre et long : le déclencheur le borne et le tronque, comme la barre latérale. */}
        <PopoverTrigger render={<Button variant="outline" size="sm" className="max-w-64" title={`Vue : ${current.name}`} />}>
          <span data-slot="view-name" className="min-w-0 truncate">{`Vue : ${current.name}`}</span>
          <ChevronDownIcon aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 max-w-[calc(100vw-1.5rem)]">
          <ul data-slot="view-menu" className="grid gap-1">
            {views.map((view) => {
              const position = pinnedIds.indexOf(view.id);
              const isCurrent = view.id === current.id;
              return (
                <li key={view.id} className="flex h-7 min-w-0 items-center gap-1">
                  {/* La vue courante se voit : sans cette marque, la case d'épinglage est la seule du menu et se lit pour elle. */}
                  {isCurrent ? <CheckIcon data-slot="view-current" className="size-3.5 shrink-0 text-primary" aria-hidden /> : <span className="size-3.5 shrink-0" aria-hidden />}
                  <Link
                    href={viewUrl(list, view)}
                    aria-current={isCurrent ? "page" : undefined}
                    className="min-w-0 flex-1 truncate rounded-sm px-1 text-sm hover:underline aria-[current]:font-medium"
                    title={view.name}
                  >
                    {view.name}
                  </Link>
                  {/* La vue par défaut est déjà dans la barre latérale, sous son objet : elle ne s'épingle pas. */}
                  {view.id !== DEFAULT_VIEW && <Checkbox aria-label={`Épingler ${view.name}`} title={`Épingler ${view.name}`} checked={position >= 0} onCheckedChange={() => void togglePin(view)} />}
                  {position >= 0 && (
                    <>
                      <Button variant="ghost" size="icon-xs" aria-label={`Monter la vue ${view.name}`} title={`Monter la vue ${view.name}`} disabled={position === 0} onClick={() => void movePin(view, -1)}>
                        <ArrowUpIcon aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={`Descendre la vue ${view.name}`} title={`Descendre la vue ${view.name}`} disabled={position === pinnedIds.length - 1} onClick={() => void movePin(view, 1)}>
                        <ArrowDownIcon aria-hidden />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>

      <Popover open={saving} onOpenChange={setSaving}>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>Enregistrer la vue</PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          {saving && (
            <ViewForm
              initialName=""
              submitLabel="Enregistrer"
              onSave={async (name) => {
                const outcome = await callViews("/api/vues", { method: "POST", body: { objectType: list, name, query: displayedQuery() } });
                if (!outcome.ok) return outcome;
                setSaving(false);
                router.push(`${getList(list).href}?vue=${encodeURIComponent((outcome.body as { id: string }).id)}`);
                return outcome;
              }}
            />
          )}
        </PopoverContent>
      </Popover>

      {/* La vue par défaut d'un objet ne se renomme ni ne se supprime (contrat 26) : ses boutons ne s'affichent pas. */}
      {current.id !== DEFAULT_VIEW && (
        <>
          <Popover open={editing} onOpenChange={setEditing}>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>Modifier la vue</PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              {editing && (
                <ViewForm
                  initialName={current.name}
                  submitLabel="Enregistrer les changements"
                  onSave={async (name) => {
                    const outcome = await callViews(`/api/vues/${encodeURIComponent(current.id)}`, { method: "PATCH", body: { name, query: displayedQuery() } });
                    if (!outcome.ok) return outcome;
                    setEditing(false);
                    router.refresh();
                    return outcome;
                  }}
                />
              )}
            </PopoverContent>
          </Popover>

          <Dialog open={removing} onOpenChange={setRemoving}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>Supprimer la vue</DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{`Supprimer la vue « ${current.name} » ?`}</DialogTitle>
                <DialogDescription>{"Elle quitte la liste des vues et la barre latérale de chacun. Les fiches, elles, ne bougent pas."}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setRemoving(false)}>
                  Annuler
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void remove()}>
                  Supprimer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Nom d'une vue : celui qu'on lui donne en l'enregistrant, celui qu'on lui rend en la modifiant.
 * Dans les deux cas l'état affiché — filtres, tri, colonnes — part avec, et l'écran ne suit qu'après
 * la réponse du serveur : un refus (nom déjà pris) reste sous le champ.
 */
function ViewForm({ initialName, submitLabel, onSave }: { initialName: string; submitLabel: string; onSave: (name: string) => Promise<{ ok: boolean; message?: string }> }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await onSave(name);
    setBusy(false);
    if (!outcome.ok) setError(outcome.message ?? "L'action a échoué. Réessayez.");
  }

  return (
    <form data-slot="view-form" className="grid gap-2" onSubmit={submit}>
      <label className="grid gap-1 text-xs font-medium">
        Nom de la vue
        <Input className="h-7" aria-label="Nom de la vue" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <p className="text-2xs text-muted-foreground">{"Les filtres, le tri et les colonnes affichés sont enregistrés, pour toute l'équipe."}</p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {/* Le seul bouton plein de l'écran est la création (fondations) : l'enregistrement est secondaire. */}
      <Button type="submit" variant="secondary" size="sm" disabled={busy || name.trim() === ""}>
        {submitLabel}
      </Button>
    </form>
  );
}
