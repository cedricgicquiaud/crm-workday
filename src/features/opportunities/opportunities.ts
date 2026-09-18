/**
 * Opportunité côté serveur : les routes d'API passent par ici. Le comportement commun vient du
 * service générique des objets (validation par les descripteurs, colonnes de base, ensembles rangés
 * dans leur table fille, historique) ; ce module ajoute ce qui est propre à l'opportunité.
 */
import { eq } from "drizzle-orm";
import { opportunity } from "@/db/schema";
import { loadCustomFields } from "@/features/custom-fields/definitions";
import { allCustomFieldsOf } from "@/features/custom-fields/fields-source";
import { recordHistory } from "@/features/history/history";
import { writableFieldsOf } from "@/features/objects/fields";
import { createObject, getObjectRecord, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db, type Executor } from "@/lib/db";
import { GESTURE_KEYS, gestureKeyRule } from "./schema";

const TYPE = "opportunity";

const unexpectedKeyRule = (key: string) => `« ${key} » n'est pas un champ d'une opportunité.`;

const derivedFieldRule = (label: string) => `« ${label} » se calcule et ne se saisit pas.`;

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

/**
 * Une clé qu'aucun champ saisissable ne prévoit répond 400 sous la clé (D55) : ignorée, elle ferait
 * croire à un enregistrement qui n'a pas eu lieu. Un champ calculé (montant estimé, probabilité) et une
 * clé posée par un geste (clôture, perte, lead d'origine) sont refusés en le disant. Un champ
 * personnalisé archivé reste une clé connue, que le service refuse de son côté (409).
 */
async function refuseUnexpectedKeys(fields: Record<string, unknown>): Promise<void> {
  await loadCustomFields();
  const expected = new Set([...writableFieldsOf(TYPE).filter((field) => field.editable !== false), ...allCustomFieldsOf(TYPE)].map((field) => field.key));
  const unexpected = Object.keys(fields).filter((key) => !expected.has(key));
  if (unexpected.length === 0) return;
  const derived = writableFieldsOf(TYPE).filter((field) => field.editable === false);
  const ruleFor = (key: string) => {
    /* Le geste d'abord : « Motif de perte » est un champ déclaré en lecture seule, mais il ne se calcule pas — il se pose. */
    if (Object.hasOwn(GESTURE_KEYS, key)) return gestureKeyRule(GESTURE_KEYS[key]);
    const field = derived.find((candidate) => candidate.key === key);
    return field ? derivedFieldRule(field.label) : unexpectedKeyRule(key);
  };
  const errors = Object.fromEntries(unexpected.map((key) => [key, ruleFor(key)]));
  throw new HttpError(400, "cle_imprevue", Object.values(errors)[0], { fields: errors });
}

/**
 * Ce qu'un geste d'un autre objet (la conversion d'un lead, 4.2c) pose en créant une opportunité : sa
 * transaction, l'étape et le lead d'origine — deux clés qu'aucune saisie ne fournit (D55) —, et la
 * dispense des champs personnalisés obligatoires, qu'il ne peut pas connaître (D50).
 */
export type OpportunityGesture = { exec: Executor; stage?: string; leadId?: string; customRequired?: boolean };

/**
 * Création (D34) : la fiche et ses modules s'écrivent ensemble, ou rien ne s'écrit. Par un geste, tout
 * s'écrit dans la transaction du geste ; la fiche rendue n'y est pas encore complétée, l'appelant la
 * relira une fois la transaction terminée. Le geste a filtré lui-même ses clés : pas de second refus,
 * qui relirait les définitions hors de sa transaction.
 */
export async function createOpportunity(input: unknown, actor: Actor, gesture?: OpportunityGesture): Promise<ObjectRecord> {
  const fields = asObject(input);
  if (!gesture) {
    await refuseUnexpectedKeys(fields);
    const created = await db.transaction((tx) => createObject(TYPE, fields, actor, tx));
    return getObjectRecord(TYPE, created.id);
  }
  const { exec, stage, leadId, customRequired } = gesture;
  /* L'étape passe par la validation de la création : une étape inconnue ou réservée (gagnée, perdue) est refusée sous le champ (D67). */
  const created = await createObject(TYPE, stage === undefined ? fields : { ...fields, stage }, actor, exec, { customRequired });
  /* L'étape posée par le geste a sa ligne, comme un passage d'étape ; la création a déjà la sienne. */
  if (stage !== undefined) await recordHistory([{ objectType: TYPE, objectId: created.id, action: "modifiee", field: "stage", oldValue: null, newValue: stage, authorId: actor.id }], exec);
  /* Le lead d'origine ne se saisit pas : seule seconde écriture, et seulement quand le geste en pose un. */
  if (leadId === undefined) return created;
  const [updated] = await exec.update(opportunity).set({ leadId, updatedAt: new Date() }).where(eq(opportunity.id, created.id)).returning();
  return { ...created, ...updated };
}

export const getOpportunity = (id: string): Promise<ObjectRecord> => getObjectRecord(TYPE, id);

/** Modification (D34) : 400 par champ, 404 inconnue, 409 archivée ; chaque champ changé entre dans l'historique. */
export async function updateOpportunity(id: string, patch: unknown, actor: Actor): Promise<ObjectRecord> {
  const fields = asObject(patch);
  await refuseUnexpectedKeys(fields);
  return updateObject(TYPE, id, fields, actor);
}
