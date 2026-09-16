import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";
import { resetViews } from "./fixtures/vues";

/* Fiches et vues finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. L'amorce de recette cohabite : chaque test filtre sur sa marque. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les vues d'abord (elles retiennent leurs auteurs), puis les personnes (qui retiennent leurs entreprises et les comptes de test). */
function resetAll() {
  resetViews();
  resetPersons();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
/* Chaque test pose ses fiches et ses vues : celles du test d'avant fausseraient un tri ou une barre latérale. */
test.beforeEach(resetAll);
test.afterAll(resetAll);

/** Le jour civil de Paris décalé de `days` jours, en `AAAA-MM-JJ`. */
function parisDayFromToday(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const noon = new Date(`${today}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

/** Crée une personne — contact si on lui donne une entreprise — et, si on lui en donne un, son profil consultant ; rend son nom complet. */
async function createPerson(page: Page, firstName: string, mark: string, { profile, companyId }: { profile?: Record<string, unknown>; companyId?: string } = {}): Promise<string> {
  const lastName = named("Liste", mark);
  const created = await page.request.post("/api/personnes", { data: { firstName, lastName, ...(companyId ? { companyId } : {}) } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  if (profile) expect((await page.request.patch(`/api/personnes/${id}/profil-consultant`, { data: profile })).status()).toBe(200);
  return `${firstName} ${lastName}`;
}

/** Les quatre consultants d'un test, un par case du rang de l'état (D6). */
async function seedConsultants(page: Page, mark: string) {
  return {
    remi: await createPerson(page, "Rémi", mark, { profile: { status: "salarie", modules: ["hcm"], certifiedModules: ["hcm"], dailyCost: 520 } }),
    dina: await createPerson(page, "Dina", mark, { profile: { status: "freelance", modules: ["hcm", "integration"], certifiedModules: ["hcm"], availableFrom: parisDayFromToday(-3) } }),
    leo: await createPerson(page, "Léo", mark, { profile: { status: "salarie", modules: ["integration"], availableFrom: parisDayFromToday(20) } }),
    iris: await createPerson(page, "Iris", mark, { profile: { status: "portage", unavailable: "oui", unavailableReason: "congé parental" } }),
  };
}

const table = (page: Page) => page.getByRole("table", { name: "Consultants" });

/** Les noms que le tableau montre, dans l'ordre. */
const names = async (page: Page) => (await table(page).getByRole("row").filter({ hasNot: page.getByRole("columnheader") }).getByRole("link").allTextContents()).map((text) => text.trim());

test.describe("liste « Consultants » à l'écran (CRM-86, contrat 14)", () => {
  test("montre ses colonnes par défaut avec les certifiés marqués ✔, filtre sur Modules, Certifié sur et État, trie sur État par rang, et l'adresse rouverte dans un autre onglet rend le même état", async ({ memberPage }) => {
    const mark = tag();
    const { remi, dina, leo, iris } = await seedConsultants(memberPage, mark);
    const mine = `f=name:contient:${mark}`;

    await memberPage.goto(`/consultants?${mine}`);
    await expect(table(memberPage).getByRole("columnheader")).toHaveText(["Nom complet", "Statut", "Modules", "Coût journalier", "État", "Responsable", "Modifiée le"]);
    const row = (name: string) => table(memberPage).getByRole("row").filter({ has: memberPage.getByRole("link", { name, exact: true }) });
    await expect(row(dina).getByRole("cell").nth(2)).toHaveText("HCM ✔, Integration");
    await expect(row(remi).getByRole("cell").nth(3)).toHaveText("520,00 €");

    await memberPage.goto(`/consultants?${mine}&f=modules:contient:integration`);
    expect((await names(memberPage)).sort()).toEqual([dina, leo].sort());
    await memberPage.goto(`/consultants?${mine}&f=certifiedModules:contient:hcm`);
    expect((await names(memberPage)).sort()).toEqual([dina, remi].sort());
    await memberPage.goto(`/consultants?${mine}&f=state:est:disponible`);
    expect((await names(memberPage)).sort()).toEqual([dina, remi].sort());

    await memberPage.goto(`/consultants?${mine}`);
    const stateHeader = memberPage.getByRole("columnheader", { name: "État" });
    await stateHeader.getByRole("link").click();
    await expect(memberPage).toHaveURL(/tri=state%3Aasc/);
    await expect(stateHeader).toHaveAttribute("aria-sort", "ascending");
    /* L'alphabet des libellés mettrait « Disponible » (Dina) avant « Disponible · à replacer » (Rémi). */
    expect(await names(memberPage)).toEqual([remi, dina, leo, iris]);

    const other = await memberPage.context().newPage();
    await other.goto(`/consultants?${mine}&f=modules:contient:hcm&tri=state:asc&colonnes=state,status`);
    expect(await names(other)).toEqual([remi, dina]);
    await expect(table(other).getByRole("columnheader")).toHaveText(["Nom complet", "État", "Statut"]);
    await expect(other.getByRole("columnheader", { name: "État" })).toHaveAttribute("aria-sort", "ascending");
    await other.close();
  });
});

const COLUMN_MENU = '[data-slot="column-menu"]';

test.describe("profil consultant depuis la liste des personnes (CRM-87, contrat 16)", () => {
  test("la colonne « Statut » s'ajoute depuis le menu et ne s'édite pas en place ; « Profils contient consultant », « contient contact » et « est vide » ramènent les bonnes personnes ; tous les champs du profil s'affichent en colonnes", async ({ memberPage }) => {
    const mark = tag();
    const company = await memberPage.request.post("/api/entreprises", { data: { name: named("Acme", mark), type: "client" } });
    expect(company.status()).toBe(201);
    const companyId = ((await company.json()) as { id: string }).id;
    const carla = await createPerson(memberPage, "Carla", mark, { companyId });
    const ugo = await createPerson(memberPage, "Ugo", mark, { profile: { status: "freelance", cvUrl: "https://exemple.fr/cv-ugo.pdf" } });
    const bianca = await createPerson(memberPage, "Bianca", mark, { companyId, profile: { status: "salarie" } });
    const sam = await createPerson(memberPage, "Sam", mark);
    const mine = `f=name:contient:${mark}`;
    const personNames = async () => (await memberPage.getByRole("table", { name: "Personnes" }).getByRole("row").filter({ hasNot: memberPage.getByRole("columnheader") }).getByRole("link").allTextContents()).map((text) => text.trim()).sort();

    await memberPage.goto(`/personnes?${mine}`);
    await memberPage.getByRole("button", { name: "Colonnes" }).click();
    await memberPage.locator(COLUMN_MENU).getByRole("checkbox", { name: "Statut", exact: true }).click();
    await expect(memberPage).toHaveURL(/colonnes=[^&]*status/);
    await memberPage.keyboard.press("Escape");
    const statusHeader = memberPage.getByRole("columnheader", { name: "Statut", exact: true });
    await expect(statusHeader).toBeVisible();
    const ugoRow = memberPage.getByRole("table", { name: "Personnes" }).getByRole("row").filter({ has: memberPage.getByRole("link", { name: ugo, exact: true }) });
    await expect(ugoRow).toContainText("Freelance");
    /* Aucun champ du profil ne s'édite dans une cellule (D10) : rien d'ouvrable dans cette liste. */
    await expect(memberPage.locator("[data-cell]")).toHaveCount(0);

    await memberPage.goto(`/personnes?${mine}&f=profiles:contient:consultant`);
    expect(await personNames()).toEqual([bianca, ugo].sort());
    await memberPage.goto(`/consultants?${mine}`);
    expect((await names(memberPage)).sort()).toEqual([bianca, ugo].sort());
    await memberPage.goto(`/personnes?${mine}&f=profiles:contient:contact`);
    expect(await personNames()).toEqual([bianca, carla].sort());
    await memberPage.goto(`/personnes?${mine}&f=profiles:est_vide:`);
    expect(await personNames()).toEqual([sam]);

    /* Les champs du profil sont colonnes de la liste des personnes (D10) : tous ensemble, la page s'ouvre. */
    const profileColumns = "status,modules,certifiedModules,billingCompanyName,dailyCost,availableFrom,unavailable,unavailableReason,state,yearsExperience,languages,cvUrl";
    await memberPage.goto(`/personnes?${mine}&f=profiles:contient:consultant&colonnes=${profileColumns}`);
    await expect(memberPage.getByRole("columnheader", { name: "CV", exact: true })).toBeVisible();
    await expect(ugoRow).toContainText("https://exemple.fr/cv-ugo.pdf");
    await expect(memberPage.locator("[data-cell]")).toHaveCount(0);
  });
});
