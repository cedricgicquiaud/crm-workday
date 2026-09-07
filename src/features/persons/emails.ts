/**
 * Adresses email d'une personne (D2, D19) : la règle de forme et de normalisation, partagée entre
 * les descripteurs, le service et l'écran, et la lecture des autres adresses (`person_email`).
 */
import { asc, eq } from "drizzle-orm";
import { personEmail } from "@/db/schema";
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
