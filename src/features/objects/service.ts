/**
 * Service générique des objets (D4) : création et modification de toute fiche déclarée dans le
 * registre. Validation par les descripteurs de champs, colonnes de base, une entrée d'historique
 * par champ modifié (D12), refus d'une fiche archivée (D21). Il ne connaît que la clé d'objet.
 */
import "@/features/objects/manifest.server";
import { recordHistory } from "@/features/history/history";
import { validateValues, type FieldValues } from "@/features/objects/fields";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type Actor = { id: string };

/** Une fiche telle que lue en base : colonnes de base typées, champs de l'objet à côté. */
export type ObjectRecord = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  ownerId: string;
  archivedAt: Date | null;
} & Record<string, unknown>;

/** Valeurs par défaut des champs absents à la création ; `"actor"` sur un champ utilisateur désigne l'acteur. */
function withDefaults(type: string, values: FieldValues, actor: Actor): FieldValues {
  const filled = { ...values };
  for (const field of getObject(type).fields) {
    if (filled[field.key] != null || field.default === undefined) continue;
    filled[field.key] = field.type === "user" && field.default === "actor" ? actor.id : field.default;
  }
  return filled;
}

function validateOrThrow(type: string, input: unknown, options: { partial: boolean }): FieldValues {
  const { values, errors } = validateValues(getObject(type).fields, input, options);
  if (Object.keys(errors).length > 0) throw new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });
  return values;
}

export async function createObject(type: string, input: unknown, actor: Actor): Promise<ObjectRecord> {
  const { table } = getServerObject(type);
  const values = withDefaults(type, validateOrThrow(type, input, { partial: false }), actor);
  const [row] = await db
    .insert(table)
    .values({ ...values, createdBy: actor.id })
    .returning();
  const record = row as ObjectRecord;
  await recordHistory([{ objectType: type, objectId: record.id, action: "creee", authorId: actor.id }]);
  return record;
}
