import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { linkedGroups } from "@/features/objects/links-column";
import { createObject } from "@/features/objects/service";
import { createPerson, updatePerson } from "@/features/persons/persons";
import { closeDb, db } from "@/lib/db";

const ACTOR = { email: "acteur-liens@exemple.fr", firstName: "Nora", lastName: "Blanc", password: "MotDePasse-Liens-1", role: "membre" as const };
let actorId: string;

async function cleanup() {
  await db.delete(auditLog);
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

    expect(await linkedGroups("company", solveige.id)).toEqual([
      {
        key: "person-companyId",
        label: "Contacts",
        records: [
          { id: jean.id, title: "Jean Dupont", href: `/personnes/${jean.id}` },
          { id: marie.id, title: "Marie Curie", href: `/personnes/${marie.id}` },
        ],
      },
    ]);
    expect(await linkedGroups("person", jean.id)).toEqual([{ key: "person-company-companyId", label: "Entreprise", records: [{ id: solveige.id, title: "Banque Solveige", href: `/entreprises/${solveige.id}` }] }]);
    expect(await linkedGroups("person", alone.id)).toEqual([{ key: "person-company-companyId", label: "Entreprise", records: [] }]);
    expect((await linkedGroups("company", ferrandi.id))[0].records.map((r) => r.title)).toEqual(["Chez Ferrandi"]);
  });
});
