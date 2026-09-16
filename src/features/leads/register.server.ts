/**
 * Part serveur de la déclaration du lead : sa table Drizzle, sa recherche, sa clé de doublon et ses
 * gestes d'en-tête (« Écarter », « Rouvrir », D7). Importé par le manifeste serveur.
 */
import { and, desc, ilike, isNull, ne, or } from "drizzle-orm";
import { createElement } from "react";
import { lead } from "@/db/schema";
import { registerServerObject, type SearchHit } from "@/features/objects/registry.server";
import { normalizeEmail } from "@/features/persons/schema";
import { db } from "@/lib/db";
import { knownEmailWarnings } from "./email-known";
import { LeadStageAction } from "./lead-actions";
import { CONVERTED_STAGE, DISCARDED_STAGE, LEAD_ORIGINS, LEAD_STAGES, OPEN_STAGES } from "./schema";

const MAX_HITS = 20;

const labelOf = (values: readonly { value: string; label: string }[], value: string) => values.find((entry) => entry.value === value)?.label ?? value;

/**
 * Palette ⌘K (D12) : sous-chaîne du titre ou de l'email, sous-titre « Avancement · Origine ». Un lead
 * converti ou archivé n'y est pas ; un lead écarté y reste, pour retrouver qu'on l'a déjà écarté.
 */
async function search(query: string): Promise<SearchHit[]> {
  const text = query.trim();
  if (!text) return [];
  const rows = await db
    .select({ id: lead.id, title: lead.title, stage: lead.stage, origin: lead.origin })
    .from(lead)
    .where(and(isNull(lead.archivedAt), ne(lead.stage, CONVERTED_STAGE), or(ilike(lead.title, `%${text}%`), ilike(lead.email, `%${normalizeEmail(text)}%`))))
    .orderBy(desc(lead.updatedAt))
    .limit(MAX_HITS);
  return rows.map((row) => ({ id: row.id, title: row.title, subtitle: `${labelOf(LEAD_STAGES, row.stage)} · ${labelOf(LEAD_ORIGINS, row.origin)}` }));
}

registerServerObject({
  key: "lead",
  table: lead,
  search,
  /* Pas de « doublon probable » sur les leads (D8) : deux leads homonymes sont deux pistes. */
  duplicateKey: () => null,
  /* À la place, l'email saisi rappelle la personne ou le lead en cours qui le porte (D8). */
  entryWarnings: knownEmailWarnings,
  /* « Écarter » depuis un avancement en cours ; « Rouvrir » seul sur un lead écarté (D7). */
  actions: [
    { key: "ecarter", order: 10, visible: (record) => OPEN_STAGES.includes(String(record.stage)), render: ({ id }) => createElement(LeadStageAction, { id, gesture: "ecarter" }) },
    { key: "rouvrir", order: 20, visible: (record) => record.stage === DISCARDED_STAGE, render: ({ id }) => createElement(LeadStageAction, { id, gesture: "rouvrir" }) },
  ],
});
