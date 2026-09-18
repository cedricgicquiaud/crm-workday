import type { Locator, Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetCustomFields } from "./fixtures/champs";
import { resetLeads } from "./fixtures/leads";
import { resetObjects } from "./fixtures/objets";
import { resetOpportunities } from "./fixtures/opportunites";
import { resetPersons } from "./fixtures/personnes";
import { parisDayFromToday } from "./helpers/paris-day";

/* Leads, personnes, entreprises et opportunités portent un nom qui finit par « (e2e) » ou sont créés par un compte e2e : les fixtures les effacent, et rien d'autre. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les enfants avant les parents : une opportunité retient son lead, son contact et son entreprise ; un lead converti retient sa personne et son entreprise. */
function resetAll() {
  resetCustomFields();
  resetOpportunities();
  resetLeads();
  resetPersons();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
test.beforeEach(resetAll);
test.afterAll(resetAll);

async function createLead(page: Page, data: Record<string, unknown>): Promise<string> {
  const created = await page.request.post("/api/leads", { data });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function openConversion(page: Page, id: string) {
  await page.goto(`/leads/${id}`);
  await Promise.all([page.waitForResponse((res) => res.url().includes(`/api/leads/${id}/conversion`) && res.request().method() === "GET"), page.getByRole("button", { name: "Convertir" }).click()]);
  const dialog = page.getByRole("dialog", { name: "Convertir le lead" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Confirme la fenêtre et attend la réponse de la conversion. */
async function confirm(page: Page, id: string, dialog: Locator) {
  await Promise.all([page.waitForResponse((res) => res.url().includes(`/api/leads/${id}/conversion`) && res.request().method() === "POST"), dialog.getByRole("button", { name: "Convertir", exact: true }).click()]);
}

const opportunityBox = (dialog: Locator) => dialog.getByRole("checkbox", { name: "Créer une opportunité" });
/* Le refus sous le champ fait partie de son libellé : le nom accessible commence par « Titre ». */
const titleInput = (dialog: Locator) => dialog.getByRole("textbox", { name: /^Titre/ });
const closeInput = (dialog: Locator) => dialog.getByLabel("Clôture prévue");

test.describe("convertir un lead qualifié en opportunité (CRM-111, CRM-114, contrat 55)", () => {
  test("case cochée et titre pré-rempli ; HCM et une clôture : l'opportunité « Qualifié » existe, le bandeau et les liens du lead la montrent, elle montre « Issu du lead »", async ({ memberPage }) => {
    const mark = tag();
    const company = named("Banque X", mark);
    const id = await createLead(memberPage, { firstName: "Julie", lastName: "Martin", companyName: company, need: "Déploiement HCM pour 3 000 salariés", origin: "linkedin" });
    expect((await memberPage.request.patch(`/api/leads/${id}`, { data: { stage: "qualifie" } })).status()).toBe(200);

    const dialog = await openConversion(memberPage, id);
    await expect(opportunityBox(dialog)).toBeChecked();
    await expect(titleInput(dialog)).toHaveValue(`Besoin Workday · ${company}`);
    await dialog.getByRole("checkbox", { name: "HCM", exact: true }).click();
    await closeInput(dialog).fill(parisDayFromToday(60));
    await confirm(memberPage, id, dialog);
    await expect(dialog).toHaveCount(0);

    const title = `Besoin Workday · ${company}`;
    const banner = memberPage.getByRole("status").filter({ hasText: "Converti le" });
    await expect(banner.getByRole("link", { name: title })).toBeVisible();
    await expect(memberPage.getByRole("region", { name: "Opportunité", exact: true }).getByRole("link", { name: title })).toBeVisible();
    await expect(memberPage.getByRole("region", { name: "Fil d'activité" }).getByText(`Converti en Julie Martin · ${company} · ${title}`)).toBeVisible();

    await Promise.all([memberPage.waitForURL(/\/opportunites\//), banner.getByRole("link", { name: title }).click()]);
    await expect(memberPage.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(memberPage.getByRole("region", { name: "Issu du lead" }).getByRole("link", { name: `Julie Martin · ${company}` })).toBeVisible();
    await expect(memberPage.getByRole("region", { name: "Champs", exact: true }).getByText("Qualifié", { exact: true })).toBeVisible();
  });

  test("case cochée sans titre, sans module et sans clôture prévue : chaque refus s'affiche sous son champ, la saisie reste, et le lead n'est pas converti (contrat 58)", async ({ memberPage }) => {
    const mark = tag();
    const id = await createLead(memberPage, { firstName: "Julie", lastName: "Martin", companyName: named("Banque Refus", mark), need: "Paie", origin: "linkedin" });

    const dialog = await openConversion(memberPage, id);
    await titleInput(dialog).fill("");
    await confirm(memberPage, id, dialog);

    await expect(dialog.getByRole("alert")).toHaveText(["« Titre » est obligatoire.", "« Modules Workday » est obligatoire.", "« Clôture prévue » est obligatoire."]);
    await expect(titleInput(dialog)).toHaveValue("");
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(memberPage.getByText("Avancement : Nouveau")).toBeVisible();
  });
});

test.describe("convertir en gardant une entreprise existante (CRM-112, contrat 56)", () => {
  test("le titre suit le choix d'entreprise tant qu'on ne l'a pas modifié ; « garder Acme » crée l'opportunité chez Acme", async ({ memberPage }) => {
    const mark = tag();
    const acmeName = named("Acme", mark);
    const acme = await memberPage.request.post("/api/entreprises", { data: { name: acmeName, type: "client" } });
    expect(acme.status()).toBe(201);
    const { id: acmeId } = (await acme.json()) as { id: string };
    const address = `yves.${mark}@acme.fr`;
    expect((await memberPage.request.post("/api/personnes", { data: { firstName: "Yves", lastName: named("Garnier", mark), email: address, companyId: acmeId } })).status()).toBe(201);
    const bankName = named("Banque Garde", mark);
    const id = await createLead(memberPage, { companyName: bankName, email: address, need: "Paie", origin: "recommandation" });

    const dialog = await openConversion(memberPage, id);
    await dialog.getByRole("radio", { name: `Garder « ${acmeName} »` }).check();
    await expect(titleInput(dialog)).toHaveValue(`Besoin Workday · ${acmeName}`);
    await dialog.getByRole("radio", { name: "Passer à l'entreprise du lead" }).check();
    await expect(titleInput(dialog)).toHaveValue(`Besoin Workday · ${bankName}`);

    /* Modifié à la main, le titre ne suit plus l'entreprise. */
    await titleInput(dialog).fill(`Refonte Payroll ${mark} (e2e)`);
    await dialog.getByRole("radio", { name: `Garder « ${acmeName} »` }).check();
    await expect(titleInput(dialog)).toHaveValue(`Refonte Payroll ${mark} (e2e)`);

    await dialog.getByRole("checkbox", { name: "Payroll", exact: true }).click();
    await closeInput(dialog).fill(parisDayFromToday(30));
    await confirm(memberPage, id, dialog);
    await expect(dialog).toHaveCount(0);

    const banner = memberPage.getByRole("status").filter({ hasText: "Converti le" });
    await Promise.all([memberPage.waitForURL(/\/opportunites\//), banner.getByRole("link", { name: `Refonte Payroll ${mark} (e2e)` }).click()]);
    await expect(memberPage.getByRole("region", { name: "Entreprise", exact: true }).getByRole("link", { name: acmeName })).toBeVisible();
  });
});
