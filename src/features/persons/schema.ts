/**
 * Règles de la personne (D2, D3) : listes fermées, descripteurs de champs. Seule source de ces
 * règles, appliquée par le service (API) et par les formulaires. Les clés des champs sont les noms
 * de colonnes Drizzle en camelCase ; `otherEmails` n'est pas une colonne mais la table
 * `person_email`, lue et écrite par `emails.ts`.
 */
import type { FieldDescriptor, ListValue } from "@/features/objects/registry";
import { EMAIL_RULE, EMAIL_REGEX, normalizeEmail } from "./emails";

/** Valeurs du champ dérivé Profils ; la feature 3 ajoutera « consultant ». */
export const PROFILES: readonly ListValue[] = [
  { value: "aucun", label: "Aucun" },
  { value: "contact", label: "Contact" },
];

export const DECISION_ROLES: readonly ListValue[] = [
  { value: "decideur", label: "Décideur" },
  { value: "acheteur", label: "Acheteur" },
  { value: "utilisateur", label: "Utilisateur" },
  { value: "facturation", label: "Facturation" },
  { value: "non_precise", label: "Non précisé" },
];

export const DEFAULT_DECISION_ROLE = "non_precise";

export const LINKEDIN_RULE = "Le lien LinkedIn doit être une adresse web (https://…).";

export const PERSON_FIELDS: readonly FieldDescriptor[] = [
  /* Calculée par la base : titre de la fiche et première colonne de la liste, jamais saisie. */
  { key: "name", label: "Nom complet", type: "text", editable: false, sortable: true, order: 5 },
  { key: "firstName", label: "Prénom", type: "text", required: true, maxLength: 120, sortable: true, order: 10 },
  { key: "lastName", label: "Nom", type: "text", required: true, maxLength: 120, sortable: true, order: 20 },
  { key: "email", label: "Email principal", type: "text", maxLength: 200, normalize: normalizeEmail, pattern: { regex: EMAIL_REGEX, message: EMAIL_RULE }, wide: true, order: 30 },
  { key: "otherEmails", label: "Autres emails", type: "text", maxLength: 1000, wide: true, order: 40 },
  { key: "phone", label: "Téléphone", type: "text", maxLength: 40, order: 50 },
  { key: "linkedin", label: "LinkedIn", type: "text", maxLength: 200, pattern: { regex: /^https?:\/\/\S+$/, message: LINKEDIN_RULE }, order: 60 },
  /* Dérivé des profils attachés : lecture seule sur la fiche, colonne de liste, filtre en 2.5a. */
  { key: "profiles", label: "Profils", type: "list", values: PROFILES, default: "aucun", editable: false, sortable: true, order: 70 },
  { key: "ownerId", label: "Responsable", type: "user", required: true, default: "actor", sortable: true, order: 80 },
  { key: "notes", label: "Notes", type: "text", maxLength: 2000, multiline: true, order: 200 },
];

/** Champs calculés ou dérivés : leur saisie est refusée (400), en création comme en modification. */
export const DERIVED_FIELDS: readonly string[] = ["name", "profiles"];
