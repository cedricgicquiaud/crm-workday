/**
 * Adresses email d'une personne (D2, D19), côté serveur : l'unicité d'une adresse dans tout le CRM
 * (principale ou autre, archivées comprises) et les autres adresses (`person_email`). La règle de
 * forme et de normalisation vit dans `schema.ts`, partagée avec l'écran.
 */
import { and, asc, eq, ne, type SQL } from "drizzle-orm";
import { person, personEmail } from "@/db/schema";
import { recordHistory } from "@/features/history/history";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EMAIL_REGEX, EMAIL_RULE, normalizeEmail } from "./schema";

/** Autres adresses d'une personne, par ordre alphabétique (le même à la saisie et à la lecture). */
export async function otherEmailsOf(personId: string): Promise<string[]> {
  const rows = await db.select({ address: personEmail.address }).from(personEmail).where(eq(personEmail.personId, personId)).orderBy(asc(personEmail.address));
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

const OTHER_EMAILS = "otherEmails";

/**
 * Les autres adresses telles que saisies dans le champ « Autres emails » (séparées par virgules,
 * points-virgules ou espaces) : normalisées, dédoublonnées, sans l'adresse principale, par ordre
 * alphabétique ; une adresse mal formée est refusée (400) avant toute écriture.
 */
export function parseOtherEmails(text: string, primary: string | null): string[] {
  const addresses = Array.from(new Set(text.split(/[\s,;]+/).filter(Boolean).map(normalizeEmail)))
    .filter((address) => address !== primary)
    .sort();
  const malformed = addresses.find((address) => !EMAIL_REGEX.test(address));
  if (malformed) {
    const message = `${EMAIL_RULE.slice(0, -1)} : ${malformed}.`;
    throw new HttpError(400, "donnees_invalides", message, { fields: { [OTHER_EMAILS]: message } });
  }
  return addresses;
}

/** Chaque autre adresse doit être libre dans tout le CRM (409 sinon), hors celles de la personne elle-même. */
export async function assertOtherEmailsAvailable(addresses: readonly string[], personId: string | null): Promise<void> {
  for (const address of addresses) await assertEmailAvailable(address, personId, OTHER_EMAILS);
}

/** Remplace les autres adresses d'une personne et écrit une entrée d'historique si elles changent. */
export async function setOtherEmails(personId: string, addresses: readonly string[], actor: { id: string }): Promise<void> {
  const before = await otherEmailsOf(personId);
  const oldValue = before.join(", ") || null;
  const newValue = addresses.join(", ") || null;
  if (oldValue === newValue) return;
  await db.delete(personEmail).where(eq(personEmail.personId, personId));
  if (addresses.length > 0) await db.insert(personEmail).values(addresses.map((address) => ({ personId, address })));
  await db.update(person).set({ updatedAt: new Date() }).where(eq(person.id, personId));
  await recordHistory([{ objectType: "person", objectId: personId, action: "modifiee", field: OTHER_EMAILS, oldValue, newValue, authorId: actor.id }]);
}
