/**
 * Le champ dérivé « Profils » d'une personne (D8) : un **ensemble** recalculé depuis les profils
 * réellement attachés, jamais recopié — ni à la création d'un profil, ni à une fusion. Chaque profil
 * s'y déclare (`registerProfileSource`) avec son rang : l'ordre affiché, « Contact, Consultant », ne
 * dépend pas de l'ordre des imports. Ajouter un profil demain revient à ajouter une déclaration.
 */
import { eq } from "drizzle-orm";
import { person } from "@/db/schema";
import { displayValue } from "@/features/objects/labels";
import type { FieldDescriptor } from "@/features/objects/registry";
import { db, type Executor } from "@/lib/db";
import { PERSON_FIELDS } from "./schema";

/** Un profil qui compte dans « Profils » : sa valeur, son rang d'affichage, et comment savoir si une personne le porte. */
export type ProfileSource = {
  value: string;
  order: number;
  holds: (personId: string, exec: Executor) => Promise<boolean>;
};

const sources = new Map<string, ProfileSource>();

/** Déclare un profil ; ré-enregistrer la même valeur remplace la déclaration. */
export function registerProfileSource(source: ProfileSource): void {
  sources.set(source.value, source);
}

const PROFILES_FIELD: FieldDescriptor = PERSON_FIELDS.find((field) => field.key === "profiles")!;

/** Les profils qu'une personne porte, par rang croissant ; vide quand elle n'en porte aucun. */
export async function computeProfiles(personId: string, exec: Executor = db): Promise<string[]> {
  const declared = [...sources.values()].sort((a, b) => a.order - b.order || a.value.localeCompare(b.value));
  const held = await Promise.all(declared.map(async (source) => ((await source.holds(personId, exec)) ? source.value : null)));
  return held.filter((value): value is string => value !== null);
}

/** Recalcule « Profils » et l'écrit sur la personne ; rend l'ensemble obtenu. */
export async function recomputeProfiles(personId: string, exec: Executor = db): Promise<string[]> {
  const profiles = await computeProfiles(personId, exec);
  await exec.update(person).set({ profiles }).where(eq(person.id, personId));
  return profiles;
}

/** « Aucun », « Contact, Consultant » : ce que l'historique et le badge de tête écrivent (D13). */
export const profilesLabel = (profiles: readonly string[]): string => displayValue(PROFILES_FIELD, profiles, []);
