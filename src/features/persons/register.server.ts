/**
 * Part serveur de la déclaration de la personne : sa table Drizzle, sa recherche (sous-chaîne de
 * « prénom nom », ou de l'une de ses adresses, principale ou autre) et sa clé de doublon. Importé
 * par le manifeste serveur.
 */
import { and, desc, eq, exists, ilike, isNull, or } from "drizzle-orm";
import { company, contactProfile, person, personEmail } from "@/db/schema";
import { normalizeName } from "@/features/duplicates/normalize";
import { registerServerObject, type DependentTable, type SearchHit } from "@/features/objects/registry.server";
import { db } from "@/lib/db";
import { normalizeEmail } from "./schema";

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

/** Prénom et nom sans casse, accents ni ponctuation : deux personnes de même clé sont des doublons probables (D19). */
function duplicateKey(record: Record<string, unknown>): string | null {
  return normalizeName(`${String(record.firstName ?? "")} ${String(record.lastName ?? "")}`) || null;
}

/**
 * Ce qui dépend d'une personne sans être un objet : ses autres adresses (plusieurs par personne) et
 * son profil contact (un au plus, D3). La fusion s'en sert pour rattacher ces lignes à la fiche
 * conservée. L'entreprise de rattachement et le champ dérivé « Profils » suivent le profil : ils ne
 * veulent rien dire sans lui.
 */
const dependents: readonly DependentTable[] = [
  { table: personEmail, fkColumn: "personId", label: "Adresses email" },
  { table: contactProfile, fkColumn: "personId", label: "Profil contact", oneAtMost: true, carries: ["companyId", "profiles"] },
];

registerServerObject({ key: "person", table: person, search, duplicateKey, dependents });
