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

test.describe("modèles d'emails (CRM-23, contrats 28, 31, 32)", () => {
  test("modifier « Invitation » met l'aperçu à jour ; une variable inconnue ou {{lien}} absent est refusé sous le champ ; la prochaine invitation part avec le texte", async ({ adminPage }) => {
    const { template: original } = (await (await adminPage.request.get("/api/emails/modeles/invitation")).json()) as { template: { subject: string; body: string } };
    try {
      await adminPage.goto("/parametres/modeles");
      await expect(adminPage.getByRole("heading", { level: 2, name: "Modèles d'emails" })).toBeVisible();
      const list = adminPage.getByRole("list", { name: "Modèles d'emails" });
      await expect(list.getByRole("listitem")).toHaveCount(2);
      await expect(list.getByRole("listitem").filter({ hasText: "Invitation" }).getByText("Système")).toBeVisible();
      await list.getByRole("button", { name: "Modifier Invitation" }).click();

      const editor = adminPage.getByRole("form", { name: "Modèle Invitation" });
      await expect(editor.getByLabel("Sujet")).toHaveValue(original.subject);
      const variables = adminPage.getByRole("list", { name: "Variables disponibles" });
      for (const name of ["{{prenom}}", "{{nom}}", "{{cabinet}}", "{{lien}}"]) await expect(variables.getByText(name, { exact: true })).toBeVisible();

      await editor.getByLabel("Corps").fill("Bonjour {{prenom}} {{nom}},\n\nBienvenue au CRM de {{cabinet}}.\n\n[Ouvrir mon accès]({{lien}})");
      const preview = adminPage.frameLocator('iframe[title="Aperçu du modèle"]');
      await expect(preview.getByText(/^Bienvenue au CRM de .+\.$/)).toBeVisible();
      await expect(preview.getByRole("link", { name: "Ouvrir mon accès" })).toBeVisible();
      await expect(preview.getByText(/^Bonjour \S+ \S+,$/)).toBeVisible();

      await editor.getByLabel("Corps").fill("Bonjour {{prénom}},\n\n[Ouvrir]({{lien}})");
      await editor.getByRole("button", { name: "Enregistrer" }).click();
      await expect(editor.getByRole("alert")).toContainText("La variable {{prénom}} n'existe pas.");
      await expect(editor.getByLabel("Corps")).toHaveAttribute("aria-invalid", "true");
      await editor.getByLabel("Corps").fill("Bonjour {{prenom}},");
      await editor.getByRole("button", { name: "Enregistrer" }).click();
      await expect(editor.getByRole("alert")).toContainText("Ce modèle doit contenir la variable {{lien}}.");

      await editor.getByLabel("Sujet").fill("Bienvenue chez {{cabinet}}, {{prenom}}");
      await editor.getByLabel("Corps").fill("Bonjour {{prenom}} {{nom}},\n\nBienvenue au CRM de {{cabinet}}.\n\n[Ouvrir mon accès]({{lien}})");
      await editor.getByRole("button", { name: "Enregistrer" }).click();
      await expect(adminPage.getByRole("status")).toHaveText("Modèle « Invitation » enregistré.");

      const { settings } = (await (await adminPage.request.get("/api/cabinet")).json()) as { settings: { name: string } | null };
      const cabinet = settings?.name ?? "votre cabinet";
      const invitee = `invitee-modele-${Date.now()}-e2e@exemple.fr`;
      expect((await adminPage.request.post("/api/accounts", { data: { email: invitee, firstName: "Inès", lastName: "Roux", role: "membre" } })).status()).toBe(201);
      expect(lastEmailTo(invitee)!.subject).toBe(`Bienvenue chez ${cabinet}, Inès`);

      await expect(list.getByRole("button", { name: /Supprimer/ })).toHaveCount(0);
      expect((await adminPage.request.delete("/api/emails/modeles/invitation")).status()).toBe(409);
    } finally {
      expect((await adminPage.request.put("/api/emails/modeles/invitation", { data: original })).status()).toBe(200);
    }
  });
});
