/**
 * Opportunité côté serveur : les routes d'API passent par ici. Le comportement commun vient du
 * service générique des objets (validation par les descripteurs, colonnes de base, ensembles rangés
 * dans leur table fille, historique) ; ce module ajoute ce qui est propre à l'opportunité.
 */
import { loadCustomFields } from "@/features/custom-fields/definitions";
import { allCustomFieldsOf } from "@/features/custom-fields/fields-source";
import { writableFieldsOf } from "@/features/objects/fields";
import { createObject, getObjectRecord, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const TYPE = "opportunity";

const COMPANY_FIELD = "companyId";

export const UNKNOWN_COMPANY_RULE = "« Entreprise » ne désigne aucune entreprise.";

const unexpectedKeyRule = (key: string) => `« ${key} » n'est pas un champ d'une opportunité.`;

const derivedFieldRule = (label: string) => `« ${label} » se calcule et ne se saisit pas.`;

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

/**
 * Une clé qu'aucun champ saisissable ne prévoit répond 400 sous la clé (D55) : ignorée, elle ferait
 * croire à un enregistrement qui n'a pas eu lieu. Un champ calculé (le montant estimé) est refusé en
 * le disant. Un champ personnalisé archivé reste une clé connue, que le service refuse de son côté (409).
 */
async function refuseUnexpectedKeys(fields: Record<string, unknown>): Promise<void> {
  await loadCustomFields();
  const expected = new Set([...writableFieldsOf(TYPE).filter((field) => field.editable !== false), ...allCustomFieldsOf(TYPE)].map((field) => field.key));
  const unexpected = Object.keys(fields).filter((key) => !expected.has(key));
  if (unexpected.length === 0) return;
  const derived = writableFieldsOf(TYPE).filter((field) => field.editable === false);
  const errors = Object.fromEntries(unexpected.map((key) => [key, derived.some((field) => field.key === key) ? derivedFieldRule(derived.find((field) => field.key === key)!.label) : unexpectedKeyRule(key)]));
  throw new HttpError(400, "cle_imprevue", Object.values(errors)[0], { fields: errors });
}

/**
 * L'entreprise désignée doit exister (D31) : un identifiant inconnu ou mal formé répond 400 sous le
 * champ, avant que la clé étrangère ne le refuse en base. Une entreprise absente relève de la règle
 * « obligatoire » des descripteurs.
 */
async function assertCompanyExists(fields: Record<string, unknown>): Promise<void> {
  const companyId = fields[COMPANY_FIELD];
  if (typeof companyId !== "string" || companyId.trim() === "") return;
  try {
    await getObjectRecord("company", companyId.trim());
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new HttpError(400, "donnees_invalides", UNKNOWN_COMPANY_RULE, { fields: { [COMPANY_FIELD]: UNKNOWN_COMPANY_RULE } });
    throw error;
  }
}

/** Création (D34) : la fiche et ses modules s'écrivent ensemble, ou rien ne s'écrit. */
export async function createOpportunity(input: unknown, actor: Actor): Promise<ObjectRecord> {
  const fields = asObject(input);
  await refuseUnexpectedKeys(fields);
  await assertCompanyExists(fields);
  const created = await db.transaction((tx) => createObject(TYPE, fields, actor, tx));
  return getObjectRecord(TYPE, created.id);
}

export const getOpportunity = (id: string): Promise<ObjectRecord> => getObjectRecord(TYPE, id);

/** Modification (D34) : 400 par champ, 404 inconnue, 409 archivée ; chaque champ changé entre dans l'historique. */
export async function updateOpportunity(id: string, patch: unknown, actor: Actor): Promise<ObjectRecord> {
  const fields = asObject(patch);
  await refuseUnexpectedKeys(fields);
  await assertCompanyExists(fields);
  return updateObject(TYPE, id, fields, actor);
}
