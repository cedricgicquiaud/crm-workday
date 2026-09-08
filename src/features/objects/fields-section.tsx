"use client";

import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import "@/features/objects/manifest";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldsOf } from "@/features/objects/fields";
import { displayValue, type SerializedRecord, type UserOption } from "@/features/objects/labels";
import { getObject, type FieldDescriptor } from "@/features/objects/registry";

/** `readOnly` : la fiche entière ne se modifie plus (fiche archivée, D21) ; `field.editable` reste la règle du champ. */
type Props = { type: string; record: SerializedRecord; users: readonly UserOption[]; readOnly?: boolean };

const MAIN_SECTION = "Champs";

/** Les champs regroupés par section, dans l'ordre des descripteurs ; le groupe principal d'abord. */
function sections(fields: readonly FieldDescriptor[]): { name: string; fields: FieldDescriptor[] }[] {
  const groups = new Map<string, FieldDescriptor[]>([[MAIN_SECTION, []]]);
  for (const field of fields) {
    const name = field.section ?? MAIN_SECTION;
    groups.set(name, [...(groups.get(name) ?? []), field]);
  }
  return Array.from(groups, ([name, list]) => ({ name, fields: list })).filter((g) => g.fields.length > 0);
}

const asString = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/**
 * Colonne centrale de la fiche : chaque champ s'édite en place (D6). Un champ texte s'enregistre
 * quand on le quitte ou sur Entrée, Échap annule ; une liste s'enregistre au choix. La valeur
 * affichée ne change qu'après la réponse 2xx du serveur ; un refus s'affiche sous le champ et la
 * valeur enregistrée revient. Les champs s'empilent sur une seule colonne et prennent toute la
 * largeur de la colonne centrale : une adresse email ou une rue s'y lit en entier.
 */
export function FieldsSection({ type, record: initial, users, readOnly = false }: Props) {
  const router = useRouter();
  const definition = getObject(type);
  const [record, setRecord] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const FAILED = "La modification n'a pas pu être enregistrée.";

  /**
   * Enregistre un champ ; rend vrai si la valeur est acceptée. Un nombre part en nombre JSON (règle du
   * descripteur), une saisie vide en champ vidé. Aucun échec n'est avalé : réponse non 2xx ou panne
   * réseau, le message (celui du serveur s'il existe) s'affiche sous le champ et la valeur enregistrée revient.
   */
  async function save(field: FieldDescriptor, value: string): Promise<boolean> {
    if (asString(record[field.key]) === value) return true;
    const payload = field.type === "number" && value !== "" ? Number(value) : value;
    const fail = (message: string) => {
      setErrors((current) => ({ ...current, [field.key]: message }));
      return false;
    };
    let res: Response;
    try {
      res = await fetch(`${definition.apiBase}/${encodeURIComponent(record.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field.key]: payload }) });
    } catch {
      return fail(FAILED);
    }
    const body = (await res.json().catch(() => null)) as (SerializedRecord & { message?: string; fields?: Record<string, string> }) | null;
    if (!res.ok) return fail(body?.fields?.[field.key] ?? body?.message ?? FAILED);
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== field.key)));
    if (body) setRecord(body);
    router.refresh();
    return true;
  }

  return (
    <div className="grid content-start gap-6">
      {sections(fieldsOf(type)).map((section) => (
        <section key={section.name} aria-label={section.name} className="grid gap-3">
          <h2 className="text-base font-medium">{section.name}</h2>
          <div className="grid gap-3">
            {section.fields.map((field) => (
              <EditableField key={field.key} type={type} field={field} value={asString(record[field.key])} error={errors[field.key]} users={users} readOnly={readOnly} onSave={(value) => save(field, value)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type EditableProps = { type: string; field: FieldDescriptor; value: string; error?: string; users: readonly UserOption[]; readOnly: boolean; onSave: (value: string) => Promise<boolean> };

/** Un champ éditable en place : le contrôle porte le libellé au-dessus (12 px / 500) et l'erreur en dessous (11 px). */
function EditableField({ type, field, value: saved, error, users, readOnly, onSave }: EditableProps) {
  const id = `champ-${type}-${field.key}`;
  const errorId = `${id}-error`;
  const [draft, setDraft] = useState(saved);
  /* La valeur enregistrée a changé ailleurs (réponse du serveur) : le brouillon la suit. */
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setDraft(saved);
  }
  const editable = field.editable !== false && !readOnly;
  const describedBy = error ? errorId : undefined;

  /* Lecture seule (un nom calculé, un champ dérivé, une fiche archivée) : la valeur se lit comme du
     texte. Rendue par un contrôle éteint, elle serait à demi transparente — le contraste tomberait
     sous le seuil lisible alors que c'est une donnée de la fiche (défaut d'audit 2.2). */
  if (!editable) {
    const text = displayValue(field, saved, users);
    return (
      <div className="grid gap-1">
        <span id={`${id}-label`} className="flex items-center gap-2 text-sm leading-none font-medium select-none">
          {field.label}
        </span>
        <p id={id} aria-labelledby={`${id}-label`} className="min-w-0 truncate text-sm" title={text}>
          {text}
        </p>
      </div>
    );
  }

  async function commit() {
    if (draft === saved) return;
    if (!(await onSave(draft.trim()))) setDraft(saved);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      setDraft(saved);
      event.currentTarget.blur();
    } else if (event.key === "Enter" && !field.multiline) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  const options = field.type === "list" ? field.values ?? [] : field.type === "user" ? users.map((u) => ({ value: u.id, label: u.name })) : null;

  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{field.label}</Label>
      {options ? (
        <Select items={options} value={saved || null} onValueChange={(next) => void onSave(next ?? "")} disabled={!editable}>
          <SelectTrigger id={id} aria-label={field.label} size="sm" aria-invalid={error ? true : undefined} aria-describedby={describedBy} className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.multiline ? (
        <Textarea id={id} value={draft} rows={4} readOnly={!editable} aria-invalid={error ? true : undefined} aria-describedby={describedBy} onChange={(e) => setDraft(e.target.value)} onBlur={() => void commit()} onKeyDown={onKeyDown} />
      ) : (
        <Input
          id={id}
          type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
          className="h-7 truncate"
          value={draft}
          title={draft || undefined}
          readOnly={!editable}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
        />
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
