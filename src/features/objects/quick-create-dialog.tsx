"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import "@/features/objects/manifest";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fieldsOf, validateValues, type FieldErrors } from "@/features/objects/fields";
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

/** Les entrées du dialogue dans l'ordre de `quickCreate` ; une clé qui n'est ni un champ ni une relation est ignorée. */
function entriesOf(type: string): Entry[] {
  const definition = getObject(type);
  const fields = fieldsOf(type);
  return (definition.quickCreate ?? [definition.titleField]).flatMap((key): Entry[] => {
    const field = fields.find((f) => f.key === key);
    if (field) return [{ kind: "field", key, field }];
    const relation = definition.relations.find((r) => r.prefill === key);
    return relation ? [{ kind: "relation", key, relation }] : [];
  });
}

/**
 * Fiches non archivées de l'objet lié, pour le sélecteur d'une relation. Chaque objet expose sa liste
 * sous une clé qui lui est propre (`{ companies }`, `{ persons }`…) : on lit le premier tableau de la
 * réponse ; le titre vient du champ titre déclaré.
 */
async function loadRelationOptions(objectKey: string): Promise<RelationOption[]> {
  const definition = getObject(objectKey);
  const res = await fetch(definition.apiBase);
  if (!res.ok) throw new Error(`Liste des ${definition.labels.plural.toLowerCase()} indisponible (${res.status}).`);
  const body = (await res.json()) as Record<string, unknown>;
  const rows = (Object.values(body).find(Array.isArray) ?? []) as Record<string, unknown>[];
  return rows.map((row) => ({ id: String(row.id), name: String(row[definition.titleField] ?? "") }));
}

/**
 * Création rapide en Dialog (D7, fondations « Formulaires ») : les champs `quickCreate` de l'objet,
 * cinq au plus ; libellé au-dessus, erreur sous le champ ; ⌘↵ crée, Échap ferme. À la création,
 * la fiche s'ouvre. Les règles sont celles des descripteurs, les mêmes que côté serveur. Une relation
 * déclarée dans `quickCreate` (par son `prefill`) se choisit dans un sélecteur, pré-rempli quand le
 * dialogue s'ouvre depuis une fiche liée (« ajouter un contact »).
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
  const title = createLabel(definition.labels);
  const relatedKeys = relations.map(({ relation }) => relation.to).join(",");

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

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setValues(prefill ?? {});
      setErrors({});
      setFailure(null);
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
              <Field key={entry.key} id={fieldId(type, entry.key)} label={entry.relation.label} error={errors[entry.key]}>
                <RelationSelect id={fieldId(type, entry.key)} label={entry.relation.label} value={values[entry.key] ?? null} options={options[entry.key] ?? []} error={errors[entry.key]} describedBy={errors[entry.key] ? `${fieldId(type, entry.key)}-error` : undefined} onChange={(value) => set(entry.key, value)} />
              </Field>
            ),
          )}
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

/** Libellé au-dessus (12 px / 500), erreur en dessous (11 px). */
function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type RelationSelectProps = { id: string; label: string; value: string | null; options: readonly RelationOption[]; placeholder?: string; error?: string; describedBy?: string; onChange: (id: string) => void };

/** Sélecteur d'une fiche liée : les fiches proposées par la liste de l'objet (jamais une archivée, D21), la valeur tronquée si elle est longue. */
export function RelationSelect({ id, label, value, options, placeholder = "Choisir…", error, describedBy, onChange }: RelationSelectProps) {
  /* Une valeur pré-remplie avant que la liste soit chargée reste sélectionnée : l'élément est ajouté sans libellé jusque-là. */
  const items = value && !options.some((option) => option.id === value) ? [...options, { id: value, name: "…" }] : options;
  return (
    <Select items={items.map((option) => ({ value: option.id, label: option.name }))} value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger id={id} aria-label={label} size="sm" aria-invalid={error ? true : undefined} aria-describedby={describedBy} className="w-full min-w-0">
        <SelectValue className="min-w-0 truncate" placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type QuickFieldProps = { type: string; field: FieldDescriptor; value: string; error?: string; users: readonly UserOption[]; onChange: (value: string) => void };

/** Un champ du dialogue selon son type : liste ou responsable en sélecteur, le reste en champ texte. */
function QuickField({ type, field, value, error, users, onChange }: QuickFieldProps) {
  const id = fieldId(type, field.key);
  const errorId = `${id}-error`;
  const options = field.type === "list" ? field.values ?? [] : field.type === "user" ? users.map((u) => ({ value: u.id, label: u.name })) : null;
  return (
    <Field id={id} label={field.label} error={error}>
      {options ? (
        <Select items={options} value={value || null} onValueChange={(next) => onChange(next ?? "")}>
          <SelectTrigger id={id} aria-label={field.label} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} className="w-full">
            <SelectValue placeholder="Choisir…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input id={id} name={field.key} value={value} autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}
