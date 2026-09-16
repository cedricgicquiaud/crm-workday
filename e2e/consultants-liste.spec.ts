import type { Page } from "@playwright/test";
import { expect, MEMBER, seedAccounts, signInAs, test } from "./fixtures/auth";
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

/** « 5 oct. 2026 » : le format court des dates de contexte (idiome d'interface). */
const shortDate = (day: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${day}T12:00:00Z`));

type PersonSeed = { profile?: Record<string, unknown>; companyId?: string };

/** Crée une personne — contact si on lui donne une entreprise — et, si on lui en donne un, son profil consultant ; rend son identifiant et son nom complet. */
async function seedPerson(page: Page, firstName: string, mark: string, { profile, companyId }: PersonSeed = {}): Promise<{ id: string; name: string }> {
  const lastName = named("Liste", mark);
  const created = await page.request.post("/api/personnes", { data: { firstName, lastName, ...(companyId ? { companyId } : {}) } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  if (profile) expect((await page.request.patch(`/api/personnes/${id}/profil-consultant`, { data: profile })).status()).toBe(200);
  return { id, name: `${firstName} ${lastName}` };
}

/** Comme `seedPerson`, quand le test ne lit que le nom. */
const createPerson = async (page: Page, firstName: string, mark: string, seed: PersonSeed = {}): Promise<string> => (await seedPerson(page, firstName, mark, seed)).name;

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
    /* Sept colonnes tiennent dans 1280 px barre latérale ouverte, et le nom reste lisible : une colonne de titre écrasée à zéro cacherait le lien. */
    await expect(table(memberPage).getByRole("link", { name: remi, exact: true })).toBeVisible();
    expect((await table(memberPage).getByRole("link", { name: remi, exact: true }).boundingBox())!.width).toBeGreaterThan(80);
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

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

const VIEW_BAR = '[data-slot="view-bar"]';
const VIEW_FORM = '[data-slot="view-form"]';
const VIEW_MENU = '[data-slot="view-menu"]';
const SIDEBAR = '[data-slot="sidebar"]';

test.describe("vue enregistrée et épinglée de la liste « Consultants » (CRM-87, contrat 15)", () => {
  test("un membre enregistre la liste filtrée sous « Freelances HCM disponibles », l'épingle, et la retrouve dans sa barre latérale après reconnexion", async ({ memberPage, browser }) => {
    const mark = tag();
    const { dina } = await seedConsultants(memberPage, mark);
    const viewName = named("Freelances HCM disponibles", mark);

    await memberPage.goto(`/consultants?f=name:contient:${mark}&f=status:est:freelance&f=modules:contient:hcm&f=state:est:disponible`);
    const bar = memberPage.locator(VIEW_BAR);
    await expect(bar.getByRole("button", { name: "Vue : Tous les consultants" })).toBeVisible();
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
    await expect(pinned(again)).toHaveText([viewName]);
    await pinned(again).first().click();
    await expect(again).toHaveURL(/\/consultants\?vue=/);
    expect(await names(again)).toEqual([dina]);
    await context.close();
  });
});

test.describe("refus d'adresse de la liste « Consultants » (CRM-87, contrats 17 et 18)", () => {
  test("une adresse bricolée s'ouvre avec l'avertissement « filtre inactif », sans erreur ; une personne sans profil n'y entre jamais, un consultant archivé seulement avec « archivées »", async ({ memberPage }) => {
    const mark = tag();
    const consultant = await createPerson(memberPage, "Ugo", mark, { profile: { status: "freelance", modules: ["hcm"] } });
    await createPerson(memberPage, "Sam", mark);
    const archived = await seedPerson(memberPage, "Zoé", mark, { profile: { status: "portage" } });
    expect((await memberPage.request.post(`/api/objets/person/${archived.id}/archiver`, { data: {} })).status()).toBe(200);
    const mine = `f=name:contient:${mark}`;

    /* « Modules est HCM », l'ancien « Profils est contact », un module hors liste : ignorés, et dits. */
    const response = await memberPage.goto(`/consultants?${mine}&f=modules:est:hcm&f=profiles:est:contact&f=modules:contient:sap_hr&f=profiles:est_vide:`);
    expect(response?.status()).toBe(200);
    const warnings = memberPage.locator('[data-slot="list-warnings"]');
    await expect(warnings.getByRole("status")).toHaveText([
      "Filtre inactif : « est » ne s'applique pas au champ « Modules ».",
      "Filtre inactif : « est » ne s'applique pas au champ « Profils ».",
      "Filtre inactif : « sap_hr » n'est pas une valeur de « Modules ».",
    ]);
    /* « Profils est vide » s'applique, mais ne retire jamais le filtre de base : aucune personne sans profil n'entre. */
    await expect(memberPage.getByText("Aucune fiche ne répond à ces filtres.")).toBeVisible();

    await memberPage.goto(`/consultants?${mine}`);
    expect(await names(memberPage)).toEqual([consultant]);
    await memberPage.goto(`/consultants?${mine}&archivees=1`);
    expect((await names(memberPage)).sort()).toEqual([consultant, archived.name].sort());
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

test.describe("téléphone, 375 px : consultants en cartes et fiche en une colonne (CRM-88, contrat 19)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** Aucun défilement horizontal de la page, un seul h1, et aucun cadre qui défile en largeur (contrôle de `e2e/listes.spec.ts`). */
  async function fitsTheScreen(page: Page, label: string) {
    await expect(page.getByRole("heading", { level: 1 }), label).toHaveCount(1);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(scrollWidth, label).toBeLessThanOrEqual(clientWidth);
    const wider = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => el.clientWidth > 1 && el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).textOverflow !== "ellipsis")
        .map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`),
    );
    expect(wider, label).toEqual([]);
  }

  test("la liste passe en cartes qui suivent les colonnes de la vue — état avec sa date et « à replacer », certifiés marqués ✔ — sans cellule ouvrable ni défilement horizontal, « Nouveau consultant » atteignable ; la fiche tient en une colonne et les modules se cochent encore", async ({ memberPage }) => {
    const mark = tag();
    const { remi, leo } = await seedConsultants(memberPage, mark);
    const card = (name: string) => memberPage.getByRole("listitem").filter({ has: memberPage.getByRole("link", { name, exact: true }) });

    await memberPage.goto(`/consultants?f=name:contient:${mark}`);
    await expect(card(remi)).toBeVisible();
    await expect(table(memberPage)).toBeHidden();
    await expect(card(remi)).toContainText("État");
    await expect(card(remi)).toContainText("Disponible · à replacer");
    await expect(card(remi)).toContainText("HCM ✔");
    await expect(card(leo)).toContainText(`En mission · disponible le ${shortDate(parisDayFromToday(20))}`);
    await expect(memberPage.locator("[data-cell]:visible")).toHaveCount(0);
    await expect(memberPage.getByRole("button", { name: "Nouveau consultant" })).toBeInViewport();
    await fitsTheScreen(memberPage, "liste des consultants");

    /* Les cartes suivent les colonnes de la vue : sans « Modules » dans l'adresse, la carte ne les montre plus. */
    await memberPage.goto(`/consultants?f=name:contient:${mark}&colonnes=state`);
    await expect(card(remi)).toContainText("Disponible · à replacer");
    await expect(card(remi)).not.toContainText("HCM");

    await card(remi).getByRole("link", { name: remi, exact: true }).click();
    const section = memberPage.getByRole("region", { name: "Profil consultant" });
    await expect(section).toBeVisible();
    /* Une colonne : la section prend la largeur de l'écran, moins ses marges. */
    expect((await section.boundingBox())!.width).toBeGreaterThan(300);
    const [response] = await Promise.all([
      memberPage.waitForResponse((res) => res.url().includes("/profil-consultant") && res.request().method() === "PATCH"),
      section.getByRole("checkbox", { name: "Payroll", exact: true }).click().then(() => section.getByRole("checkbox", { name: "Payroll", exact: true }).press("Enter")),
    ]);
    expect(response.status()).toBe(200);
    await expect(section.getByRole("checkbox", { name: "Payroll", exact: true })).toBeChecked();
    await fitsTheScreen(memberPage, "fiche du consultant");
  });
});
