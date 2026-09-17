import { ADMIN, MEMBER, expect, lastEmailTo, seedAccounts, test } from "./fixtures/auth";
import { insertFailedEmail } from "./helpers/mailbox";
import { parisDayFromToday } from "./helpers/paris-day";

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

test.describe("journal des envois (CRM-24, contrat 29, D23)", () => {
  test("chaque envoi a sa ligne avec destinataire, sujet, modèle, date, statut et auteur ; un échec porte son motif et « Renvoyer » ; les filtres réduisent la liste", async ({ adminPage, request }) => {
    const invitee = `invitee-journal-${Date.now()}-e2e@exemple.fr`;
    expect((await adminPage.request.post("/api/accounts", { data: { email: invitee, firstName: "Inès", lastName: "Roux", role: "membre" } })).status()).toBe(201);
    /* Depuis un contexte vierge : Better Auth exige un en-tête Origin dès qu'un cookie de session accompagne la requête. */
    expect((await request.post("/api/auth/request-password-reset", { data: { email: MEMBER.email } })).status()).toBe(200);
    const failed = { to: `echec-${Date.now()}-e2e@exemple.fr`, subject: "Relance de facture", reason: "Domaine non vérifié chez Resend" };
    await insertFailedEmail(failed);

    await adminPage.goto("/parametres/journal");
    await expect(adminPage.getByRole("heading", { level: 2, name: "Journal des envois" })).toBeVisible();
    const table = adminPage.getByRole("table", { name: "Journal des envois" });
    const invitationRow = table.getByRole("row", { name: new RegExp(invitee) });
    await expect(invitationRow).toContainText("Invitation");
    await expect(invitationRow).toContainText(`${ADMIN.firstName} ${ADMIN.lastName}`);
    await expect(invitationRow.getByText("Capturé", { exact: true })).toBeVisible();
    await expect(invitationRow).toContainText(/\d{1,2} \S+ \d{4}, \d{2}:\d{2}/);
    const resetRow = table.getByRole("row", { name: new RegExp(MEMBER.email) }).first();
    await expect(resetRow).toContainText("Réinitialisation");
    await expect(resetRow).toContainText("Système");
    const failedRow = table.getByRole("row", { name: new RegExp(failed.to) });
    await expect(failedRow.getByText("Échec", { exact: true })).toBeVisible();
    await expect(failedRow).toContainText(failed.reason);
    await expect(adminPage.getByText(/^\d+ envois?$/)).toBeVisible();

    await failedRow.getByRole("button", { name: "Renvoyer" }).click();
    await expect(adminPage.getByRole("status")).toHaveText(`Email renvoyé à ${failed.to}.`);
    await expect(table.getByRole("row", { name: new RegExp(failed.to) })).toHaveCount(2);
    await expect(table.getByRole("row", { name: new RegExp(failed.to) }).filter({ hasText: "Capturé" })).toHaveCount(1);

    const filters = adminPage.getByRole("form", { name: "Filtres du journal" });
    await filters.getByRole("combobox", { name: "Statut" }).click();
    await adminPage.getByRole("option", { name: "Échec" }).click();
    await filters.getByRole("button", { name: "Filtrer" }).click();
    await expect(table.getByRole("row", { name: new RegExp(failed.to) })).toHaveCount(1);
    await expect(table.getByRole("row", { name: new RegExp(invitee) })).toHaveCount(0);

    await filters.getByRole("combobox", { name: "Statut" }).click();
    await adminPage.getByRole("option", { name: "Tous" }).click();
    await filters.getByLabel("Type d'objet").fill("user");
    await filters.getByRole("button", { name: "Filtrer" }).click();
    await expect(table.getByRole("row", { name: new RegExp(invitee) })).toHaveCount(1);
    await expect(table.getByRole("row", { name: new RegExp(failed.to) })).toHaveCount(0);

    const tomorrow = parisDayFromToday(1);
    await filters.getByLabel("Type d'objet").fill("");
    await filters.getByLabel("Du").fill(tomorrow);
    await filters.getByRole("button", { name: "Filtrer" }).click();
    await expect(adminPage.getByText("Aucun envoi ne correspond aux filtres.")).toBeVisible();
  });

  test("un membre lit le journal mais n'a pas « Renvoyer »", async ({ memberPage }) => {
    await memberPage.goto("/parametres/journal");
    await expect(memberPage.getByRole("table", { name: "Journal des envois" })).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Renvoyer" })).toHaveCount(0);
  });
});

