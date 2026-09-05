import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETE as deleteRoute, GET as readRoute, PUT as updateRoute } from "@/app/api/emails/modeles/[key]/route";
import { GET as listRoute } from "@/app/api/emails/modeles/route";
import { emailTemplate, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { HttpError } from "@/lib/auth/session";
import { closeDb, db } from "@/lib/db";
import { sendTemplatedEmail } from "@/lib/mail/send";
import { deleteTemplate, listTemplates, updateTemplate } from "@/lib/mail/templates";
import { jsonRequest, sessionCookie } from "../helpers/auth";
import { lastEmailTo } from "../helpers/mailbox";

const ADMIN = { email: "admin-modeles@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Modeles-1", role: "administrateur" as const };
const MEMBER = { email: "membre-modeles@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };

let adminCookie: string;
let memberCookie: string;

beforeAll(async () => {
  await db.delete(emailTemplate);
  await db.delete(user);
  await createUserWithPassword(ADMIN);
  await createUserWithPassword(MEMBER);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

const keyParams = (key: string) => ({ params: Promise.resolve({ key }) });
afterAll(async () => {
  await db.delete(emailTemplate);
  await closeDb();
});

describe("modèles système (CRM-23, D22)", () => {
  it("amorce « Invitation » et « Réinitialisation » à la première lecture, avec {{lien}} obligatoire, sans doublon à la lecture suivante", async () => {
    const templates = await listTemplates();
    const byKey = Object.fromEntries(templates.map((t) => [t.key, t]));
    expect(Object.keys(byKey).sort()).toEqual(["invitation", "reinitialisation"]);
    expect(byKey.invitation).toMatchObject({ isSystem: true, requiredVariables: ["lien"], subject: "Votre accès au CRM de {{cabinet}}" });
    expect(byKey.invitation.body).toContain("Bonjour {{prenom}},");
    expect(byKey.invitation.body).toContain("{{lien}}");
    expect(byKey.reinitialisation).toMatchObject({ isSystem: true, requiredVariables: ["lien"], subject: "Réinitialisation de votre mot de passe" });
    expect(byKey.reinitialisation.body).toContain("{{lien}}");
    expect(await listTemplates()).toHaveLength(2);
  });
});

describe("modèle modifié (CRM-23, contrat 28)", () => {
  it("la prochaine invitation part avec le sujet et le texte enregistrés, variables remplacées, le lien en bouton", async () => {
    await updateTemplate("invitation", {
      subject: "Bienvenue chez {{cabinet}}, {{prenom}}",
      body: "Bonjour {{prenom}} {{nom}},\n\nVotre accès au CRM de {{cabinet}} est prêt.\n\n[Ouvrir mon accès]({{lien}})\n\nÀ bientôt.",
    });
    const to = `modele-${Date.now()}@exemple.fr`;
    await sendTemplatedEmail({
      to,
      template: "invitation",
      variables: { prenom: "Ana", nom: "Martin", cabinet: "Cabinet Test", lien: "http://localhost:3000/invitation/xyz" },
    });
    const mail = await lastEmailTo(to);
    expect(mail?.subject).toBe("Bienvenue chez Cabinet Test, Ana");
    expect(mail?.body).toContain("Bonjour Ana Martin,");
    expect(mail?.body).toContain("Votre accès au CRM de Cabinet Test est prêt.");
    expect(mail?.body).toContain("Ouvrir mon accès");
    expect(mail?.body).not.toContain("{{");
    expect(mail?.links).toContain("http://localhost:3000/invitation/xyz");
    expect((await listTemplates()).find((t) => t.key === "invitation")?.subject).toBe("Bienvenue chez {{cabinet}}, {{prenom}}");
  });
});

describe("refus d'une variable inconnue (CRM-23, contrat 31)", () => {
  it("n'enregistre pas un modèle avec {{prénom}} ou {{societe}} et nomme la variable fautive", async () => {
    const before = (await listTemplates()).find((t) => t.key === "invitation")!;
    const accent = updateTemplate("invitation", { subject: before.subject, body: "Bonjour {{prénom}},\n\n[Ouvrir]({{lien}})" });
    await expect(accent).rejects.toBeInstanceOf(HttpError);
    await expect(accent).rejects.toMatchObject({ status: 400, code: "variable_inconnue", details: { variable: "prénom" }, message: expect.stringContaining("{{prénom}}") });
    const societe = updateTemplate("invitation", { subject: "Accès chez {{societe}}", body: before.body });
    await expect(societe).rejects.toMatchObject({ status: 400, code: "variable_inconnue", details: { variable: "societe" } });
    expect((await listTemplates()).find((t) => t.key === "invitation")).toMatchObject({ subject: before.subject, body: before.body });
  });
});

describe("refus d'un modèle système sans {{lien}} (CRM-23, contrat 32)", () => {
  it("n'enregistre ni « Invitation » ni « Réinitialisation » sans {{lien}}, en nommant la variable obligatoire", async () => {
    const before = (await listTemplates()).find((t) => t.key === "reinitialisation")!;
    const attempt = updateTemplate("reinitialisation", { subject: before.subject, body: "Bonjour {{prenom}},\n\nDemandez un nouveau lien au cabinet." });
    await expect(attempt).rejects.toMatchObject({ status: 400, code: "variable_obligatoire_absente", details: { variable: "lien" }, message: expect.stringContaining("{{lien}}") });
    await expect(updateTemplate("invitation", { subject: "Accès", body: "Bonjour {{prenom}}" })).rejects.toMatchObject({ code: "variable_obligatoire_absente" });
    expect((await listTemplates()).find((t) => t.key === "reinitialisation")).toMatchObject({ body: before.body });
  });
});

describe("suppression d'un modèle système (CRM-23, contrat 32)", () => {
  it("répond 409 pour « Invitation » et « Réinitialisation », qui restent en base", async () => {
    await expect(deleteTemplate("invitation")).rejects.toMatchObject({ status: 409, code: "modele_systeme" });
    await expect(deleteTemplate("reinitialisation")).rejects.toMatchObject({ status: 409, code: "modele_systeme" });
    await expect(deleteTemplate("inconnu")).rejects.toMatchObject({ status: 404 });
    expect((await listTemplates()).map((t) => t.key).sort()).toEqual(["invitation", "reinitialisation"]);
  });
});

describe("API des modèles (CRM-23, contrats 16, 31, 32)", () => {
  it("403 pour un membre ; liste et lecture pour un administrateur ; 400 nomme la variable ; 409 sur la suppression d'un modèle système", async () => {
    expect((await listRoute(jsonRequest("GET", "/api/emails/modeles", undefined, memberCookie))).status).toBe(403);
    expect((await readRoute(jsonRequest("GET", "/api/emails/modeles/invitation", undefined, memberCookie), keyParams("invitation"))).status).toBe(403);
    expect((await updateRoute(jsonRequest("PUT", "/api/emails/modeles/invitation", { subject: "x", body: "{{lien}}" }, memberCookie), keyParams("invitation"))).status).toBe(403);
    expect((await listRoute(jsonRequest("GET", "/api/emails/modeles"))).status).toBe(401);

    const list = await listRoute(jsonRequest("GET", "/api/emails/modeles", undefined, adminCookie));
    expect(list.status).toBe(200);
    const { templates } = (await list.json()) as { templates: { key: string; isSystem: boolean }[] };
    expect(templates.map((t) => t.key).sort()).toEqual(["invitation", "reinitialisation"]);

    const one = await readRoute(jsonRequest("GET", "/api/emails/modeles/reinitialisation", undefined, adminCookie), keyParams("reinitialisation"));
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({ template: { key: "reinitialisation", isSystem: true, requiredVariables: ["lien"] } });
    expect((await readRoute(jsonRequest("GET", "/api/emails/modeles/inconnu", undefined, adminCookie), keyParams("inconnu"))).status).toBe(404);

    const unknown = await updateRoute(jsonRequest("PUT", "/api/emails/modeles/invitation", { subject: "Accès", body: "Bonjour {{prénom}}\n\n{{lien}}" }, adminCookie), keyParams("invitation"));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: "variable_inconnue", variable: "prénom" });
    const missing = await updateRoute(jsonRequest("PUT", "/api/emails/modeles/invitation", { subject: "Accès", body: "Bonjour {{prenom}}" }, adminCookie), keyParams("invitation"));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: "variable_obligatoire_absente", variable: "lien" });
    const malformed = await updateRoute(jsonRequest("PUT", "/api/emails/modeles/invitation", { subject: "" }, adminCookie), keyParams("invitation"));
    expect(malformed.status).toBe(400);

    const saved = await updateRoute(jsonRequest("PUT", "/api/emails/modeles/invitation", { subject: "Accès {{cabinet}}", body: "Bonjour {{prenom}},\n\n[Ouvrir]({{lien}})" }, adminCookie), keyParams("invitation"));
    expect(saved.status).toBe(200);
    expect((await listTemplates()).find((t) => t.key === "invitation")?.subject).toBe("Accès {{cabinet}}");

    const refused = await deleteRoute(jsonRequest("DELETE", "/api/emails/modeles/invitation", undefined, adminCookie), keyParams("invitation"));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "modele_systeme" });
    expect((await deleteRoute(jsonRequest("DELETE", "/api/emails/modeles/invitation", undefined, memberCookie), keyParams("invitation"))).status).toBe(403);
  });
});
