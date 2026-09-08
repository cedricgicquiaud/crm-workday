/**
 * Opérateurs de filtre, par type de champ (D16). Source unique lue par la puce de filtre, la
 * lecture de l'URL et le filtrage : un opérateur proposé à l'écran est toujours un opérateur que le
 * filtrage sait appliquer, et un opérateur absent d'ici rend le filtre inactif au lieu d'une erreur.
 * Ce fichier est importable côté client : il ne connaît ni base ni objet.
 */
import type { FieldType } from "@/features/objects/registry";

export type OperatorKey = "contient" | "ne_contient_pas" | "est" | "n_est_pas" | "avant" | "apres" | "egal" | "plus_grand" | "plus_petit" | "est_vide";

export type OperatorDescriptor = {
  key: OperatorKey;
  label: string;
  /** types de champ auxquels l'opérateur s'applique (D16) */
  types: readonly FieldType[];
  /** faux : l'opérateur se passe de valeur (« est vide ») */
  needsValue: boolean;
  /** rang d'affichage, croissant ; l'ordre ne dépend jamais de l'ordre des imports */
  order: number;
};

const OPERATORS: readonly OperatorDescriptor[] = [
  { key: "contient", label: "contient", types: ["text"], needsValue: true, order: 10 },
  { key: "ne_contient_pas", label: "ne contient pas", types: ["text"], needsValue: true, order: 20 },
  { key: "est", label: "est", types: ["text", "list", "user"], needsValue: true, order: 30 },
  { key: "n_est_pas", label: "n'est pas", types: ["list", "user"], needsValue: true, order: 40 },
  { key: "avant", label: "avant", types: ["date"], needsValue: true, order: 50 },
  { key: "apres", label: "après", types: ["date"], needsValue: true, order: 60 },
  { key: "egal", label: "égal", types: ["number"], needsValue: true, order: 70 },
  { key: "plus_grand", label: "plus grand", types: ["number"], needsValue: true, order: 80 },
  { key: "plus_petit", label: "plus petit", types: ["number"], needsValue: true, order: 85 },
  { key: "est_vide", label: "est vide", types: ["text", "list", "user", "date", "number"], needsValue: false, order: 90 },
];

/** Opérateurs applicables à un type de champ, par rang croissant (D16). */
export function operatorsFor(type: FieldType): readonly OperatorDescriptor[] {
  return OPERATORS.filter((operator) => operator.types.includes(type)).sort((a, b) => a.order - b.order);
}

/** Descripteur d'un opérateur, ou `undefined` si la clé n'en désigne aucun (une URL bricolée). */
export function findOperator(key: string): OperatorDescriptor | undefined {
  return OPERATORS.find((operator) => operator.key === key);
}

/** Vrai si l'opérateur existe et s'applique à ce type de champ. */
export function isOperatorAllowed(type: FieldType, key: string): boolean {
  return findOperator(key)?.types.includes(type) ?? false;
}
