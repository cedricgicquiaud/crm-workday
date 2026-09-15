"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import "@/features/objects/manifest";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DuplicateWarning, type DuplicateHint } from "@/features/duplicates/duplicate-warning";
import { FieldControl } from "@/features/objects/field-control";
import { validateValues, writableFieldsOf, type FieldErrors } from "@/features/objects/fields";
import { createLabel, type UserOption } from "@/features/objects/labels";
import { getObject, type FieldDescriptor, type Relation } from "@/features/objects/registry";

/** Bouton qui ouvre le dialogue : le bouton plein de la liste par défaut, ou un bouton secondaire (« Ajouter … » dans la colonne des liens). */
export type QuickCreateTrigger = { label: string; variant?: "default" | "outline"; size?: "default" | "sm" };

type Props = { type: string; users: readonly UserOption[]; currentUserId: string; prefill?: Record<string, string>; trigger?: QuickCreateTrigger };

/** Refus du serveur : message global, erreurs par champ (400), fiche existante à ouvrir (409, D19). */
type Failure = { message: string; fields?: FieldErrors; existingId?: string; existingName?: string; archived?: boolean };

export type RelationOption = { id: string; name: string };

/** Une entrée du dialogue : un champ déclaré, ou une relation déclarée dont le `prefill` figure dans `quickCreate` (l'entreprise d'un contact). */
type Entry = { kind: "field"; key: string; field: FieldDescriptor } | { kind: "relation"; key: string; relation: Relation };

const isSubmitShortcut = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key === "Enter";

/** Délai avant d'interroger le serveur sur les doublons : une frappe par lettre ferait une requête par lettre. */
const DUPLICATE_DELAY_MS = 300;

/**
 * Les entrées du dialogue dans l'ordre de `quickCreate` ; une clé qui n'est ni un champ ni une
 * relation est ignorée. S'y ajoute tout champ obligatoire sans valeur par défaut que `quickCreate`
 * ne cite pas — un champ personnalisé rendu obligatoire (2.4) en est un : sans lui dans le
 * dialogue, la création serait refusée par le serveur sans que rien à l'écran permette d'y répondre.
 */
function entriesOf(type: string): Entry[] {
  const definition = getObject(type);
  /* Les champs d'un profil ne se saisissent pas dans le dialogue de l'objet (D19) : l'API de l'objet les refuserait. */
  const fields = writableFieldsOf(type);
  const chosen = definition.quickCreate ?? [definition.titleField];
  const entries = chosen.flatMap((key): Entry[] => {
    const field = fields.find((f) => f.key === key);
    if (field) return [{ kind: "field", key, field }];
    const relation = definition.relations.find((r) => r.prefill === key);
    return relation ? [{ kind: "relation", key, relation }] : [];
  });
  const required = fields.filter((field) => field.required && field.default === undefined && !chosen.includes(field.key));
  return [...entries, ...required.map((field): Entry => ({ kind: "field", key: field.key, field }))];
}

/**
 * Fiches non archivées de l'objet lié, pour le sélecteur d'une relation : la source bornée des
 * mécanismes (identifiant et titre seulement). La liste complète de l'objet chargerait toutes ses
 * fiches avec toutes leurs colonnes à chaque ouverture du dialogue.
 */
async function loadRelationOptions(objectKey: string): Promise<RelationOption[]> {
  const definition = getObject(objectKey);
  const res = await fetch(`/api/objets/${encodeURIComponent(objectKey)}/options`);
  if (!res.ok) throw new Error(`Liste des ${definition.labels.plural.toLowerCase()} indisponible (${res.status}).`);
  const { options } = (await res.json()) as { options: RelationOption[] };
  return options;
}

/**
 * Création rapide en Dialog (D7, fondations « Formulaires ») : les champs `quickCreate` de l'objet,
 * cinq au plus ; libellé au-dessus, erreur sous le champ ; ⌘↵ crée, Échap ferme. À la création,
 * la fiche s'ouvre. Les règles sont celles des descripteurs, les mêmes que côté serveur. Une relation
 * déclarée dans `quickCreate` (par son `prefill`) se choisit dans un sélecteur, pré-rempli quand le
 * dialogue s'ouvre depuis une fiche liée (« ajouter un contact »). Un nom qui ressemble à celui
 * d'une fiche existante fait apparaître l'avertissement « doublon probable » (D19), qui nomme la
 * fiche et propose de l'ouvrir sans jamais empêcher la création.
 */
