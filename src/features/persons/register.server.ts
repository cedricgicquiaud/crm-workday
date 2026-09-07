/**
 * Part serveur de la déclaration de la personne : sa table Drizzle, sa recherche (sous-chaîne de
 * « prénom nom », ou de l'une de ses adresses, principale ou autre) et sa clé de doublon. Importé
 * par le manifeste serveur.
 */
import { and, desc, eq, exists, ilike, isNull, or } from "drizzle-orm";
import { company, person, personEmail } from "@/db/schema";
import { registerServerObject, type SearchHit } from "@/features/objects/registry.server";
import { db } from "@/lib/db";
import { normalizeEmail } from "./emails";

const MAX_HITS = 20;

/** Sous-titre du résultat (palette) : l'entreprise du profil contact, sinon l'adresse principale. */
async function search(query: string): Promise<SearchHit[]> {
  const text = query.trim();
  if (!text) return [];
  const address = `%${normalizeEmail(text)}%`;
  const byOtherAddress = exists(
    db
      .select({ id: personEmail.id })
      .from(personEmail)
      .where(and(eq(personEmail.personId, person.id), ilike(personEmail.address, address))),
  );
  const rows = await db
    .select({ id: person.id, name: person.name, email: person.email, companyName: company.name })
    .from(person)
    .leftJoin(company, eq(company.id, person.companyId))
    .where(and(isNull(person.archivedAt), or(ilike(person.name, `%${text}%`), ilike(person.email, address), byOtherAddress)))
    .orderBy(desc(person.updatedAt))
    .limit(MAX_HITS);
  return rows.map((row) => ({ id: row.id, title: row.name, subtitle: row.companyName ?? row.email ?? undefined }));
}

/** Prénom et nom en minuscules, espaces réduits (D19, 2.6a). */
function duplicateKey(record: Record<string, unknown>): string | null {
  const name = `${String(record.firstName ?? "")} ${String(record.lastName ?? "")}`.trim().toLowerCase().replace(/\s+/g, " ");
  return name || null;
}

registerServerObject({ key: "person", table: person, search, duplicateKey });
