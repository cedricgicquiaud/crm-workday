import type { Page } from "@playwright/test";
import { expect, MEMBER, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { pickOption } from "./fixtures/opportunites";
import { archiveCompany, resetPersons } from "./fixtures/personnes";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les opportunités et les personnes d'abord (`resetPersons` efface les opportunités avant elles) : elles retiennent leur entreprise. */
function resetAll() {
  resetPersons();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
test.beforeEach(resetAll);
test.afterAll(resetAll);

async function post(page: Page, url: string, data: Record<string, unknown>): Promise<string> {
  const created = await page.request.post(url, { data });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/** Une entreprise et une opportunité à ses quatre champs obligatoires, créées par l'API. */
async function createOpportunity(page: Page, mark: string, extra: Record<string, unknown> = {}): Promise<string> {
  const companyId = await post(page, "/api/entreprises", { name: named("Banque X", mark), type: "prospect" });
  return post(page, "/api/opportunites", { title: named("Refonte Payroll", mark), companyId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30", ...extra });
}

/** Attend la réponse de l'écriture déclenchée par `action` : deux écritures enchaînées sans l'attendre rendent le test instable. */
async function saved(page: Page, id: string, action: () => Promise<void>) {
  await Promise.all([page.waitForResponse((res) => res.url().includes(`/api/opportunites/${id}`) && res.request().method() === "PATCH"), action()]);
}

test.describe("montant estimé sur la fiche (CRM-103, contrat 33)", () => {
  test("pose un TJM de 650 et une durée de 60 jours : le montant se lit « 39 000,00 € », le TJM « 650,00 € » hors saisie ; vider la durée ramène « — »", async ({ memberPage }) => {
    const id = await createOpportunity(memberPage, tag());
    await memberPage.goto(`/opportunites/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });

    await saved(memberPage, id, async () => {
      await fields.getByLabel("TJM de vente cible").fill("650");
      await memberPage.keyboard.press("Enter");
    });
    await saved(memberPage, id, async () => {
      await fields.getByLabel("Durée estimée").fill("60");
      await memberPage.keyboard.press("Enter");
    });
    await expect(fields.getByLabel("Montant estimé")).toHaveText("39 000,00 €");
    /* Le montant se lit, il ne se saisit pas. */
    await expect(fields.getByRole("textbox", { name: "Montant estimé" })).toHaveCount(0);
    await expect(fields.getByRole("spinbutton", { name: "Montant estimé" })).toHaveCount(0);

    /* Hors saisie, le TJM se lit au format français ; la valeur brute revient au focus. */
    const rate = fields.getByLabel("TJM de vente cible");
    await expect(rate).toHaveValue("650,00 €");
    await rate.focus();
    await expect(rate).toHaveValue("650");
    await rate.blur();

    await saved(memberPage, id, async () => {
      await fields.getByLabel("Durée estimée").focus();
      await fields.getByLabel("Durée estimée").fill("");
      await memberPage.keyboard.press("Enter");
    });
    await expect(fields.getByLabel("Montant estimé")).toHaveText("—");
  });
});

test.describe("étape et probabilité sur la fiche (CRM-105, contrats 34 et 40)", () => {
  test("le sélecteur d'étape ne propose ni Gagnée ni Perdue ; passer à « Entretien client » puis revenir à « Qualifié » fait lire 50 % puis 20 %, et l'historique montre les deux passages, sans ligne de probabilité", async ({ memberPage }) => {
    const id = await createOpportunity(memberPage, tag());
    await memberPage.goto(`/opportunites/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    const stage = fields.getByRole("combobox", { name: "Étape" });
    const probability = fields.getByLabel("Probabilité");
    await expect(probability).toHaveText("10 %");
    /* La probabilité se lit, elle ne se saisit pas. */
    await expect(fields.getByRole("spinbutton", { name: "Probabilité" })).toHaveCount(0);

    await stage.click();
    await expect(memberPage.getByRole("option")).toHaveText(["Nouveau besoin", "Qualifié", "Profils proposés", "Entretien client", "Proposition envoyée", "Négociation"]);
    await memberPage.keyboard.press("Escape");

    await saved(memberPage, id, () => pickOption(memberPage, stage, "Entretien client"));
    await expect(probability).toHaveText("50 %");
    await saved(memberPage, id, () => pickOption(memberPage, stage, "Qualifié"));
    await expect(probability).toHaveText("20 %");

    await memberPage.reload();
    await expect(stage).toContainText("Qualifié");
    const history = memberPage.getByRole("region", { name: "Fil d'activité" });
    for (const line of ["Étape : Nouveau besoin → Entretien client", "Étape : Entretien client → Qualifié"]) {
      const entry = history.getByRole("listitem").filter({ hasText: line });
      await expect(entry).toHaveCount(1);
      await expect(entry).toContainText(new RegExp(`${MEMBER.firstName} ${MEMBER.lastName} · \\d{1,2} \\S+ \\d{4}, \\d{2}:\\d{2}`));
    }
    await expect(history.getByText("Probabilité :")).toHaveCount(0);
  });
});

test.describe("champs obligatoires vidés sur la fiche (CRM-103, contrat 39)", () => {
  test("vider le titre ou la clôture prévue affiche le refus sous le champ, et la valeur enregistrée revient", async ({ memberPage }) => {
    const mark = tag();
    const id = await createOpportunity(memberPage, mark);
    await memberPage.goto(`/opportunites/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });

    const title = fields.getByLabel("Titre");
    await saved(memberPage, id, async () => {
      await title.fill("");
      await memberPage.keyboard.press("Enter");
    });
    await expect(fields.getByRole("alert")).toHaveText("« Titre » est obligatoire.");
    await expect(title).toHaveValue(named("Refonte Payroll", mark));

    const close = fields.getByLabel("Clôture prévue");
    await saved(memberPage, id, async () => {
      await close.fill("");
      await close.blur();
    });
    await expect(fields.getByRole("alert").filter({ hasText: "Clôture prévue" })).toHaveText("« Clôture prévue » est obligatoire.");
    await expect(close).toHaveValue("2026-10-30");
  });

  test("vider l'entreprise affiche le refus sous le champ, et l'entreprise enregistrée revient", async ({ memberPage }) => {
    const mark = tag();
    const id = await createOpportunity(memberPage, mark);
    await memberPage.goto(`/opportunites/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    const company = fields.getByRole("combobox", { name: "Entreprise" });

    await saved(memberPage, id, () => pickOption(memberPage, company, "—"));
    await expect(fields.getByRole("alert")).toHaveText("« Entreprise » est obligatoire.");
    await expect(company).toContainText(named("Banque X", mark));
  });
});

test.describe("modules Workday sur la fiche (CRM-103, contrat 39)", () => {
  test("décocher le dernier module affiche le refus sous la liste, et la case revient cochée", async ({ memberPage }) => {
    const id = await createOpportunity(memberPage, tag(), { modules: ["payroll"] });
    await memberPage.goto(`/opportunites/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    const modules = fields.getByRole("group", { name: "Modules Workday" });

    await saved(memberPage, id, async () => {
      await modules.getByRole("checkbox", { name: "Payroll", exact: true }).click();
      await memberPage.keyboard.press("Enter");
    });
    await expect(fields.getByRole("alert")).toHaveText("« Modules Workday » est obligatoire.");
    await expect(modules.getByRole("checkbox", { name: "Payroll", exact: true })).toBeChecked();
  });

  test("cocher HCM puis quitter la liste enregistre les modules en un geste, relus après rechargement", async ({ memberPage }) => {
    const id = await createOpportunity(memberPage, tag(), { modules: ["payroll"] });
    await memberPage.goto(`/opportunites/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    const modules = fields.getByRole("group", { name: "Modules Workday" });

    await saved(memberPage, id, async () => {
      await modules.getByRole("checkbox", { name: "HCM", exact: true }).click();
      await fields.getByLabel("TJM de vente cible").focus();
    });
    await memberPage.reload();
    await expect(modules.getByRole("checkbox", { name: "HCM", exact: true })).toBeChecked();
    await expect(modules.getByRole("checkbox", { name: "Payroll", exact: true })).toBeChecked();
    await expect(fields.getByRole("alert")).toHaveCount(0);
  });
});

test.describe("« Ajouter une opportunité » depuis une entreprise (CRM-104, contrat 32)", () => {
  test("la colonne des liens de Banque X ouvre la création avec Banque X pré-remplie ; l'entreprise se change avant de créer", async ({ memberPage }) => {
    const mark = tag();
    const bank = named("Banque X", mark);
    const acme = named("Acme", mark);
    const bankId = await post(memberPage, "/api/entreprises", { name: bank, type: "prospect" });
    const acmeId = await post(memberPage, "/api/entreprises", { name: acme, type: "prospect" });

    await memberPage.goto(`/entreprises/${bankId}`);
    await memberPage.getByRole("region", { name: "Liens" }).getByRole("region", { name: "Opportunités" }).getByRole("button", { name: "Ajouter une opportunité" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle opportunité" });
    const company = dialog.getByRole("combobox", { name: "Entreprise" });
    await expect(company).toContainText(bank);

    await pickOption(memberPage, company, acme);
    await dialog.getByLabel("Titre").fill(named("Refonte Payroll", mark));
    await dialog.getByRole("group", { name: "Modules Workday" }).getByRole("checkbox", { name: "Payroll", exact: true }).click();
    await dialog.getByLabel("Clôture prévue").fill("2026-10-30");
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(memberPage).toHaveURL(/\/opportunites\/[0-9a-f-]{36}$/);
    const id = memberPage.url().split("/").pop()!;
    expect(((await (await memberPage.request.get(`/api/opportunites/${id}`)).json()) as Record<string, unknown>).companyId).toBe(acmeId);
  });
});

test.describe("entreprise et contact dans « Champs » (CRM-104, contrat 35)", () => {
  test("le contact se choisit parmi les seuls contacts de Banque X ; passer l'entreprise à Acme vide le contact, et l'historique garde « Julie Martin »", async ({ memberPage }) => {
    const mark = tag();
    const bank = named("Banque X", mark);
    const acme = named("Acme", mark);
    const bankId = await post(memberPage, "/api/entreprises", { name: bank, type: "prospect" });
    const acmeId = await post(memberPage, "/api/entreprises", { name: acme, type: "prospect" });
    const julie = `Julie Martin${mark}`;
    await post(memberPage, "/api/personnes", { firstName: "Julie", lastName: `Martin${mark}`, companyId: bankId });
    await post(memberPage, "/api/personnes", { firstName: "Marc", lastName: `Acme${mark}`, companyId: acmeId });
    const id = await post(memberPage, "/api/opportunites", { title: named("Refonte Payroll", mark), companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30" });

    await memberPage.goto(`/opportunites/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    const contact = fields.getByRole("combobox", { name: "Contact" });
    await contact.click();
    await expect(memberPage.getByRole("option", { name: `Marc Acme${mark}` })).toHaveCount(0);
    await saved(memberPage, id, () => memberPage.getByRole("option", { name: julie, exact: true }).click());
    await expect(contact).toContainText(julie);

    await saved(memberPage, id, () => pickOption(memberPage, fields.getByRole("combobox", { name: "Entreprise" }), acme));
    await expect(fields.getByRole("combobox", { name: "Entreprise" })).toContainText(acme);
    await expect(contact).not.toContainText(julie);
    await expect(memberPage.getByRole("region", { name: "Fil d'activité" }).getByText(`Contact : ${julie} → vide`)).toBeVisible();
  });
});

test.describe("sélecteur de contact borné (CRM-104, D35)", () => {
  test("une entreprise à 201 contacts en propose 200 et annonce « et 1 autre »", async ({ memberPage }) => {
    test.setTimeout(120_000);
    const mark = tag();
    const bankId = await post(memberPage, "/api/entreprises", { name: named("Grande Banque", mark), type: "prospect" });
    for (let rank = 1; rank <= 201; rank += 1) await post(memberPage, "/api/personnes", { firstName: "Contact", lastName: `N${rank}${mark}`, companyId: bankId });
    const id = await post(memberPage, "/api/opportunites", { title: named("Refonte Payroll", mark), companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30" });

    await memberPage.goto(`/opportunites/${id}`);
    await expect(memberPage.getByRole("region", { name: "Champs", exact: true }).getByText("et 1 autre", { exact: true })).toBeVisible();
  });
});

test.describe("fiches liées qui ont changé (CRM-104, contrat 41)", () => {
  test("un contact passé chez Acme se lit « a quitté Banque X », et Banque X archivée ensuite se lit « archivée »", async ({ memberPage }) => {
    const mark = tag();
    const bank = named("Banque X", mark);
    const bankId = await post(memberPage, "/api/entreprises", { name: bank, type: "prospect" });
    const acmeId = await post(memberPage, "/api/entreprises", { name: named("Acme", mark), type: "prospect" });
    const julieId = await post(memberPage, "/api/personnes", { firstName: "Julie", lastName: `Martin${mark}`, companyId: bankId });
    const id = await post(memberPage, "/api/opportunites", { title: named("Refonte Payroll", mark), companyId: bankId, contactPersonId: julieId, modules: ["payroll"], expectedClose: "2026-10-30" });
    expect((await memberPage.request.patch(`/api/personnes/${julieId}`, { data: { companyId: acmeId } })).status()).toBe(200);
    archiveCompany(bankId);

    await memberPage.goto(`/opportunites/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    await expect(fields.getByRole("combobox", { name: "Contact" })).toContainText(`Julie Martin${mark} (a quitté ${bank})`);
    await expect(fields.getByRole("combobox", { name: "Entreprise" })).toContainText(`${bank} (archivée)`);
  });
});

