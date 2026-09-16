/**
 * Lead côté serveur : les routes d'API passent par ici. Le comportement commun vient du service
 * générique des objets (validation par les descripteurs, colonnes de base, historique) ; ce module
 * ajoute ce qui est propre au lead : la règle des trois champs (D4), le refus du titre calculé (D3)
 * et les gestes « Écarter » et « Rouvrir » (D7), seuls à poser et retirer l'avancement « écarté ».
 */
import { and, eq, isNull } from "drizzle-orm";
import { lead } from "@/db/schema";
import { recordHistory } from "@/features/history/history";
import { assertNotFrozen, assertWritable, createObject, getObjectRecord, listObjectRecords, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DISCARDED_STAGE, lacksName, LEAD_NAME_ERROR_FIELD, LEAD_NAME_RULE, OPEN_STAGES, REOPENED_STAGE, TITLE_RULE } from "./schema";

const TYPE = "lead";

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

/** Le titre se calcule (D3) : le saisir est refusé (400) sous le champ. */
function refuseTitle(input: Record<string, unknown>): void {
  if ("title" in input) throw new HttpError(400, "champ_derive", TITLE_RULE, { fields: { title: TITLE_RULE } });
}

/** D4 : sans prénom, nom ni nom d'entreprise, un seul refus sous le groupe des trois champs. */
function assertNamed(values: Record<string, unknown>): void {
  if (lacksName(values)) throw new HttpError(400, "donnees_invalides", LEAD_NAME_RULE, { fields: { [LEAD_NAME_ERROR_FIELD]: LEAD_NAME_RULE } });
}

export async function createLead(input: unknown, actor: Actor): Promise<ObjectRecord> {
  const fields = asObject(input);
  refuseTitle(fields);
  assertNamed(fields);
  return createObject(TYPE, fields, actor);
}

export const getLead = (id: string): Promise<ObjectRecord> => getObjectRecord(TYPE, id);

export const listLeads = (): Promise<ObjectRecord[]> => listObjectRecords(TYPE);

/** La règle des trois champs se lit sur la fiche telle qu'elle serait après la modification : vider le dernier est refusé. */
export async function updateLead(id: string, patch: unknown, actor: Actor): Promise<ObjectRecord> {
  const fields = asObject(patch);
  const current = await getObjectRecord(TYPE, id);
  assertWritable(TYPE, current);
  assertNotFrozen(TYPE, current);
  refuseTitle(fields);
  assertNamed({ ...current, ...fields });
  return updateObject(TYPE, id, fields, actor);
}

/** Un passage d'avancement posé par un geste : ce qu'il exige de la fiche, où il la mène, et ce qu'il répond sinon. */
type Move = { allowed: (stage: string) => boolean; to: string; archived: string; refused: (stage: string) => string };

/**
 * Passe un lead d'un avancement à l'autre par un geste (D7) : 404 inconnu, 409 archivé ou dans un
 * avancement d'où le geste ne part pas — rejouer le geste compris. Le changement et sa ligne
 * d'historique s'écrivent ensemble ; la mise à jour ne vaut que si l'avancement lu n'a pas bougé
 * entre-temps, sinon le geste concurrent a gagné et celui-ci répond 409 sans rien écrire.
 */
async function move(id: string, { allowed, to, archived, refused }: Move, actor: Actor): Promise<ObjectRecord> {
  const current = await getObjectRecord(TYPE, id);
  if (current.archivedAt) throw new HttpError(409, "fiche_archivee", archived, { id: current.id });
  const from = String(current.stage);
  if (!allowed(from)) throw new HttpError(409, "avancement_incompatible", refused(from), { id: current.id });
  await db.transaction(async (tx) => {
    const [moved] = await tx
      .update(lead)
      .set({ stage: to, updatedAt: new Date() })
      .where(and(eq(lead.id, current.id), eq(lead.stage, from), isNull(lead.archivedAt)))
      .returning({ id: lead.id });
    if (!moved) throw new HttpError(409, "avancement_incompatible", refused(from), { id: current.id });
    await recordHistory([{ objectType: TYPE, objectId: current.id, action: "modifiee", field: "stage", oldValue: from, newValue: to, authorId: actor.id }], tx);
  });
  return getObjectRecord(TYPE, current.id);
}

/** « Écarter » (D7) : depuis nouveau, contacté ou qualifié seulement. */
export const discardLead = (id: string, actor: Actor): Promise<ObjectRecord> =>
  move(
    id,
    {
      allowed: (stage) => OPEN_STAGES.includes(stage),
      to: DISCARDED_STAGE,
      archived: "Lead archivé : il ne s'écarte pas.",
      refused: (stage) => (stage === DISCARDED_STAGE ? "Ce lead est déjà écarté." : "Un lead converti ne s'écarte pas."),
    },
    actor,
  );

/** « Rouvrir » (D7) : un lead écarté revient à « contacté ». */
export const reopenLead = (id: string, actor: Actor): Promise<ObjectRecord> =>
  move(
    id,
    {
      allowed: (stage) => stage === DISCARDED_STAGE,
      to: REOPENED_STAGE,
      archived: "Lead archivé : il ne se rouvre pas.",
      refused: () => "Seul un lead écarté se rouvre.",
    },
    actor,
  );
