/**
 * Part serveur de la déclaration de l'entreprise : sa table Drizzle et sa recherche (raison
 * sociale en sous-chaîne, ou SIREN). Importé par le manifeste serveur.
 */
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { company } from "@/db/schema";
import { registerServerObject } from "@/features/objects/registry.server";
import { db } from "@/lib/db";
import { COMPANY_TYPES, normalizeSiren } from "./schema";

const MAX_HITS = 20;

async function search(query: string) {
  const text = query.trim();
  if (!text) return [];
  const rows = await db
    .select({ id: company.id, name: company.name, type: company.type })
    .from(company)
    .where(and(isNull(company.archivedAt), or(ilike(company.name, `%${text}%`), eq(company.siren, normalizeSiren(text)))))
    .orderBy(desc(company.updatedAt))
    .limit(MAX_HITS);
  return rows.map((row) => ({ id: row.id, title: row.name, subtitle: COMPANY_TYPES.find((t) => t.value === row.type)?.label }));
}

/** Raison sociale en minuscules, espaces réduits ; 2.6a y retirera accents, ponctuation et formes juridiques (D19). */
function duplicateKey(record: Record<string, unknown>): string | null {
  const name = String(record.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return name || null;
}

registerServerObject({ key: "company", table: company, search, duplicateKey });
