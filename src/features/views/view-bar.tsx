"use client";

import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import "@/features/objects/manifest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_VIEW, listStateToParams, type ListState } from "@/features/lists/url-state";
import { getObject } from "@/features/objects/registry";
import type { ViewSummary } from "@/features/views/views";

type Props = { type: string; state: ListState; views: readonly ViewSummary[] };

/** Adresse d'une vue : la liste ouverte sur elle, et rien d'autre — c'est ce qu'on partage. */
function viewUrl(type: string, view: ViewSummary): string {
  const { listHref } = getObject(type);
  return view.id === DEFAULT_VIEW ? listHref : `${listHref}?vue=${encodeURIComponent(view.id)}`;
}

/** Appel d'une API des vues : une réponse en erreur devient le message que la barre affiche. */
async function callViews(path: string, init: { method: string; body?: unknown }): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const res = await fetch(path, {
    method: init.method,
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return res.ok ? { ok: true, body } : { ok: false, message: body?.message ?? "L'action a échoué. Réessayez." };
}

/**
 * Barre des vues d'une liste (contrat 24) : la vue courante et son menu — la vue par défaut de
 * l'objet, puis les vues de l'équipe —, et l'enregistrement de l'état affiché sous un nom. Une vue
 * choisie s'ouvre par son adresse (`?vue=…`), donc elle se partage et se rouvre au même état (D18).
 */
export function ViewBar({ type, state, views }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const current = views.find((view) => view.id === state.view) ?? views[0];

  return (
    <div data-slot="view-bar" className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          {`Vue : ${current.name}`}
          <ChevronDownIcon aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <ul data-slot="view-menu" className="grid gap-1">
            {views.map((view) => (
              <li key={view.id} className="flex h-7 items-center gap-1">
                <Link
                  href={viewUrl(type, view)}
                  aria-current={view.id === current.id ? "true" : undefined}
                  className="min-w-0 flex-1 truncate rounded-sm px-1 text-sm hover:underline aria-[current]:font-medium"
                  title={view.name}
                >
                  {view.name}
                </Link>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      <Popover open={saving} onOpenChange={setSaving}>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>Enregistrer la vue</PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          {saving && <SaveViewForm type={type} state={state} onSaved={(id) => { setSaving(false); router.push(`${getObject(type).listHref}?vue=${encodeURIComponent(id)}`); }} />}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Enregistrement de l'état affiché — filtres, tri, colonnes — sous un nom. L'écran ne suit la
 * nouvelle vue qu'après la réponse du serveur : un refus (nom déjà pris) reste sous le champ.
 */
function SaveViewForm({ type, state, onSaved }: { type: string; state: ListState; onSaved: (id: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const query = listStateToParams(type, { ...state, view: null }).toString();
    const outcome = await callViews("/api/vues", { method: "POST", body: { objectType: type, name, query } });
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    onSaved((outcome.body as { id: string }).id);
  }

  return (
    <form data-slot="view-form" className="grid gap-2" onSubmit={save}>
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
        Enregistrer
      </Button>
    </form>
  );
}