export function QuickCreateDialog({ type, users, currentUserId, prefill, trigger }: Props) {
  const router = useRouter();
  const definition = getObject(type);
  const entries = entriesOf(type);
  const fields = entries.flatMap((entry) => (entry.kind === "field" ? [entry.field] : []));
  const relations = entries.flatMap((entry) => (entry.kind === "relation" ? [entry] : []));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(prefill ?? {});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const [options, setOptions] = useState<Record<string, RelationOption[]>>({});
  const [duplicates, setDuplicates] = useState<DuplicateHint[]>([]);
  const title = createLabel(definition.labels);
  const relatedKeys = relations.map(({ relation }) => relation.to).join(",");
  /* Les valeurs saisies, sous une forme stable : le signal se relit quand elles changent, pas à chaque rendu. */
  const candidate = fields.map((field) => `${encodeURIComponent(field.key)}=${encodeURIComponent(values[field.key] ?? "")}`).join("&");

  /* Les fiches proposées par un sélecteur de relation se chargent à l'ouverture ; un échec s'affiche sous le champ. */
  useEffect(() => {
    if (!open || relatedKeys === "") return;
    let cancelled = false;
    for (const { key, relation } of entriesOf(type).flatMap((entry) => (entry.kind === "relation" ? [entry] : []))) {
      loadRelationOptions(relation.to)
        .then((loaded) => !cancelled && setOptions((current) => ({ ...current, [key]: loaded })))
        .catch((error: Error) => !cancelled && setErrors((current) => ({ ...current, [key]: error.message })));
    }
    return () => {
      cancelled = true;
    };
  }, [open, type, relatedKeys]);

  /**
   * Doublons probables de ce qu'on est en train de saisir (D19, contrat 28). La lecture est
   * différée puis annulée si la frappe continue. Un échec laisse le signal muet et s'arrête là :
   * c'est une aide à la saisie, elle ne doit jamais empêcher une création.
   */
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/objets/${encodeURIComponent(type)}/doublons?${candidate}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<{ duplicates: DuplicateHint[] }>) : { duplicates: [] }))
        .then((body) => setDuplicates(body.duplicates))
        .catch(() => undefined);
    }, DUPLICATE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, type, candidate]);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setValues(prefill ?? {});
      setErrors({});
      setFailure(null);
      setDuplicates([]);
    }
  }

  const valueOf = (field: FieldDescriptor) => values[field.key] ?? (field.type === "user" && field.default === "actor" ? currentUserId : "");
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(fields.map((f) => [f.key, valueOf(f)]));
    const checked = validateValues(fields, input, { partial: false });
    setFailure(null);
    setErrors(checked.errors);
    const firstInvalid = fields.find((f) => checked.errors[f.key]);
    if (firstInvalid) return form.querySelector<HTMLElement>(`#${fieldId(type, firstInvalid.key)}`)?.focus();
    const linked = Object.fromEntries(relations.filter(({ key }) => values[key]).map(({ key }) => [key, values[key]]));
    setPending(true);
    const res = await fetch(definition.apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...checked.values, ...linked }) });
    const body = (await res.json().catch(() => null)) as (Partial<Failure> & { id?: string }) | null;
    setPending(false);
    if (!res.ok) {
      setErrors(body?.fields ?? {});
      if (!body?.fields) setFailure({ message: body?.message ?? "La création a échoué. Réessayez.", existingId: body?.existingId, existingName: body?.existingName, archived: body?.archived });
      return;
    }
    reset(false);
    router.push(definition.href(body!.id!));
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={<Button variant={trigger?.variant ?? "default"} size={trigger?.size ?? "default"} />}>{trigger?.label ?? title}</DialogTrigger>
      {/* Pas de croix (elle n'aurait pour nom que « Close ») : « Annuler » et Échap ferment, comme la palette. */}
      <DialogContent showCloseButton={false}>
        <form className="grid gap-4" onSubmit={onSubmit} onKeyDown={(e) => isSubmitShortcut(e) && e.currentTarget.requestSubmit()} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Les autres champs se remplissent sur la fiche. ⌘↵ pour créer, Échap pour fermer.</DialogDescription>
          </DialogHeader>
          {entries.map((entry) =>
            entry.kind === "field" ? (
              <QuickField key={entry.key} type={type} field={entry.field} value={valueOf(entry.field)} error={errors[entry.key]} users={users} onChange={(value) => set(entry.key, value)} />
            ) : (
              <FieldControl
                key={entry.key}
                id={fieldId(type, entry.key)}
                label={entry.relation.label}
                placement="dialog"
                kind="record"
                value={values[entry.key] ?? ""}
                options={(options[entry.key] ?? []).map((option) => ({ value: option.id, label: option.name }))}
                error={errors[entry.key]}
                onChange={(value) => set(entry.key, value)}
              />
            ),
          )}
          <DuplicateWarning type={type} duplicates={duplicates} />
          {failure && (
            <Alert variant="destructive">
              <AlertDescription>
                <span>{failure.message}</span>
                {failure.existingId && (
                  <Link href={definition.href(failure.existingId)} className="font-medium underline underline-offset-2">
                    Ouvrir la fiche
                  </Link>
                )}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => reset(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const fieldId = (type: string, key: string) => `creation-${type}-${key}`;

type QuickFieldProps = { type: string; field: FieldDescriptor; value: string; error?: string; users: readonly UserOption[]; onChange: (value: string) => void };

/**
 * Un champ du dialogue : liste ou responsable en sélecteur, le reste en champ de saisie. Un champ de
 * date ou de nombre se saisit ici en texte et se valide par son descripteur, comme avant la fiche :
 * le dialogue reste une saisie rapide, la fiche porte les contrôles typés.
 */
function QuickField({ type, field, value, error, users, onChange }: QuickFieldProps) {
  const options = field.type === "list" ? field.values ?? [] : field.type === "user" ? users.map((u) => ({ value: u.id, label: u.name })) : undefined;
  return (
    <FieldControl
      id={fieldId(type, field.key)}
      label={field.label}
      placement="dialog"
      kind={options ? "list" : "text"}
      value={value}
      options={options}
      error={error}
      name={field.key}
      onChange={onChange}
    />
  );
}
