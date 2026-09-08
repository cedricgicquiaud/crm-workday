/**
 * Filtres d'une liste : lecture des puces telles qu'elles arrivent de l'URL, contre les champs
 * déclarés par l'objet (D16, D18). Un filtre qu'on ne saurait pas appliquer — champ inconnu ou
 * archivé, opérateur qui ne s'applique pas au type, valeur manquante — n'est jamais une erreur
 * d'écran : il est écarté et rendu avec son avertissement « filtre inactif ».
 */
import { fieldsOf } from "@/features/objects/fields";
import type { FieldDescriptor } from "@/features/objects/registry";
import { findOperator, isOperatorAllowed, type OperatorKey } from "@/features/lists/operators";

/** Une puce telle qu'elle arrive de l'URL : trois chaînes, rien n'est encore garanti. */
export type RawFilter = { field: string; operator: string; value: string };

/** Une puce applicable : le champ existe et l'opérateur s'applique à son type. */
export type Filter = { field: string; operator: OperatorKey; value: string };

export type InactiveFilter = RawFilter & { message: string };

const blank = (value: string) => value.trim() === "";

/** Le seul endroit qui rédige l'avertissement, pour que l'URL, l'API et l'écran disent la même phrase. */
function reject(raw: RawFilter, reason: string): InactiveFilter {
  return { ...raw, message: `Filtre inactif : ${reason}` };
}

/** Écarte un filtre inapplicable, ou rend le filtre prêt à être appliqué. */
function read(fields: readonly FieldDescriptor[], raw: RawFilter): { filter: Filter } | { inactive: InactiveFilter } {
  const field = fields.find((candidate) => candidate.key === raw.field);
  if (!field) return { inactive: reject(raw, `« ${raw.field} » n'est pas un champ de cette liste.`) };
  if (!isOperatorAllowed(field.type, raw.operator)) {
    const operator = findOperator(raw.operator);
    return { inactive: reject(raw, `« ${operator?.label ?? raw.operator} » ne s'applique pas au champ « ${field.label} ».`) };
  }
  const operator = findOperator(raw.operator)!;
  if (operator.needsValue && blank(raw.value)) return { inactive: reject(raw, `« ${field.label} ${operator.label} » attend une valeur.`) };
  return { filter: { field: field.key, operator: operator.key, value: raw.value } };
}

/** Sépare les filtres applicables de ceux qui sont ignorés, dans l'ordre où ils arrivent. */
export function readFilters(type: string, raw: readonly RawFilter[]): { filters: Filter[]; inactive: InactiveFilter[] } {
  const fields = fieldsOf(type);
  const filters: Filter[] = [];
  const inactive: InactiveFilter[] = [];
  for (const entry of raw) {
    const outcome = read(fields, entry);
    if ("filter" in outcome) filters.push(outcome.filter);
    else inactive.push(outcome.inactive);
  }
  return { filters, inactive };
}
