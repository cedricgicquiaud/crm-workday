"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import "@/features/objects/manifest";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fieldsOf, validateValues, type FieldErrors } from "@/features/objects/fields";
import { createLabel, type UserOption } from "@/features/objects/labels";
import { getObject, type FieldDescriptor } from "@/features/objects/registry";

type Props = { type: string; users: readonly UserOption[]; currentUserId: string };

/** Refus du serveur : message global, erreurs par champ (400), fiche existante à ouvrir (409, D19). */
type Failure = { message: string; fields?: FieldErrors; existingId?: string; existingName?: string; archived?: boolean };

const isSubmitShortcut = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key === "Enter";

/**
 * Création rapide en Dialog (D7, fondations « Formulaires ») : les champs `quickCreate` de l'objet,
 * cinq au plus ; libellé au-dessus, erreur sous le champ ; ⌘↵ crée, Échap ferme. À la création,
 * la fiche s'ouvre. Les règles sont celles des descripteurs, les mêmes que côté serveur.
 */
export function QuickCreateDialog({ type, users, currentUserId }: Props) {
  const router = useRouter();
  const definition = getObject(type);
  const fields = fieldsOf(type).filter((f) => (definition.quickCreate ?? [definition.titleField]).includes(f.key));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const title = createLabel(definition.labels);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setValues({});
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
    if (firstInvalid) return form.querySelector<HTMLElement>(`#${fieldId(type, firstInvalid)}`)?.focus();
    setPending(true);
    const res = await fetch(definition.apiBase, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(checked.values) });
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
      <DialogTrigger render={<Button />}>{title}</DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={onSubmit} onKeyDown={(e) => isSubmitShortcut(e) && e.currentTarget.requestSubmit()} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Les autres champs se remplissent sur la fiche. ⌘↵ pour créer, Échap pour fermer.</DialogDescription>
          </DialogHeader>
          {fields.map((field) => (
            <QuickField key={field.key} type={type} field={field} value={valueOf(field)} error={errors[field.key]} users={users} onChange={(value) => set(field.key, value)} />
          ))}
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

const fieldId = (type: string, field: FieldDescriptor) => `creation-${type}-${field.key}`;

type QuickFieldProps = { type: string; field: FieldDescriptor; value: string; error?: string; users: readonly UserOption[]; onChange: (value: string) => void };

/** Un champ du dialogue selon son type : liste ou responsable en sélecteur, le reste en champ texte. */
function QuickField({ type, field, value, error, users, onChange }: QuickFieldProps) {
  const id = fieldId(type, field);
  const errorId = `${id}-error`;
  const options = field.type === "list" ? field.values ?? [] : field.type === "user" ? users.map((u) => ({ value: u.id, label: u.name })) : null;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      {options ? (
        <Select value={value || null} onValueChange={(next) => onChange(next ?? "")}>
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
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
