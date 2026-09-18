import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, consultantModule, consultantProfile, opportunity, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createConsultant } from "@/features/consultants/consultants";
import { LINKED_RECORDS_LIMIT, linkedGroups } from "@/features/objects/links-column";
import { createObject } from "@/features/objects/service";
import { addProposal } from "@/features/opportunities/proposals";
import { createPerson, updatePerson } from "@/features/persons/persons";
import { closeDb, db } from "@/lib/db";

const ACTOR = { email: "acteur-liens@exemple.fr", firstName: "Nora", lastName: "Blanc", password: "MotDePasse-Liens-1", role: "membre" as const };
let actorId: string;

/** Les enfants avant les parents : l'opportunité (et ses propositions, en cascade) retient ses personnes et son entreprise. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ACTOR.email));
  actorId = (await createUserWithPassword(ACTOR)).id;
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Colonne des liens (D4, D5, décision de l'audit 2.1a) : les fiches liées se chargent par la relation
 * déclarée dans le registre (`to`, `fkColumn`), dans les deux sens, sans code propre à un objet.
 * La personne est le premier objet qui déclare une relation : c'est avec elle qu'on le prouve.
 */
describe("colonne des liens — fiches liées par relation déclarée (CRM-42, D4)", () => {
  it("la fiche d'une entreprise liste ses contacts actifs (la dernière modifiée en tête) sous « Contacts », et la fiche d'une personne montre son entreprise sous « Entreprise »", async () => {
    const solveige = await createObject("company", { name: "Banque Solveige", type: "client" }, { id: actorId });
    const ferrandi = await createObject("company", { name: "Groupe Ferrandi", type: "partenaire" }, { id: actorId });
    const jean = await createPerson({ firstName: "Jean", lastName: "Dupont", companyId: solveige.id }, { id: actorId });
    const marie = await createPerson({ firstName: "Marie", lastName: "Curie", companyId: solveige.id }, { id: actorId });
    const gone = await createPerson({ firstName: "Parti", lastName: "Ailleurs", companyId: solveige.id }, { id: actorId });
    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, gone.id));
    const alone = await createPerson({ firstName: "Sans", lastName: "Entreprise" }, { id: actorId });
    await createPerson({ firstName: "Chez", lastName: "Ferrandi", companyId: ferrandi.id }, { id: actorId });
    await updatePerson(jean.id, { phone: "01 02 03 04 05" }, { id: actorId });

    /* Le groupe inverse dit aussi quelle fiche créer depuis ici et avec quel champ pré-rempli (« ajouter un contact », D7). */
    expect(await linkedGroups("company", solveige.id)).toEqual([
      {
        key: "person-companyId",
        label: "Contacts",
        create: { type: "person", prefill: { companyId: solveige.id } },
        records: [
          { id: jean.id, title: "Jean Dupont", href: `/personnes/${jean.id}` },
          { id: marie.id, title: "Marie Curie", href: `/personnes/${marie.id}` },
        ],
      },
      /* La société de facturation d'un consultant est une seconde relation vers l'entreprise (3.1, D4) : sa fiche porte donc aussi ce groupe, vide tant qu'elle ne facture personne. */
      { key: "person-billingCompanyId", label: "Consultants facturés", records: [] },
      { key: "opportunity-companyId", label: "Opportunités", create: { type: "opportunity", prefill: { companyId: solveige.id } }, records: [] },
    ]);
    expect(await linkedGroups("person", jean.id)).toEqual([
      { key: "person-company-companyId", label: "Entreprise", records: [{ id: solveige.id, title: "Banque Solveige", href: `/entreprises/${solveige.id}` }] },
      { key: "person-company-billingCompanyId", label: "Société de facturation", records: [] },
      { key: "opportunity-contactPersonId", label: "Opportunités", records: [] },
    ]);
    expect(await linkedGroups("person", alone.id)).toEqual([
      { key: "person-company-companyId", label: "Entreprise", records: [] },
      { key: "person-company-billingCompanyId", label: "Société de facturation", records: [] },
      { key: "opportunity-contactPersonId", label: "Opportunités", records: [] },
    ]);
    expect((await linkedGroups("company", ferrandi.id))[0].records.map((r) => r.title)).toEqual(["Chez Ferrandi"]);
  });
});

/** Une entreprise à trois cents contacts n'en affiche pas trois cents : la colonne borne sa liste et dit le reste. */
describe("colonne des liens — liste bornée (CRM-42, D4)", () => {
  it("n'affiche que les vingt dernières fiches liées et compte les autres", async () => {
    const grande = await createObject("company", { name: "Grande Maison", type: "client" }, { id: actorId });
    const total = LINKED_RECORDS_LIMIT + 3;
    for (let rang = 1; rang <= total; rang += 1) {
      await createPerson({ firstName: "Contact", lastName: `Numéro ${String(rang).padStart(2, "0")}`, companyId: grande.id }, { id: actorId });
    }
    const [contacts] = await linkedGroups("company", grande.id);
    expect(contacts.records).toHaveLength(LINKED_RECORDS_LIMIT);
    expect(contacts.more).toBe(total - LINKED_RECORDS_LIMIT);

    /* Sous la borne, rien n'est annoncé en trop. */
    const petite = await createObject("company", { name: "Petite Maison", type: "client" }, { id: actorId });
    await createPerson({ firstName: "Seul", lastName: "Contact", companyId: petite.id }, { id: actorId });
    const [peu] = await linkedGroups("company", petite.id);
    expect(peu.records).toHaveLength(1);
    expect(peu.more).toBeUndefined();
  });
});

/** D47, D65 : seuls le contact et les consultants proposés voient l'opportunité ; une autre personne n'en voit aucune. */
describe("colonne des liens — opportunités d'une personne (CRM-109, D47)", () => {
  it("une personne qui n'est ni contact ni proposée ne montre aucune opportunité, à côté d'une opportunité qui a son contact et son consultant proposé", async () => {
    const banque = await createObject("company", { name: "Banque Voisine", type: "client" }, { id: actorId });
    const contact = await createPerson({ firstName: "Léa", lastName: "Contact", companyId: banque.id }, { id: actorId });
    const proposed = (await createConsultant({ firstName: "Julie", lastName: "Martin", status: "freelance" }, { id: actorId })).id;
    const opportunityId = (await createObject("opportunity", { title: "Refonte Payroll", companyId: banque.id, contactPersonId: contact.id, modules: ["payroll"], expectedClose: "2026-10-30" }, { id: actorId })).id;
    await addProposal(opportunityId, { personId: proposed }, { id: actorId });
    const bystander = await createPerson({ firstName: "Sans", lastName: "Lien" }, { id: actorId });

    expect(await linkedGroups("person", bystander.id)).toEqual([
      { key: "person-company-companyId", label: "Entreprise", records: [] },
      { key: "person-company-billingCompanyId", label: "Société de facturation", records: [] },
      { key: "opportunity-contactPersonId", label: "Opportunités", records: [] },
    ]);
  });
});
