/**
 * Part serveur de la déclaration de la personne : sa table Drizzle, sa recherche (sous-chaîne de
 * « prénom nom », ou de l'une de ses adresses, principale ou autre), sa clé de doublon, la lecture
 * de sa fiche et la section « Profil contact » que la fiche générique rend sous « Champs » (D20).
 * Importé par le manifeste serveur.
 */
import { and, desc, eq, exists, ilike, isNull, or } from "drizzle-orm";
import { createElement } from "react";
import { company, contactProfile, person, personEmail } from "@/db/schema";
import { normalizeName } from "@/features/duplicates/normalize";
import { attachConsultantProfiles, consultantSubtitles } from "@/features/consultants/consultant-profile";
import { defineSection, registerServerObject, type DependentTable, type SearchHit } from "@/features/objects/registry.server";
import { listRecordOptions } from "@/features/objects/service";
import { db } from "@/lib/db";
import type { CompanyOption } from "./company-picker";
import { getContactProfile, type ContactProfile } from "./contact-profile";
import { ContactProfileSection } from "./contact-profile-section";
import { getPerson } from "./persons";
import { normalizeEmail } from "./schema";

const MAX_HITS = 20;

/** Sous-titre du résultat (palette) : le profil consultant d'abord (D14), sinon l'entreprise du profil contact, sinon l'adresse principale. */
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
  const consultants = await consultantSubtitles(rows.map((row) => row.id));
  return rows.map((row) => ({ id: row.id, title: row.name, subtitle: consultants.get(row.id) ?? row.companyName ?? row.email ?? undefined }));
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

/** Ce que la section « Profil contact » lit d'un coup : le profil de la personne et les entreprises qu'elle peut choisir. */
type ContactProfileData = { profile: ContactProfile | null; companies: readonly CompanyOption[] };

/**
 * Section « Profil contact » de la fiche personne (D3, D20), la première sous « Champs » ; « Profil
 * consultant » prendra le rang suivant (D9). Son chargeur lit le profil et les entreprises
 * proposées : la section les reçoit, elle ne les relit pas pour son compte.
 */
const contactProfileSection = defineSection<ContactProfileData>({
  key: "profil-contact",
  order: 10,
  load: async (id) => {
    const [profile, companies] = await Promise.all([getContactProfile(id), listRecordOptions("company")]);
    return { profile, companies };
  },
  render: ({ id, data, readOnly }) => createElement(ContactProfileSection, { personId: id, profile: data.profile, companies: data.companies, readOnly }),
});

registerServerObject({
  key: "person",
  table: person,
  search,
  duplicateKey,
  dependents,
  /* La fiche montre les autres adresses et le poste du profil : ni l'une ni l'autre n'est une colonne de `person`. */
  loadRecord: (id) => getPerson(id),
  /* Les champs du profil consultant ne sont pas des colonnes de `person` : le service les joint à chaque lecture (D19). */
  attach: attachConsultantProfiles,
  sections: [contactProfileSection],
});
