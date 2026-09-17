/**
 * Opportunité côté serveur : les routes d'API passent par ici. Le comportement commun vient du
 * service générique des objets (validation par les descripteurs, colonnes de base, ensembles rangés
 * dans leur table fille, historique) ; ce module ajoute ce qui est propre à l'opportunité.
 */
import { createObject, getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const TYPE = "opportunity";

const COMPANY_FIELD = "companyId";

export const UNKNOWN_COMPANY_RULE = "« Entreprise » ne désigne aucune entreprise.";

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

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
  await assertCompanyExists(fields);
  const created = await db.transaction((tx) => createObject(TYPE, fields, actor, tx));
  return getObjectRecord(TYPE, created.id);
}

export const getOpportunity = (id: string): Promise<ObjectRecord> => getObjectRecord(TYPE, id);
