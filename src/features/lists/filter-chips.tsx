"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import "@/features/objects/manifest";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { Filter } from "@/features/lists/filters";
import { findOperator, operatorsFor, type OperatorKey } from "@/features/lists/operators";
import { listUrl, type ListState } from "@/features/lists/url-state";
import { fieldsOf } from "@/features/objects/fields";
import { displayValue, type UserOption } from "@/features/objects/labels";
import type { FieldDescriptor } from "@/features/objects/registry";

type Props = { type: string; state: ListState; users: readonly UserOption[] };

/** Contrôle de 28 px des fondations, pour les listes déroulantes natives de la barre de filtres. */
const CONTROL = "h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Champs sur lesquels un filtre se pose : tous ceux dont le type a des opérateurs (D16). */
const filterableFields = (type: string) => fieldsOf(type).filter((field) => operatorsFor(field.type).length > 0);

/** « Type est Client » : la puce se lit comme une phrase, et son bouton de retrait la nomme. */
function chipLabel(field: FieldDescriptor, filter: Filter, users: readonly UserOption[]): string {
  const operator = findOperator(filter.operator);
  const value = operator?.needsValue ? ` ${displayValue(field, filter.value, users)}` : "";
  return `${field.label} ${operator?.label ?? filter.operator}${value}`;
}

/**
 * Barre de filtres d'une liste (D16) : une puce `champ + opérateur + valeur` par filtre, combinées
 * en « et » seulement, plus la bascule « archivées ». Chaque changement pousse une nouvelle URL :
 * l'état vit dans l'adresse (D18), la liste est rendue par le serveur, et l'adresse se partage.
 */
export function FilterChips({ type, state, users }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fields = filterableFields(type);
  const go = (next: ListState) => router.push(listUrl(type, next));

  return (
    <div data-slot="list-filters" className="flex flex-wrap items-center gap-2">
      {state.filters.map((filter, index) => {
        const field = fields.find((candidate) => candidate.key === filter.field);
        if (!field) return null;
        const label = chipLabel(field, filter, users);
        return (
          <span key={`${filter.field}-${filter.operator}-${index}`} className="inline-flex h-6 max-w-[18rem] items-center gap-1 rounded-full border bg-muted/40 pr-1 pl-2.5 text-xs">
            <span className="truncate" title={label}>
              {label}
            </span>
            <Button variant="ghost" size="icon-xs" className="rounded-full" aria-label={`Retirer le filtre ${label}`} onClick={() => go({ ...state, filters: state.filters.filter((_, position) => position !== index) })}>
              <XIcon aria-hidden />
            </Button>
          </span>
        );
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>Ajouter un filtre</PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          {open && <AddFilterForm fields={fields} users={users} onAdd={(filter) => { setOpen(false); go({ ...state, filters: [...state.filters, filter] }); }} />}
        </PopoverContent>
      </Popover>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch size="sm" checked={state.includeArchived} aria-label="Archivées" onCheckedChange={(checked) => go({ ...state, includeArchived: checked })} />
        Archivées
      </label>
    </div>
  );
}

type FormProps = { fields: readonly FieldDescriptor[]; users: readonly UserOption[]; onAdd: (filter: Filter) => void };

/** Formulaire d'une nouvelle puce : le champ commande les opérateurs proposés et la forme de la valeur (D16). */
function AddFilterForm({ fields, users, onAdd }: FormProps) {
  const [fieldKey, setFieldKey] = useState(fields[0]?.key ?? "");
  const field = fields.find((candidate) => candidate.key === fieldKey) ?? fields[0];
  const operators = operatorsFor(field.type);
  const [operatorKey, setOperatorKey] = useState<OperatorKey>(operators[0].key);
  const operator = operators.find((candidate) => candidate.key === operatorKey) ?? operators[0];
  const [value, setValue] = useState("");

  /* Changer de champ change les opérateurs possibles : l'opérateur choisi et la valeur repartent de zéro. */
  function chooseField(key: string) {
    setFieldKey(key);
    setOperatorKey(operatorsFor(fields.find((candidate) => candidate.key === key)!.type)[0].key);
    setValue("");
  }

  const options = field.type === "list" ? (field.values ?? []).map((entry) => ({ value: entry.value, label: entry.label })) : field.type === "user" ? users.map((entry) => ({ value: entry.id, label: entry.name })) : null;
  const incomplete = operator.needsValue && value.trim() === "";

  return (
    <form
      data-slot="filter-form"
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!incomplete) onAdd({ field: field.key, operator: operator.key, value: operator.needsValue ? value : "" });
      }}
    >
      <label className="grid gap-1 text-xs font-medium">
        Champ
        <select className={CONTROL} aria-label="Champ" value={field.key} onChange={(event) => chooseField(event.target.value)}>
          {fields.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Opérateur
        <select className={CONTROL} aria-label="Opérateur" value={operator.key} onChange={(event) => setOperatorKey(event.target.value as OperatorKey)}>
          {operators.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      {operator.needsValue && (
        <label className="grid gap-1 text-xs font-medium">
          Valeur
          {options ? (
            <select className={CONTROL} aria-label="Valeur" value={value} onChange={(event) => setValue(event.target.value)}>
              <option value="">—</option>
              {options.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          ) : (
            <input className={CONTROL} aria-label="Valeur" type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} value={value} onChange={(event) => setValue(event.target.value)} />
          )}
        </label>
      )}
      {/* Le seul bouton plein de l'écran est la création (fondations) : la validation du filtre est secondaire. */}
      <Button type="submit" variant="secondary" size="sm" disabled={incomplete}>
        Ajouter
      </Button>
    </form>
  );
}
