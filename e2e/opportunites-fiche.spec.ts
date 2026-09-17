import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetOpportunities } from "./fixtures/opportunites";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les opportunités d'abord : elles retiennent leur entreprise. */
function resetAll() {
  resetOpportunities();
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
});
