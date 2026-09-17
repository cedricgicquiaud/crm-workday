"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import "@/features/objects/manifest";
import { DuplicateWarning, type DuplicateHint } from "@/features/duplicates/duplicate-warning";
import { FieldControl, type FieldControlKind, type FieldControlOption } from "@/features/objects/field-control";
import { isLocked, sheetFieldsOf } from "@/features/objects/fields";
import { cellText, displayValue, EMPTY, selectableValues, type RelationOptions, type SerializedRecord, type UserOption } from "@/features/objects/labels";
import { getObject, type FieldDescriptor } from "@/features/objects/registry";
import { SetControl } from "@/features/objects/set-control";

/**
 * `readOnly` : la fiche entière ne se modifie plus (fiche archivée, D21) ; `field.editable` reste la règle du champ.
 * `relationOptions` : les fiches que chaque champ `relation` propose, lues par la page pour cette fiche (D35).
 */
type Props = { type: string; record: SerializedRecord; users: readonly UserOption[]; relationOptions?: Readonly<Record<string, RelationOptions>>; readOnly?: boolean };

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

/** Les valeurs d'un ensemble telles que la fiche les porte ; rien pour une valeur absente. */
const asSet = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/**
 * Colonne centrale de la fiche : chaque champ s'édite en place (D6). Un champ texte s'enregistre
 * quand on le quitte ou sur Entrée, Échap annule ; une liste s'enregistre au choix. La valeur
 * affichée ne change qu'après la réponse 2xx du serveur ; un refus s'affiche sous le champ et la
 * valeur enregistrée revient. Les champs s'empilent sur une seule colonne et prennent toute la
 * largeur de la colonne centrale : une adresse email ou une rue s'y lit en entier.
 */
