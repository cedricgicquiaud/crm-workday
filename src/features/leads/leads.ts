/**
 * Lead côté serveur : les routes d'API passent par ici. Le comportement commun vient du service
 * générique des objets (validation par les descripteurs, colonnes de base, historique).
 */
import { createObject, getObjectRecord, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";

const TYPE = "lead";

export const createLead = (input: unknown, actor: Actor): Promise<ObjectRecord> => createObject(TYPE, input, actor);
export const getLead = (id: string): Promise<ObjectRecord> => getObjectRecord(TYPE, id);
export const updateLead = (id: string, patch: unknown, actor: Actor): Promise<ObjectRecord> => updateObject(TYPE, id, patch, actor);
