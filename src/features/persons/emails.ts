/**
 * Adresses email d'une personne (D2, D19) : la règle de forme et de normalisation, partagée entre
 * les descripteurs, le service et l'écran ; l'unicité d'une adresse dans tout le CRM (principale ou
 * autre, archivées comprises) ; la lecture des autres adresses (`person_email`).
 */
import { and, asc, eq, ne, type SQL } from "drizzle-orm";
import { person, personEmail } from "@/db/schema";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const EMAIL_RULE = "Cette adresse n'est pas valide.";
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minuscules, espaces retirés : « Jean.Dupont@Acme.fr » et « jean.dupont@acme.fr » sont la même adresse. */
export const normalizeEmail = (value: string): string => value.toLowerCase().replace(/\s+/g, "");

/** Autres adresses d'une personne, dans l'ordre d'ajout. */
export async function otherEmailsOf(personId: string): Promise<string[]> {
  const rows = await db.select({ address: personEmail.address }).from(personEmail).where(eq(personEmail.personId, personId)).orderBy(asc(personEmail.createdAt), asc(personEmail.address));
  return rows.map((row) => row.address);
}

type Holder = { id: string; name: string; archivedAt: Date | null };

/** La personne qui porte déjà cette adresse normalisée, principale ou autre, archivée comprise ; jamais `exceptPersonId`. */
async function holderOf(address: string, exceptPersonId: string | null): Promise<Holder | null> {
  const notSelf = (column: typeof person.id): SQL[] => (exceptPersonId ? [ne(column, exceptPersonId)] : []);
  const [primary] = await db
    .select({ id: person.id, name: person.name, archivedAt: person.archivedAt })
    .from(person)
    .where(and(eq(person.email, address), ...notSelf(person.id)))
    .limit(1);
  if (primary) return primary;
  const [other] = await db
    .select({ id: person.id, name: person.name, archivedAt: person.archivedAt })
    .from(personEmail)
    .innerJoin(person, eq(person.id, personEmail.personId))
    .where(and(eq(personEmail.address, address), ...notSelf(person.id)))
    .limit(1);
  return other ?? null;
}

/**
 * Une adresse déjà portée par une autre personne est refusée (409, D19) ; le message nomme cette
 * personne et dit si elle est archivée ; la réponse porte de quoi ouvrir sa fiche.
 */
export async function assertEmailAvailable(address: string, exceptPersonId: string | null, field = "email"): Promise<void> {
  const holder = await holderOf(address, exceptPersonId);
  if (!holder) return;
  const archived = holder.archivedAt != null;
  throw new HttpError(409, "valeur_deja_portee", `L'adresse ${address} est déjà portée par « ${holder.name} »${archived ? " (fiche archivée)" : ""}.`, {
    field,
    existingId: holder.id,
    existingName: holder.name,
    archived,
  });
}
