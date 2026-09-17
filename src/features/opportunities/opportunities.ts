/**
 * Opportunité côté serveur : les routes d'API passent par ici. Le comportement commun vient du
 * service générique des objets (validation par les descripteurs, colonnes de base, ensembles rangés
 * dans leur table fille, historique) ; ce module ajoute ce qui est propre à l'opportunité.
 */
import { createObject, getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { db } from "@/lib/db";

const TYPE = "opportunity";

/** Création (D34) : la fiche et ses modules s'écrivent ensemble, ou rien ne s'écrit. */
export async function createOpportunity(input: unknown, actor: Actor): Promise<ObjectRecord> {
  const created = await db.transaction((tx) => createObject(TYPE, input, actor, tx));
  return getObjectRecord(TYPE, created.id);
}

export const getOpportunity = (id: string): Promise<ObjectRecord> => getObjectRecord(TYPE, id);