export function FieldsSection({ type, record: initial, users, relationOptions = {}, readOnly = false }: Props) {
  const router = useRouter();
  const definition = getObject(type);
  const [record, setRecord] = useState(initial);
  /* La fiche relue par le serveur a changé ailleurs (un geste d'en-tête comme « Écarter », D21) : la section la suit, un champ figé se lit aussitôt en texte. */
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setRecord(initial);
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, DuplicateHint[]>>({});

  const FAILED = "La modification n'a pas pu être enregistrée.";

  /**
   * Enregistre un champ ; rend vrai si la valeur est acceptée. Un nombre part en nombre JSON (règle du
   * descripteur), un ensemble en tableau, une saisie vide en champ vidé. Aucun échec n'est avalé :
   * réponse non 2xx ou panne réseau, le message (celui du serveur s'il existe) s'affiche sous le champ
   * et la valeur enregistrée revient.
   */
  async function save(field: FieldDescriptor, value: string | string[]): Promise<boolean> {
    if (asString(record[field.key]) === asString(value)) return true;
    const payload = field.type === "number" && typeof value === "string" && value !== "" ? Number(value) : value;
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
    if (field.entryWarning && typeof value === "string") void lookUpWarnings(field, value);
    return true;
  }

  /**
   * Ce que la valeur enregistrée rappelle d'autres fiches (D8), par la route des doublons de l'objet,
   * la fiche elle-même exceptée. C'est une aide à la saisie : un échec la laisse muette, sans rien
   * défaire de l'enregistrement qui vient de réussir.
   */
  async function lookUpWarnings(field: FieldDescriptor, value: string) {
    const query = new URLSearchParams({ id: initial.id, [field.key]: value });
    const hints = await fetch(`/api/objets/${encodeURIComponent(type)}/doublons?${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ duplicates: DuplicateHint[] }>) : { duplicates: [] }))
      .then((found) => found.duplicates)
      .catch(() => []);
    setWarnings((current) => ({ ...current, [field.key]: hints }));
  }

  return (
    <div className="grid content-start gap-6">
      {sections(sheetFieldsOf(type, record)).map((section) => (
        <section key={section.name} aria-label={section.name} className="grid gap-3">
          <h2 className="text-base font-medium">{section.name}</h2>
          <div className="grid gap-3">
            {section.fields.map((field) => (
              <div key={field.key} className="grid gap-2">
                {/* Un ensemble saisissable se coche dans sa liste (D63) ; lu seulement, il s'écrit en texte comme les autres champs. */}
                {field.type === "multilist" && field.editable !== false && !readOnly && !isLocked(field, record) ? (
                  <SetControl id={`champ-${type}-${field.key}`} label={field.label} value={asSet(record[field.key])} values={field.values ?? []} retired={field.retiredValues} error={errors[field.key]} onSave={(value) => save(field, value)} />
                ) : (
                  /* Un champ que la fiche fige (D21) se lit comme sur une fiche archivée ; ses voisins restent modifiables. */
                  <EditableField type={type} field={field} record={record} value={asString(record[field.key])} error={errors[field.key]} users={users} relationOptions={relationOptions[field.key]} readOnly={readOnly || isLocked(field, record)} onSave={(value) => save(field, value)} />
                )}
                {/* Le sélecteur est borné (D35) : ce qu'il ne propose pas est compté, jamais tu. */}
                {field.type === "relation" && !readOnly && (relationOptions[field.key]?.more ?? 0) > 0 && <p className="text-xs text-muted-foreground">{`et ${relationOptions[field.key].more} autre${relationOptions[field.key].more > 1 ? "s" : ""}`}</p>}
                <DuplicateWarning type={type} duplicates={warnings[field.key] ?? []} note={null} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type EditableProps = { type: string; field: FieldDescriptor; record: SerializedRecord; value: string; error?: string; users: readonly UserOption[]; relationOptions?: RelationOptions; readOnly: boolean; onSave: (value: string) => Promise<boolean> };

/** Forme du contrôle d'un champ de fiche : un responsable se choisit dans la liste des utilisateurs, comme une liste fermée ; une fiche liée dans un sélecteur de fiches. */
function kindOf(field: FieldDescriptor): FieldControlKind {
  if (field.type === "list" || field.type === "user") return "list";
  if (field.type === "relation") return "record";
  if (field.multiline) return "multiline";
  return field.type === "date" ? "date" : field.type === "number" ? "number" : "text";
}

/**
 * Fiches proposées par un champ `relation` (D60) : « — » pour vider le champ, puis les fiches que la page
 * a lues. La fiche liée enregistrée, si elle n'est plus proposée (archivée, contact parti), s'ajoute
 * éteinte avec sa marque : le sélecteur dit ce que la fiche porte sans le proposer (D36).
 */
function recordOptionsOf(record: SerializedRecord, field: FieldDescriptor, saved: string, loaded?: RelationOptions): FieldControlOption[] {
  const options = (loaded?.options ?? []).map((option) => ({ value: option.id, label: option.name }));
  const carried = saved !== "" && !options.some((option) => option.value === saved) ? [{ value: saved, label: cellText(field, record, []), disabled: true }] : [];
  return [{ value: "", label: EMPTY }, ...options, ...carried];
}

/** Valeurs proposées par un champ de liste ou de responsable ; rien pour un champ de saisie. */
function optionsOf(field: FieldDescriptor, saved: string, users: readonly UserOption[]): readonly FieldControlOption[] | undefined {
  /* Une valeur réservée (D21) ou retirée (2.4) portée par la fiche reste affichée, marquée, et ne se choisit pas. */
  if (field.type === "list") return selectableValues(field, saved);
  return field.type === "user" ? users.map((u) => ({ value: u.id, label: u.name })) : undefined;
}

/** Un champ de la fiche, éditable en place ou lu comme du texte quand il ne se saisit pas (champ dérivé, fiche archivée). */
function EditableField({ type, field, record, value: saved, error, users, relationOptions, readOnly, onSave }: EditableProps) {
  const editable = field.editable !== false && !readOnly;
  const relation = field.type === "relation";
  return (
    <FieldControl
      id={`champ-${type}-${field.key}`}
      label={field.label}
      placement="sheet"
      kind={kindOf(field)}
      value={saved}
      options={relation ? recordOptionsOf(record, field, saved, relationOptions) : optionsOf(field, saved, users)}
      error={error}
      readOnly={!editable}
      display={relation ? cellText(field, record, users) : displayValue(field, saved, users)}
      onSave={onSave}
    />
  );
}
