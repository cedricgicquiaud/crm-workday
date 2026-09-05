import { expect, lastEmailTo, seedAccounts, test } from "./fixtures/auth";

test.beforeAll(() => seedAccounts());

const CABINET = { name: "Cabinet Martin", senderName: "Cabinet Martin", senderEmail: "contact@cabinet-martin.fr" };

test.describe("accès administrateur / membre (CRM-25, contrat 16)", () => {
  test("un membre qui ouvre cabinet, modèles ou envoi de test est renvoyé vers Accueil et l'API répond 403 ; le journal s'ouvre pour lui", async ({ memberPage }) => {
    for (const path of ["/parametres/cabinet", "/parametres/modeles", "/parametres/envoi-test"]) {
      await memberPage.goto(path);
      await expect(memberPage, path).toHaveURL(/\/accueil$/);
    }
    expect((await memberPage.request.get("/api/cabinet")).status()).toBe(403);
    expect((await memberPage.request.get("/api/emails/modeles")).status()).toBe(403);
    expect((await memberPage.request.post("/api/emails/test", { data: {} })).status()).toBe(403);
    await memberPage.goto("/parametres/journal");
    await expect(memberPage).toHaveURL(/\/parametres\/journal$/);
    await expect(memberPage.getByRole("heading", { level: 2, name: "Journal des envois" })).toBeVisible();
  });
});

test.describe("paramètres du cabinet (CRM-22, contrat 27)", () => {
  test("un administrateur renseigne le cabinet et l'expéditeur ; une adresse mal formée est refusée sous le champ ; la prochaine invitation part avec ce nom", async ({ adminPage }) => {
    await adminPage.goto("/parametres/cabinet");
    await expect(adminPage.getByRole("heading", { level: 2, name: "Cabinet" })).toBeVisible();
    const form = adminPage.getByRole("form", { name: "Cabinet" });
    await form.getByLabel("Nom du cabinet").fill(CABINET.name);
    await form.getByLabel("Nom d'affichage de l'expéditeur").fill(CABINET.senderName);
    await form.getByLabel("Adresse d'expédition").fill("pas-une-adresse");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByText("Cette adresse n'est pas valide.")).toBeVisible();
    await expect(form.getByLabel("Adresse d'expédition")).toHaveAttribute("aria-invalid", "true");

    await form.getByLabel("Adresse d'expédition").fill(CABINET.senderEmail);
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(adminPage.getByRole("status")).toHaveText("Paramètres du cabinet enregistrés.");
    await adminPage.reload();
    await expect(form.getByLabel("Nom du cabinet")).toHaveValue(CABINET.name);
    await expect(form.getByLabel("Adresse d'expédition")).toHaveValue(CABINET.senderEmail);

    const invitee = `invitee-cabinet-${Date.now()}-e2e@exemple.fr`;
    expect((await adminPage.request.post("/api/accounts", { data: { email: invitee, firstName: "Inès", lastName: "Roux", role: "membre" } })).status()).toBe(201);
    expect(lastEmailTo(invitee)!.subject).toBe(`Votre accès au CRM de ${CABINET.name}`);
  });
});
