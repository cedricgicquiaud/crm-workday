/**
 * Part serveur de la déclaration du lead : sa table Drizzle, sa recherche, sa clé de doublon et ses
 * gestes d'en-tête (« Écarter », « Rouvrir », D7). Importé par le manifeste serveur.
 */
import { and, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import { createElement } from "react";
import { company, lead, person } from "@/db/schema";
import type { Banner } from "@/features/objects/banners";
import { formatDate } from "@/features/objects/labels";
import { getObject } from "@/features/objects/registry";
import { registerServerObject, type SearchHit } from "@/features/objects/registry.server";
import type { ObjectRecord } from "@/features/objects/service";
import { normalizeEmail } from "@/features/persons/schema";
import { db } from "@/lib/db";
import { ConvertLeadAction } from "./convert-dialog";
import { knownEmailWarnings } from "./email-known";
import { LeadStageAction } from "./lead-actions";
import { CONVERTED_DELETE_RULE, CONVERTED_STAGE, DISCARDED_STAGE, LEAD_ORIGINS, LEAD_STAGES, OPEN_STAGES } from "./schema";

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

/** « Converti le 16 sept. 2026. », avec la personne et l'entreprise liées (D18) ; rien sur un lead archivé, que la bannière « archivée » suffit à dire. */
async function convertedBanner(record: ObjectRecord): Promise<Banner[]> {
  if (record.stage !== CONVERTED_STAGE || record.archivedAt || !record.convertedAt) return [];
  const personId = typeof record.convertedPersonId === "string" ? record.convertedPersonId : null;
  const companyId = typeof record.convertedCompanyId === "string" ? record.convertedCompanyId : null;
  const [linkedPerson] = personId ? await db.select({ name: person.name }).from(person).where(eq(person.id, personId)).limit(1) : [];
  const [linkedCompany] = companyId ? await db.select({ name: company.name }).from(company).where(eq(company.id, companyId)).limit(1) : [];
  const links = [
    ...(linkedPerson && personId ? [{ label: linkedPerson.name, href: getObject("person").href(personId) }] : []),
    ...(linkedCompany && companyId ? [{ label: linkedCompany.name, href: getObject("company").href(companyId) }] : []),
  ];
  return [{ rank: "converti", tone: "info", message: `Converti le ${formatDate(record.convertedAt as Date)}.`, links }];
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
    /* « Convertir » depuis un avancement en cours seulement (D14) : absent d'un lead converti, écarté ou archivé. */
    { key: "convertir", order: 5, visible: (record) => OPEN_STAGES.includes(String(record.stage)), render: ({ id }) => createElement(ConvertLeadAction, { id }) },
    { key: "ecarter", order: 10, visible: (record) => OPEN_STAGES.includes(String(record.stage)), render: ({ id }) => createElement(LeadStageAction, { id, gesture: "ecarter" }) },
    { key: "rouvrir", order: 20, visible: (record) => record.stage === DISCARDED_STAGE, render: ({ id }) => createElement(LeadStageAction, { id, gesture: "rouvrir" }) },
  ],
  /* D18 : un lead converti s'archive, il ne se supprime pas. */
  deletable: (record) => (record.stage === CONVERTED_STAGE ? CONVERTED_DELETE_RULE : null),
  /* D18 : « Converti le … » vers la personne et l'entreprise, rangé juste après « archivée » ; un lead archivé ne montre que celle-là. */
  banners: [{ rank: "converti", order: 15, source: convertedBanner }],
});
