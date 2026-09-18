/**
 * Part serveur de la déclaration de la personne : sa table Drizzle, sa recherche (sous-chaîne de
 * « prénom nom », ou de l'une de ses adresses, principale ou autre), sa clé de doublon, la lecture
 * de sa fiche et la section « Profil contact » que la fiche générique rend sous « Champs » (D20).
 * Importé par le manifeste serveur.
 */
import { and, desc, eq, exists, ilike, isNull, or } from "drizzle-orm";
import { createElement } from "react";
import { company, consultantProfile, contactProfile, opportunityConsultant, person, personEmail } from "@/db/schema";
import { normalizeName } from "@/features/duplicates/normalize";
import type { BillingCompanyOption } from "@/features/consultants/billing-company-picker";
import { attachConsultantProfiles, consultantSubtitles, describeConsultantProfile, getConsultantProfile, listBillingCompanyOptions, type ConsultantProfile } from "@/features/consultants/consultant-profile";
import { ConsultantProfileSection } from "@/features/consultants/consultant-profile-section";
import { defineSection, registerServerObject, type DependentTable, type SearchHit } from "@/features/objects/registry.server";
import { listRecordOptions } from "@/features/objects/service";
import { describeProposal } from "@/features/opportunities/proposals";
import { resultRank } from "@/features/opportunities/schema";
import { db } from "@/lib/db";
import type { CompanyOption } from "./company-picker";
import { getContactProfile, type ContactProfile } from "./contact-profile";
import { ContactProfileSection } from "./contact-profile-section";
import { getPerson } from "./persons";
import { recomputeProfiles } from "./profiles";
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
  { table: contactProfile, fkColumn: "personId", label: "Profil contact", oneAtMost: true, carries: ["companyId"] },
  /* Le profil consultant emmène la société de facturation : elle ne veut rien dire sans lui (D16). */
  { table: consultantProfile, fkColumn: "personId", label: "Profil consultant", oneAtMost: true, carries: ["billingCompanyId"], describe: describeConsultantProfile },
  /*
   * Les propositions du consultant retiennent sa suppression et le suivent dans une fusion (D47) ;
   * l'opportunité les déclare aussi, et c'est elle qui les lit dans la colonne des liens (D54). Deux
   * personnes proposées sur la même opportunité n'y laissent que la proposition au résultat le plus avancé.
   */
  {
    table: opportunityConsultant,
    fkColumn: "personId",
    label: "Propositions",
    holds: { to: "opportunity", fkColumn: "opportunityId", label: "Opportunités proposées" },
    oneAtMostPer: { column: "opportunityId", rank: (row) => resultRank(String(row.result)) },
    describe: describeProposal,
  },
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

/** Ce que la section « Profil consultant » lit d'un coup : le profil, et les sociétés que son statut permet. */
type ConsultantProfileData = { profile: ConsultantProfile | null; companies: readonly BillingCompanyOption[] };

/**
 * Section « Profil consultant » de la fiche personne (D9, D20), sous « Profil contact ». Son chargeur
 * lit le profil et les sociétés proposées pour le statut enregistré : la section les reçoit, elle ne
 * les relit pas pour son compte. Sans profil, aucune société n'est à proposer — le statut est choisi
 * d'abord, et c'est lui qui dit quel type de société convient (D4).
 */
const consultantProfileSection = defineSection<ConsultantProfileData>({
  key: "profil-consultant",
  order: 20,
  load: async (id) => {
    const profile = await getConsultantProfile(id);
    return { profile, companies: profile ? await listBillingCompanyOptions(profile.status) : [] };
  },
  render: ({ id, data, readOnly }) => createElement(ConsultantProfileSection, { personId: id, profile: data.profile, companies: data.companies, readOnly }),
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
  /* « Profils » se déduit des profils présents : après une fusion, la conservée le recalcule (D8). */
  recompute: (id, exec) => recomputeProfiles(id, exec).then(() => undefined),
  sections: [contactProfileSection, consultantProfileSection],
});
