/**
 * Entreprise côté serveur : les routes d'API passent par ici. Tout le comportement vient du service
 * générique des objets (validation par les descripteurs, colonnes de base, historique) ; ce module
 * ne fait que nommer l'objet.
 */
import { createObject, getObjectRecord, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";

const TYPE = "company";

export const createCompany = (input: unknown, actor: Actor): Promise<ObjectRecord> => createObject(TYPE, input, actor);
export const getCompany = (id: string): Promise<ObjectRecord> => getObjectRecord(TYPE, id);
export const updateCompany = (id: string, patch: unknown, actor: Actor): Promise<ObjectRecord> => updateObject(TYPE, id, patch, actor);
