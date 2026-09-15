"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import "@/features/objects/manifest";
import { FieldControl, type FieldControlKind, type FieldControlOption } from "@/features/objects/field-control";
import { sheetFieldsOf } from "@/features/objects/fields";
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
      {sections(sheetFieldsOf(type, record)).map((section) => (
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

/** Forme du contrôle d'un champ de fiche : un responsable se choisit dans la liste des utilisateurs, comme une liste fermée. */
function kindOf(field: FieldDescriptor): FieldControlKind {
  if (field.type === "list" || field.type === "user") return "list";
  if (field.multiline) return "multiline";
  return field.type === "date" ? "date" : field.type === "number" ? "number" : "text";
}

/** Valeurs proposées par un champ de liste ou de responsable ; rien pour un champ de saisie. */
function optionsOf(field: FieldDescriptor, saved: string, users: readonly UserOption[]): readonly FieldControlOption[] | undefined {
  const options = field.type === "list" ? field.values ?? [] : field.type === "user" ? users.map((u) => ({ value: u.id, label: u.name })) : null;
  if (!options) return undefined;
  /* Une valeur retirée de la liste (2.4) reste affichée telle qu'elle a été enregistrée, marquée, et ne se choisit plus. */
  const retired = field.retiredValues?.find((value) => value.value === saved);
  return retired ? [...options, { value: retired.value, label: displayValue(field, saved, users), disabled: true }] : options;
}

/** Un champ de la fiche, éditable en place ou lu comme du texte quand il ne se saisit pas (champ dérivé, fiche archivée). */
function EditableField({ type, field, value: saved, error, users, readOnly, onSave }: EditableProps) {
  const editable = field.editable !== false && !readOnly;
  return (
    <FieldControl
      id={`champ-${type}-${field.key}`}
      label={field.label}
      placement="sheet"
      kind={kindOf(field)}
      value={saved}
      options={optionsOf(field, saved, users)}
      error={error}
      readOnly={!editable}
      display={displayValue(field, saved, users)}
      onSave={onSave}
    />
  );
}
