import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { GET as getOptions } from "@/app/api/objets/[type]/options/route";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-options@exemple.fr", firstName: "Alix", lastName: "Perrin", password: "MotDePasse-Options-1", role: "membre" as const };

let memberCookie: string;

const byType = (type: string) => ({ params: Promise.resolve({ type }) });

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await createUserWithPassword(MEMBER);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Source des fiches proposées par un sélecteur de relation (D7) : un dialogue qui lirait la liste
 * complète d'un objet chargerait toutes ses fiches avec toutes leurs colonnes à chaque ouverture.
 * Route générique : elle ne connaît que la clé d'objet du registre (CRM-33, D4).
 */
describe("API générique des options d'un sélecteur (CRM-42, D7, D24)", () => {
  it("rend l'identifiant et le titre des fiches actives, sans leurs autres colonnes ; jamais une archivée ; type inconnu → 404 ; sans session → 401", async () => {
    const created = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Options SAS", type: "client", siren: "552081317" }, memberCookie));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const hidden = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Rangée SA", type: "client" }, memberCookie));
    const { id: hiddenId } = (await hidden.json()) as { id: string };
    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, hiddenId));

    const res = await getOptions(jsonRequest("GET", "/api/objets/company/options", undefined, memberCookie), byType("company"));
    expect(res.status).toBe(200);
    const { options } = (await res.json()) as { options: { id: string; name: string }[] };
    expect(options).toContainEqual({ id, name: "Options SAS" });
    /* Ni le SIREN ni les autres colonnes ne traversent : un sélecteur n'a besoin que du titre. */
    expect(Object.keys(options[0]).sort()).toEqual(["id", "name"]);
    expect(options.map((option) => option.id)).not.toContain(hiddenId);

    expect((await getOptions(jsonRequest("GET", "/api/objets/inconnu/options", undefined, memberCookie), byType("inconnu"))).status).toBe(404);
    expect((await getOptions(jsonRequest("GET", "/api/objets/company/options"), byType("company"))).status).toBe(401);
  });
});
