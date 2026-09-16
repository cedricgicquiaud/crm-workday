/**
 * Email déjà connu (D8) : à la saisie de l'email d'un lead — dans le dialogue de création ou sur sa
 * fiche —, l'adresse est-elle déjà portée par une personne (principale ou autre, archivée comprise)
 * ou par un autre lead en cours ? La réponse nomme la fiche et propose de l'ouvrir ; elle ne bloque
 * rien. Déclarée comme source d'avertissement du lead, lue par la route générique des doublons (D28).
 */
import { and, desc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import { lead } from "@/db/schema";
import { getObject } from "@/features/objects/registry";
import type { EntryWarning } from "@/features/objects/registry.server";
import { holderOf } from "@/features/persons/emails";
import { EMAIL_REGEX, normalizeEmail } from "@/features/persons/schema";
import { db } from "@/lib/db";
import { OPEN_STAGES } from "./schema";

/** Leads nommés au plus : l'avertissement cite la première fiche, les suivantes ne feraient qu'allonger la phrase. */
const MAX_LEADS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const message = (address: string, title: string, what: string) => `L'adresse ${address} est déjà portée par « ${title} » (${what}).`;

/**
 * Ce que l'email saisi rappelle : la personne qui le porte, puis les leads en cours (nouveau, contacté,
 * qualifié, non archivés) qui le portent, le lead saisi excepté. Une adresse absente ou mal formée ne
 * rappelle rien : le refus de forme est celui du champ, à l'enregistrement.
 */
export async function knownEmailWarnings(values: Record<string, unknown>, exceptLeadId: string | null): Promise<EntryWarning[]> {
  if (typeof values.email !== "string") return [];
  const address = normalizeEmail(values.email);
  if (!EMAIL_REGEX.test(address)) return [];
  const warnings: EntryWarning[] = [];
  const holder = await holderOf(address, null);
  if (holder) {
    const what = holder.archivedAt ? "personne, fiche archivée" : "personne";
    warnings.push({ id: holder.id, title: holder.name, href: getObject("person").href(holder.id), message: message(address, holder.name, what) });
  }
  const conditions: SQL[] = [eq(lead.email, address), inArray(lead.stage, [...OPEN_STAGES]), isNull(lead.archivedAt)];
  if (exceptLeadId && UUID.test(exceptLeadId)) conditions.push(ne(lead.id, exceptLeadId));
  const leads = await db
    .select({ id: lead.id, title: lead.title })
    .from(lead)
    .where(and(...conditions))
    .orderBy(desc(lead.updatedAt))
    .limit(MAX_LEADS);
  for (const found of leads) warnings.push({ id: found.id, title: found.title, href: getObject("lead").href(found.id), message: message(address, found.title, "lead") });
  return warnings;
}