test.describe("envoi de test (CRM-25, contrats 30, 34, 35)", () => {
  test("un administrateur envoie un email de test à sa propre adresse : capturé et lisible dans le journal ; une adresse mal formée est refusée sous le champ", async ({ adminPage }) => {
    await adminPage.goto("/parametres/envoi-test");
    await expect(adminPage.getByRole("heading", { level: 2, name: "Envoi de test" })).toBeVisible();
    const form = adminPage.getByRole("form", { name: "Envoi de test" });
    await expect(form.getByLabel("Destinataire")).toHaveValue(ADMIN.email);

    await form.getByLabel("Destinataire").fill("pas-une-adresse");
    await form.getByRole("button", { name: "Envoyer l'email de test" }).click();
    await expect(form.getByRole("alert")).toHaveText("Cette adresse n'est pas valide.");
    await expect(form.getByLabel("Destinataire")).toHaveAttribute("aria-invalid", "true");
    expect(await lastEmailTo("pas-une-adresse")).toBeNull();

    await form.getByLabel("Destinataire").fill(ADMIN.email);
    await form.getByRole("button", { name: "Envoyer l'email de test" }).click();
    await expect(adminPage.getByRole("status")).toContainText(`Email de test capturé pour ${ADMIN.email}`);
    const mail = lastEmailTo(ADMIN.email)!;
    expect(mail.subject).toMatch(/^Email de test du CRM de .+$/);
    await adminPage.goto("/parametres/journal");
    const row = adminPage.getByRole("table", { name: "Journal des envois" }).getByRole("row", { name: new RegExp(ADMIN.email) }).first();
    await expect(row).toContainText("Email de test");
    await expect(row.getByText("Capturé", { exact: true })).toBeVisible();
  });
});

test.describe("journal à 1280 px (liste dense, fondations)", () => {
  test("avec une ligne en échec portant une référence d'objet, la page ne déborde pas, « Renvoyer » reste dans la fenêtre et la ligne tient en 36 px", async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 1280, height: 800 });
    const failed = {
      to: `echec-large-${Date.now()}-e2e@exemple.fr`,
      subject: "Relance de la facture de la mission Workday du trimestre en cours",
      reason: "Domaine non vérifié chez Resend",
      objectType: "user",
      objectId: "64978092-bc9b-4f0e-9c1d-1a2b3c4d5e6f",
    };
    await insertFailedEmail(failed);

    await adminPage.goto("/parametres/journal");
    const table = adminPage.getByRole("table", { name: "Journal des envois" });
    const row = table.getByRole("row", { name: new RegExp(failed.to) });
    await expect(row).toBeVisible();

    const { scrollWidth, clientWidth } = await adminPage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(scrollWidth, "largeur de la page").toBeLessThanOrEqual(clientWidth);
    const button = (await row.getByRole("button", { name: "Renvoyer" }).boundingBox())!;
    expect(button.x + button.width, "« Renvoyer » dans la fenêtre").toBeLessThanOrEqual(1280);
    expect((await row.boundingBox())!.height, "hauteur de la ligne").toBeLessThanOrEqual(36);
    /* Motif et référence d'objet tronqués, texte complet en infobulle. */
    await expect(row.getByTitle(failed.reason)).toHaveCount(1);
    await expect(row.getByTitle(`${failed.objectType} ${failed.objectId}`)).toHaveCount(1);
  });
});

test.describe("écrans à 375 px (contrat 25)", () => {
  test("cabinet, modèles, journal et envoi de test n'ont aucun défilement horizontal, un seul h1, et leur action principale est visible", async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 375, height: 800 });
    const noOverflow = async (label: string) => {
      await expect(adminPage.getByRole("heading", { level: 1 })).toHaveCount(1);
      const overflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, label).toBe(0);
      /* Un texte tronqué par des points de suspension ne défile pas : il n'est pas un débordement. */
      const wider = await adminPage.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((el) => el.clientWidth > 1 && el.scrollWidth > el.clientWidth + 1)
          .filter((el) => getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).textOverflow !== "ellipsis")
          .map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`),
      );
      expect(wider, label).toEqual([]);
    };

    await adminPage.goto("/parametres/cabinet");
    await noOverflow("cabinet");
    await expect(adminPage.getByRole("form", { name: "Cabinet" }).getByRole("button", { name: "Enregistrer" })).toBeInViewport();

    await adminPage.goto("/parametres/modeles");
    await noOverflow("modèles");
    await adminPage.getByRole("button", { name: "Modifier Invitation" }).click();
    await expect(adminPage.getByRole("form", { name: "Modèle Invitation" })).toBeVisible();
    await noOverflow("modèles, éditeur ouvert");

    await adminPage.goto("/parametres/journal");
    await expect(adminPage.getByRole("list", { name: "Journal des envois" })).toBeVisible();
    await expect(adminPage.getByRole("table", { name: "Journal des envois" })).toBeHidden();
    await noOverflow("journal");
    await expect(adminPage.getByRole("form", { name: "Filtres du journal" }).getByRole("button", { name: "Filtrer" })).toBeInViewport();

    await adminPage.goto("/parametres/envoi-test");
    await noOverflow("envoi de test");
    await expect(adminPage.getByRole("form", { name: "Envoi de test" }).getByRole("button", { name: "Envoyer l'email de test" })).toBeInViewport();
  });
});
