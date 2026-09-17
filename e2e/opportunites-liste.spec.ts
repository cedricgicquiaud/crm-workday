import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { pickOption, resetOpportunities, setStage } from "./fixtures/opportunites";

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

test.describe("montant estimé dans la liste (CRM-103, contrat 33)", () => {
  test("écrit « 39 000,00 € » sur la ligne d'une opportunité à 650 € par jour sur 60 jours", async ({ memberPage }) => {
    const mark = tag();
    const companyId = await post(memberPage, "/api/entreprises", { name: named("Banque X", mark), type: "prospect" });
    const title = named("Refonte Payroll", mark);
    await post(memberPage, "/api/opportunites", { title, companyId, modules: ["payroll"], expectedClose: "2026-10-30", targetDailyRate: 650, estimatedDays: 60 });

    await memberPage.goto("/opportunites");
    const row = memberPage.getByRole("table", { name: "Opportunités" }).getByRole("row").filter({ has: memberPage.getByRole("link", { name: title }) });
    await expect(row).toContainText("39 000,00 €");
  });
});

test.describe("création rapide depuis la liste (CRM-104, contrat 31)", () => {
  test("« Nouvelle opportunité » ouvre la création à quatre champs ; « Refonte Payroll » chez Banque X, HCM et Payroll, clôture au 30 octobre : la fiche s'ouvre, Marc Leroy en responsable, à l'étape « Nouveau besoin »", async ({ memberPage }) => {
    const mark = tag();
    const bank = named("Banque X", mark);
    await post(memberPage, "/api/entreprises", { name: bank, type: "prospect" });
    const title = named("Refonte Payroll", mark);

    await memberPage.goto("/opportunites");
    await memberPage.getByRole("button", { name: "Nouvelle opportunité" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle opportunité" });
    await dialog.getByLabel("Titre").fill(title);
    await pickOption(memberPage, dialog.getByRole("combobox", { name: "Entreprise" }), bank);
    const modules = dialog.getByRole("group", { name: "Modules Workday" });
    await modules.getByRole("checkbox", { name: "HCM", exact: true }).click();
    await modules.getByRole("checkbox", { name: "Payroll", exact: true }).click();
    await dialog.getByLabel("Clôture prévue").fill("2026-10-30");
    /* Quatre champs, rien d'autre : le reste se règle sur la fiche (D34). */
    await expect(dialog.locator("label, [id$='-label']")).toHaveText(["Titre", "Entreprise", "Modules Workday", "Clôture prévue"]);
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(memberPage).toHaveURL(/\/opportunites\/[0-9a-f-]{36}$/);
    await expect(memberPage.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(memberPage.getByText("responsable : Marc Leroy")).toBeVisible();
    /* Contrat 31 : la fiche s'ouvre à 10 %, la probabilité de « Nouveau besoin » (CRM-105). */
    await expect(memberPage.getByRole("region", { name: "Champs", exact: true }).getByLabel("Probabilité")).toHaveText("10 %");
    const id = memberPage.url().split("/").pop()!;
    const created = (await (await memberPage.request.get(`/api/opportunites/${id}`)).json()) as Record<string, unknown>;
    expect(created).toMatchObject({ stage: "nouveau_besoin", modules: ["hcm", "payroll"], expectedClose: "2026-10-30", companyIdLabel: bank });
  });
});

test.describe("étape en cellule de liste (CRM-105, D32, D33, contrat 40)", () => {
  test("la cellule Étape ne propose ni Gagnée ni Perdue ; passer à « Entretien client » fait lire 50 % dans la colonne Probabilité, qui ne s'édite pas", async ({ memberPage }) => {
    const mark = tag();
    const companyId = await post(memberPage, "/api/entreprises", { name: named("Banque X", mark), type: "prospect" });
    const id = await post(memberPage, "/api/opportunites", { title: named("Refonte Payroll", mark), companyId, modules: ["payroll"], expectedClose: "2026-10-30" });
    const cell = (field: string) => memberPage.locator(`[data-cell="${id}:${field}"]`);
    const row = memberPage.getByRole("table", { name: "Opportunités" }).getByRole("row").filter({ has: memberPage.getByRole("link", { name: named("Refonte Payroll", mark) }) });

    await memberPage.goto(`/opportunites?colonnes=stage,probability&f=title:contient:${encodeURIComponent(mark)}`);
    await expect(row).toContainText("10 %");
    await expect(cell("probability")).toHaveCount(0);

    await cell("stage").dblclick();
    const select = row.getByRole("combobox", { name: "Étape" });
    await expect(select.locator("option")).toHaveText(["—", "Nouveau besoin", "Qualifié", "Profils proposés", "Entretien client", "Proposition envoyée", "Négociation"]);
    await Promise.all([
      memberPage.waitForResponse((res) => res.url().includes(`/api/opportunites/${id}`) && res.request().method() === "PATCH"),
      select.selectOption({ label: "Entretien client" }),
    ]);

    await expect(cell("stage")).toHaveText("Entretien client");
    await memberPage.reload();
    await expect(cell("stage")).toHaveText("Entretien client");
    await expect(row).toContainText("50 %");
  });
});

test.describe("création depuis la palette (CRM-104, contrat 32)", () => {
  test("la palette ⌘K propose « Nouvelle opportunité », qui ouvre la même création rapide à quatre champs", async ({ memberPage }) => {
    await memberPage.goto("/accueil");
    await memberPage.keyboard.press("ControlOrMeta+k");
    const palette = memberPage.getByRole("dialog");
    await palette.getByRole("combobox").fill("Nouvelle opp");
    await palette.getByRole("option", { name: /^Nouvelle opportunité/ }).click();

    await expect(memberPage).toHaveURL(/\/opportunites\?creation=1/);
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle opportunité" });
    await expect(dialog.locator("label, [id$='-label']")).toHaveText(["Titre", "Entreprise", "Modules Workday", "Clôture prévue"]);
  });
});

test.describe("création rapide refusée (CRM-104, contrat 39)", () => {
  test("« Créer » sans titre, entreprise, module ni clôture prévue affiche le refus sous chacun des quatre champs, et aucune opportunité n'est créée", async ({ memberPage }) => {
    const count = async () => ((await (await memberPage.request.get("/api/objets/opportunity/options")).json()) as { options: unknown[] }).options.length;
    const before = await count();
    await memberPage.goto("/opportunites");
    await memberPage.getByRole("button", { name: "Nouvelle opportunité" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle opportunité" });
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(["« Titre » est obligatoire.", "« Entreprise » est obligatoire.", "« Modules Workday » est obligatoire.", "« Clôture prévue » est obligatoire."]);
    await expect(dialog).toBeVisible();
    expect(await count()).toBe(before);
  });
});

test.describe("entreprise en colonne (CRM-104, D60)", () => {
  test("la colonne « Entreprise » écrit le nom de l'entreprise, et trie Acme avant Banque X", async ({ memberPage }) => {
    const mark = tag();
    const bankId = await post(memberPage, "/api/entreprises", { name: named("Banque X", mark), type: "prospect" });
    const acmeId = await post(memberPage, "/api/entreprises", { name: named("Acme", mark), type: "prospect" });
    const atBank = named("Refonte Payroll", mark);
    const atAcme = named("Audit Finance", mark);
    await post(memberPage, "/api/opportunites", { title: atBank, companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30" });
    await post(memberPage, "/api/opportunites", { title: atAcme, companyId: acmeId, modules: ["finance"], expectedClose: "2026-10-30" });

    await memberPage.goto(`/opportunites?colonnes=companyId&tri=companyId:asc&f=title:contient:${encodeURIComponent(mark)}`);
    const rows = memberPage.getByRole("table", { name: "Opportunités" }).getByRole("row");
    await expect(rows.filter({ has: memberPage.getByRole("link", { name: atBank }) })).toContainText(named("Banque X", mark));
    /* Les liens des fiches seulement : ceux de l'en-tête trient. */
    await expect(rows.getByRole("link", { name: mark })).toHaveText([atAcme, atBank]);
  });
});

test.describe("création rapide à 375 px (CRM-104)", () => {
  test("la liste des modules défile dans le dialogue, et « Créer » reste visible", async ({ memberPage }) => {
    await memberPage.setViewportSize({ width: 375, height: 667 });
    await memberPage.goto("/opportunites?creation=1");
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle opportunité" });
    await expect(dialog.getByRole("group", { name: "Modules Workday" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Créer" })).toBeInViewport();
  });
});

test.describe("vue par défaut « Opportunités en cours » (CRM-106, D38, contrat 36)", () => {
  test("s'ouvre sur ses deux puces et ses sept colonnes, sans l'opportunité gagnée, que le retrait des puces ramène", async ({ memberPage }) => {
    const mark = tag();
    const companyId = await post(memberPage, "/api/entreprises", { name: named("Banque X", mark), type: "prospect" });
    const running = named("Refonte Payroll", mark);
    const won = named("Portail RH", mark);
    await post(memberPage, "/api/opportunites", { title: running, companyId, modules: ["hcm"], expectedClose: "2026-12-01" });
    await post(memberPage, "/api/opportunites", { title: won, companyId, modules: ["hcm"], expectedClose: "2026-10-05" });
    setStage(won, "gagnee");

    await memberPage.goto(`/opportunites?f=title:contient:${encodeURIComponent(mark)}`);
    /* Les colonnes de la vue, dans leur ordre ; « Modifiée le » suit, comme sur toute liste. */
    await expect(memberPage.getByRole("table", { name: "Opportunités" }).getByRole("columnheader")).toHaveText(["Titre", "Entreprise", "Étape", "Probabilité", "Montant estimé", "Clôture prévue", "Responsable", "Modifiée le"]);

    await memberPage.goto("/opportunites");
    const bar = memberPage.locator('[data-slot="view-bar"]');
    await expect(bar.getByRole("button", { name: "Vue : Opportunités en cours" })).toBeVisible();
    const links = memberPage.getByRole("table", { name: "Opportunités" }).getByRole("row").getByRole("link", { name: mark });
    await expect(links).toHaveText([running]);

    /* Les deux puces se retirent : les affaires terminées reviennent, la plus proche en tête. */
    await Promise.all([memberPage.waitForURL(/f=stage/), memberPage.getByRole("button", { name: "Retirer le filtre Étape n'est pas Gagnée" }).click()]);
    await Promise.all([memberPage.waitForURL(/filtres=aucun/), memberPage.getByRole("button", { name: "Retirer le filtre Étape n'est pas Perdue" }).click()]);
    await expect(links).toHaveText([won, running]);
  });
});

test.describe("liste des opportunités à 375 px (CRM-106, D49, contrat 59)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("s'affiche en cartes sans défilement horizontal, avec « Nouvelle opportunité » atteignable", async ({ memberPage }) => {
    const mark = tag();
    const companyId = await post(memberPage, "/api/entreprises", { name: named("Banque des Territoires et des Régions", mark), type: "prospect" });
    const title = named("Refonte de la paie et des temps", mark);
    await post(memberPage, "/api/opportunites", { title, companyId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30", targetDailyRate: 650, estimatedDays: 60 });

    await memberPage.goto("/opportunites");
    await expect(memberPage.getByRole("heading", { level: 1 })).toHaveCount(1);
    const card = memberPage.getByRole("list", { name: "Opportunités" }).getByRole("listitem").filter({ has: memberPage.getByRole("link", { name: title }) });
    await expect(card).toContainText("39 000,00 €");
    await expect(memberPage.getByRole("button", { name: "Nouvelle opportunité" })).toBeInViewport();
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
