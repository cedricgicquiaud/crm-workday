import type { Locator, Page } from "@playwright/test";
import { expect, MEMBER, seedAccounts, signInAs, test } from "./fixtures/auth";
import { convertLead, resetLeads } from "./fixtures/leads";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";
import { resetViews } from "./fixtures/vues";

/* Les leads portent un nom d'entreprise qui finit par « (e2e) » : la fixture les efface, et rien d'autre. L'amorce de recette cohabite : chaque test filtre sur sa marque. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les vues d'abord (elles retiennent leurs auteurs), puis les leads (ils retiendront personnes et entreprises), puis personnes et entreprises. */
function resetAll() {
  resetViews();
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

const SIDEBAR = '[data-slot="sidebar"]';
const VIEW_BAR = '[data-slot="view-bar"]';
const VIEW_FORM = '[data-slot="view-form"]';
const VIEW_MENU = '[data-slot="view-menu"]';

async function pickOption(page: Page, combobox: Locator, option: string) {
  await combobox.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function createLead(page: Page, data: Record<string, unknown>): Promise<string> {
  const created = await page.request.post("/api/leads", { data });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

const table = (page: Page) => page.getByRole("table", { name: "Leads" });

/** Les titres que le tableau montre, dans l'ordre, parmi ceux qui portent la marque du test. */
async function titles(page: Page, mark: string): Promise<string[]> {
  await expect(table(page)).toBeVisible();
  const links = await table(page).getByRole("row").filter({ hasNot: page.getByRole("columnheader") }).getByRole("link").allTextContents();
  return links.map((text) => text.trim()).filter((text) => text.includes(mark));
}

test.describe("« Nouveau lead » depuis la liste (CRM-91, contrat 1)", () => {
  test("ouvre « Leads » après « Consultants », crée Julie Martin · Banque X en cinq champs : la fiche s'ouvre « Nouveau », le créateur en responsable, et le lead est en tête de « Leads en cours »", async ({ memberPage }) => {
    const mark = tag();
    const company = named("Banque X", mark);

    await memberPage.goto("/accueil");
    const objectsNav = memberPage.locator(SIDEBAR).getByRole("navigation", { name: "Objets" });
    await expect(objectsNav.getByRole("link")).toHaveText(["Entreprises", "Personnes", "Consultants", "Leads", "Opportunités"]);
    await objectsNav.getByRole("link", { name: "Leads" }).click();
    await expect(memberPage).toHaveURL("/leads");
    await expect(memberPage.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible();
    await expect(memberPage.locator(VIEW_BAR).getByRole("button", { name: "Vue : Leads en cours" })).toBeVisible();

    await memberPage.getByRole("button", { name: "Nouveau lead" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouveau lead" });
    await dialog.getByLabel("Prénom").fill("Julie");
    await dialog.getByLabel("Nom", { exact: true }).fill("Martin");
    await dialog.getByLabel("Nom de l'entreprise").fill(company);
    await pickOption(memberPage, dialog.getByRole("combobox", { name: "Origine" }), "LinkedIn");
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(memberPage).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(memberPage.getByRole("heading", { level: 1, name: `Julie Martin · ${company}` })).toBeVisible();
    await expect(memberPage.getByText("Avancement : Nouveau")).toBeVisible();
    await expect(memberPage.getByText(`responsable : ${MEMBER.firstName} ${MEMBER.lastName}`)).toBeVisible();

    await memberPage.goto("/leads");
    await expect(table(memberPage).getByRole("row").nth(1).getByRole("link", { name: `Julie Martin · ${company}` })).toBeVisible();
  });

  test("refuse une création sans prénom, nom ni nom d'entreprise avec un seul message sous le groupe, et sans origine sous l'origine ; rien n'est créé", async ({ memberPage }) => {
    await memberPage.goto("/leads");
    await memberPage.getByRole("button", { name: "Nouveau lead" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouveau lead" });
    const form = dialog.locator("form");

    await dialog.getByLabel("Prénom").fill("Julie");
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(form.getByRole("alert")).toHaveText(["« Origine » est obligatoire."]);

    await dialog.getByLabel("Prénom").fill("");
    await pickOption(memberPage, dialog.getByRole("combobox", { name: "Origine" }), "Autre");
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(form.getByRole("alert")).toHaveText(["Renseignez un prénom, un nom ou une entreprise"]);
    await expect(memberPage).toHaveURL("/leads");
  });
});

test.describe("vue « Leads en cours » (CRM-92, contrat 5)", () => {
  test("porte ses deux puces et ses colonnes, trie du plus récemment créé, montre convertis et écartés quand on retire ses puces ; une vue « Origine est recommandation et Score plus grand que 1 » s'enregistre, s'épingle et se rouvre après reconnexion", async ({ memberPage, browser }) => {
    const mark = tag();
    const oldest = named("Mutuelle Ancienne", mark);
    await createLead(memberPage, { companyName: oldest, origin: "recommandation", score: 3 });
    const converted = named("Banque Convertie", mark);
    convertLead(await createLead(memberPage, { companyName: converted, origin: "recommandation", score: 3 }));
    const discarded = named("Banque Écartée", mark);
    expect((await memberPage.request.post(`/api/leads/${await createLead(memberPage, { companyName: discarded, origin: "linkedin" })}/ecarter`)).status()).toBe(200);
    const weak = named("Assurance Faible", mark);
    await createLead(memberPage, { companyName: weak, origin: "recommandation", score: 1 });
    const newest = named("Groupe Récent", mark);
    await createLead(memberPage, { companyName: newest, origin: "partenaire", score: 2 });

    await memberPage.goto("/leads");
    const filters = memberPage.locator('[data-slot="list-filters"]');
    await expect(filters.getByText("Avancement n'est pas Converti", { exact: true })).toBeVisible();
    await expect(filters.getByText("Avancement n'est pas Écarté", { exact: true })).toBeVisible();
    await expect(table(memberPage).getByRole("columnheader")).toHaveText(["Titre", "Avancement", "Origine", "Score", "Responsable", "Créé le"]);
    await expect(memberPage.getByRole("columnheader", { name: "Créé le" })).toHaveAttribute("aria-sort", "descending");
    expect(await titles(memberPage, mark)).toEqual([newest, weak, oldest]);

    await Promise.all([memberPage.waitForURL(/f=stage/), filters.getByRole("button", { name: "Retirer le filtre Avancement n'est pas Converti" }).click()]);
    await Promise.all([memberPage.waitForURL(/filtres=aucun/), filters.getByRole("button", { name: "Retirer le filtre Avancement n'est pas Écarté" }).click()]);
    expect(await titles(memberPage, mark)).toEqual([newest, weak, discarded, converted, oldest]);
    await memberPage.reload();
    expect(await titles(memberPage, mark)).toEqual([newest, weak, discarded, converted, oldest]);

    const viewName = named("Recommandations sérieuses", mark);
    await memberPage.goto(`/leads?f=companyName:contient:${mark}&f=origin:est:recommandation&f=score:plus_grand:1`);
    expect(await titles(memberPage, mark)).toEqual([converted, oldest]);
    const bar = memberPage.locator(VIEW_BAR);
    await bar.getByRole("button", { name: "Enregistrer la vue" }).click();
    await memberPage.locator(VIEW_FORM).getByLabel("Nom de la vue").fill(viewName);
    await memberPage.locator(VIEW_FORM).getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(memberPage).toHaveURL(/vue=/);
    await bar.getByRole("button", { name: `Vue : ${viewName}` }).click();
    await memberPage.locator(VIEW_MENU).getByRole("checkbox", { name: `Épingler ${viewName}` }).click();
    const pinned = (page: Page) => page.locator(SIDEBAR).getByRole("navigation", { name: "Vues épinglées" }).getByRole("link");
    await expect(pinned(memberPage)).toHaveText([viewName]);

    const context = await browser.newContext();
    await signInAs(context.request, MEMBER);
    const again = await context.newPage();
    await again.goto("/accueil");
    await pinned(again).first().click();
    await expect(again).toHaveURL(/\/leads\?vue=/);
    expect(await titles(again, mark)).toEqual([converted, oldest]);
    await context.close();
  });
});

test.describe("palette ⌘K et leads (CRM-93, contrat 7)", () => {
  test("retrouve un lead qualifié avec « Qualifié · LinkedIn » et ouvre sa fiche, retrouve un écarté, jamais un converti ni un archivé ; « Nouveau lead » ouvre le dialogue", async ({ memberPage }) => {
    const mark = tag();
    const qualified = named("Banque Qualifiée", mark);
    const qualifiedId = await createLead(memberPage, { companyName: qualified, origin: "linkedin" });
    expect((await memberPage.request.patch(`/api/leads/${qualifiedId}`, { data: { stage: "qualifie" } })).status()).toBe(200);
    const discarded = named("Banque Écartée", mark);
    expect((await memberPage.request.post(`/api/leads/${await createLead(memberPage, { companyName: discarded, origin: "autre" })}/ecarter`)).status()).toBe(200);
    const converted = named("Banque Convertie", mark);
    convertLead(await createLead(memberPage, { companyName: converted, origin: "autre" }));
    const archived = named("Banque Archivée", mark);
    const archivedId = await createLead(memberPage, { companyName: archived, origin: "autre" });
    expect((await memberPage.request.post(`/api/objets/lead/${archivedId}/archiver`)).status()).toBe(200);

    await memberPage.goto("/accueil");
    await memberPage.keyboard.press("ControlOrMeta+k");
    const palette = memberPage.getByRole("dialog");
    await palette.getByRole("combobox").fill(mark);
    const hit = palette.getByRole("option", { name: new RegExp(qualified.replace(/[()]/g, "\\$&")) });
    await expect(hit).toContainText("Qualifié · LinkedIn");
    await expect(palette.getByRole("option", { name: new RegExp(discarded.replace(/[()]/g, "\\$&")) })).toBeVisible();
    await expect(palette.getByRole("option", { name: new RegExp(converted.replace(/[()]/g, "\\$&")) })).toHaveCount(0);
    await expect(palette.getByRole("option", { name: new RegExp(archived.replace(/[()]/g, "\\$&")) })).toHaveCount(0);
    await hit.click();
    await expect(memberPage).toHaveURL(`/leads/${qualifiedId}`);

    await memberPage.keyboard.press("ControlOrMeta+k");
    await memberPage.getByRole("dialog").getByRole("combobox").fill("Nouveau l");
    await memberPage.getByRole("dialog").getByRole("option", { name: /^Nouveau lead/ }).click();
    await expect(memberPage).toHaveURL(/\/leads\?creation=1/);
    await expect(memberPage.getByRole("dialog", { name: "Nouveau lead" })).toBeVisible();
  });
});

test.describe("email déjà connu à la création (CRM-93, contrat 9)", () => {
  test("une adresse qui est l'autre email d'une personne, dans une autre casse, nomme la personne et propose de l'ouvrir ; le lead se crée quand même", async ({ memberPage }) => {
    const mark = tag();
    const address = `julie.martin.${mark}@banquex.fr`;
    const person = await memberPage.request.post("/api/personnes", { data: { firstName: "Julie", lastName: named("Martin", mark), email: `julie.${mark}@perso.fr`, otherEmails: address } });
    expect(person.status()).toBe(201);

    await memberPage.goto("/leads");
    await memberPage.getByRole("button", { name: "Nouveau lead" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouveau lead" });
    await dialog.getByLabel("Prénom").fill("Julie");
    await dialog.getByLabel("Nom de l'entreprise").fill(named("Banque X", mark));
    await dialog.getByLabel("Email").fill(address.toUpperCase());
    await pickOption(memberPage, dialog.getByRole("combobox", { name: "Origine" }), "LinkedIn");

    const hint = dialog.getByRole("status");
    await expect(hint).toContainText(`déjà portée par « Julie ${named("Martin", mark)} » (personne)`);
    await expect(hint.getByRole("link", { name: "Ouvrir la fiche" })).toBeVisible();

    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(memberPage).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
  });
});

test.describe("liste des leads à 375 px (CRM-94, contrat 14)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("s'affiche en cartes sans défilement horizontal, avec « Nouveau lead » atteignable", async ({ memberPage }) => {
    const mark = tag();
    const company = named("Groupe Ferrandi et Associés du Sud-Ouest", mark);
    await createLead(memberPage, { firstName: "Jean-Baptiste", lastName: "Delacroix-Montesquieu", companyName: company, origin: "appel_d_offres", score: 2 });

    await memberPage.goto("/leads");
    await expect(memberPage.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(memberPage.getByRole("list", { name: "Leads" }).getByRole("link", { name: `Jean-Baptiste Delacroix-Montesquieu · ${company}` })).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Nouveau lead" })).toBeInViewport();
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
