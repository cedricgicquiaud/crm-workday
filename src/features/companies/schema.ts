/**
 * Règles de l'entreprise (D1) : listes fermées, descripteurs de champs. Seule source de ces règles,
 * appliquée par le service (API) et par les formulaires (D19 de la feature 1 : une règle, un endroit).
 * Les clés des champs sont les noms de colonnes Drizzle en camelCase.
 */
import type { FieldDescriptor, ListValue } from "@/features/objects/registry";

export const COMPANY_TYPES: readonly ListValue[] = [
  { value: "prospect", label: "Prospect" },
  { value: "client", label: "Client" },
  { value: "partenaire", label: "Partenaire" },
  { value: "societe_de_portage", label: "Société de portage" },
];

export const PAYMENT_TERMS: readonly ListValue[] = [
  { value: "a_reception", label: "À réception" },
  { value: "30_jours", label: "30 jours" },
  { value: "30_jours_fin_de_mois", label: "30 jours fin de mois" },
  { value: "45_jours_fin_de_mois", label: "45 jours fin de mois" },
  { value: "60_jours", label: "60 jours" },
];

/** Espaces retirés à la saisie : « 123 456 789 » devient « 123456789 » (D1). */
export const SIREN_RULE = "Le SIREN doit contenir neuf chiffres.";

export const normalizeSiren = (value: string): string => value.replace(/\s+/g, "");

export const COMPANY_FIELDS: readonly FieldDescriptor[] = [
  { key: "name", label: "Raison sociale", type: "text", required: true, maxLength: 120, sortable: true, order: 10 },
  { key: "type", label: "Type", type: "list", required: true, values: COMPANY_TYPES, sortable: true, order: 20 },
  { key: "siren", label: "SIREN", type: "text", normalize: normalizeSiren, pattern: { regex: /^\d{9}$/, message: SIREN_RULE }, unique: true, uniqueMessage: (value) => `Le SIREN ${value} est déjà porté`, order: 30 },
  { key: "paymentTerms", label: "Conditions de paiement", type: "list", required: true, values: PAYMENT_TERMS, default: "30_jours", order: 50 },
  { key: "ownerId", label: "Responsable", type: "user", required: true, default: "actor", sortable: true, order: 80 },
  { key: "country", label: "Pays", type: "text", required: true, maxLength: 80, default: "France", section: "Adresse", order: 140 },
];
