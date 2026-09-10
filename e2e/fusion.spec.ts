import type { Locator, Page } from "@playwright/test";
import { resetActivities } from "./fixtures/activites";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetMerges } from "./fixtures/fusion";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. Une paire de
   doublons partage le même suffixe, sinon leurs noms ne se réduisent pas à la même forme. */
const suffix = () => `${Date.now().toString(36)} (e2e)`;

/* Les redirections d'abord (elles désignent la fiche conservée), puis les activités (elles retiennent
   leur auteur), puis les personnes — une personne rattachée retient son entreprise — puis les entreprises. */
function resetAll() {
  resetMerges();
  resetActivities();
  resetPersons();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
test.afterAll(resetAll);

async function createCompany(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/entreprises", { data: { name, type: "client" } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function pickOption(page: Page, combobox: Locator, option: string) {
  await combobox.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Le menu d'actions de la fiche, ouvert sur sa commande. */
async function runAction(page: Page, action: string) {
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

const duplicateBanner = (name: string) => `Doublon probable : « ${name} » porte un nom très proche.`;

test.describe("doublon probable à la création (CRM-58, contrat 28)", () => {
  test("l'avertissement nomme la fiche existante et propose de l'ouvrir, sans jamais empêcher la création", async ({ adminPage }) => {
    const sfx = suffix();
    await createCompany(adminPage, `Acme ${sfx}`);
    await adminPage.goto("/entreprises");
    await adminPage.getByRole("button", { name: "Nouvelle entreprise" }).click();

    const dialog = adminPage.getByRole("dialog", { name: "Nouvelle entreprise" });
    const name = dialog.getByLabel("Raison sociale");
    const warning = dialog.getByText(duplicateBanner(`Acme ${sfx}`));

    await name.fill(`ACME SAS ${sfx}`);
    await expect(warning).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Ouvrir la fiche" })).toBeVisible();

    /* « ACME SASU » et « Société Acme » signalent la même fiche ; « Acmé Conseil » non (contrat 28). */
    await name.fill(`ACME SASU ${sfx}`);
    await expect(warning).toBeVisible();
    await name.fill(`Société Acme ${sfx}`);
    await expect(warning).toBeVisible();
    await name.fill(`Acmé Conseil ${sfx}`);
    await expect(warning).toHaveCount(0);

    /* Le signal ne bloque jamais la création : on crée quand même la fiche jumelle. */
    await name.fill(`ACME SAS ${sfx}`);
    await expect(warning).toBeVisible();
    await pickOption(adminPage, dialog.getByRole("combobox", { name: "Type" }), "Client");
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(adminPage).toHaveURL(/\/entreprises\/[0-9a-f-]{36}$/);
    await expect(adminPage.getByRole("heading", { level: 1, name: `ACME SAS ${sfx}` })).toBeVisible();
  });

  test("les deux fiches portent ensuite la bannière « doublon probable » avec le lien de fusion (CRM-60)", async ({ adminPage }) => {
    const sfx = suffix();
    const acme = await createCompany(adminPage, `Presses Aubry ${sfx}`);
    const acmeSas = await createCompany(adminPage, `Presses Aubry SAS ${sfx}`);

    await adminPage.goto(`/entreprises/${acme}`);
    await expect(adminPage.getByText(duplicateBanner(`Presses Aubry SAS ${sfx}`))).toBeVisible();
    await expect(adminPage.getByRole("link", { name: "Fusionner…" })).toBeVisible();

    await adminPage.goto(`/entreprises/${acmeSas}`);
    await expect(adminPage.getByText(duplicateBanner(`Presses Aubry ${sfx}`))).toBeVisible();
    await expect(adminPage.getByRole("link", { name: "Fusionner…" })).toBeVisible();
  });
});

test.describe("fusionner deux entreprises (CRM-59, contrat 29)", () => {
  test("l'administrateur choisit la fiche conservée et les valeurs, le dialogue annonce ce qui sera déplacé, et l'adresse de l'absorbée mène ensuite à la conservée", async ({ adminPage }) => {
    const sfx = suffix();
    const kept = await createCompany(adminPage, `Fonderie Bertin ${sfx}`);
    const absorbed = await createCompany(adminPage, `Fonderie Bertin SARL ${sfx}`);
    /* Une activité sur l'absorbée : le dialogue doit l'annoncer, et le fil de la conservée la reprendre. */
    expect((await adminPage.request.post(`/api/objets/company/${absorbed}/activites`, { data: { type: "note", body: `Premier rendez-vous ${sfx}` } })).status()).toBe(201);
    await adminPage.request.patch(`/api/entreprises/${absorbed}`, { data: { city: "Lyon" } });

    await adminPage.goto(`/entreprises/${kept}`);
    await adminPage.getByRole("link", { name: "Fusionner…" }).click();

    const dialog = adminPage.getByRole("dialog", { name: "Fusionner deux fiches" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Activités : 1" })).toBeVisible();

    /* Champ par champ : la ville de l'absorbée est prise, la raison sociale reste celle de la conservée. */
    const lyon = dialog.getByRole("radiogroup", { name: "Ville" }).getByRole("radio", { name: "Lyon" });
    await lyon.click();
    await expect(lyon).toBeChecked();

    await dialog.getByRole("button", { name: "Fusionner", exact: true }).click();

    await expect(adminPage).toHaveURL(new RegExp(`/entreprises/${kept}$`));
    await expect(adminPage.getByRole("heading", { level: 1, name: `Fonderie Bertin ${sfx}` })).toBeVisible();
    await expect(adminPage.getByRole("region", { name: "Adresse" }).getByRole("textbox", { name: "Ville" })).toHaveValue("Lyon");

    /* Tout ce que portait l'absorbée est là, et le fil porte l'entrée de fusion, marquée automatique. */
    const feed = adminPage.getByRole("region", { name: "Fil d'activité" });
    await expect(feed.getByText(`Premier rendez-vous ${sfx}`)).toBeVisible();
    await expect(feed.getByText("Fiche fusionnée")).toBeVisible();
    await expect(feed.getByText("automatique").first()).toBeVisible();

    /* La bannière a disparu des deux côtés, et l'adresse de l'absorbée mène à la conservée. */
    await expect(adminPage.getByText(duplicateBanner(`Fonderie Bertin SARL ${sfx}`))).toHaveCount(0);
    await adminPage.goto(`/entreprises/${absorbed}`);
    await expect(adminPage).toHaveURL(new RegExp(`/entreprises/${kept}$`));
    await expect(adminPage.getByRole("heading", { level: 1, name: `Fonderie Bertin ${sfx}` })).toBeVisible();
  });

  test("la commande « Fusionner… » du menu d'actions ouvre le même dialogue", async ({ adminPage }) => {
    const sfx = suffix();
    const kept = await createCompany(adminPage, `Charpentes Ollivier ${sfx}`);
    await createCompany(adminPage, `Charpentes Ollivier SAS ${sfx}`);

    await adminPage.goto(`/entreprises/${kept}`);
    await runAction(adminPage, "Fusionner…");
    await expect(adminPage.getByRole("dialog", { name: "Fusionner deux fiches" })).toBeVisible();
  });
});

test.describe("refus de la fusion (CRM-59, contrats 31 et 32)", () => {
  test("un membre ne voit pas la commande « fusionner », et l'appel serveur lui répond 403", async ({ adminPage, memberPage }) => {
    const sfx = suffix();
    const kept = await createCompany(adminPage, `Banque Solveige ${sfx}`);
    const absorbed = await createCompany(adminPage, `Banque Solveige SA ${sfx}`);

    await memberPage.goto(`/entreprises/${kept}`);
    await expect(memberPage.getByText(duplicateBanner(`Banque Solveige SA ${sfx}`))).toBeVisible();
    await expect(memberPage.getByRole("link", { name: "Fusionner…" })).toHaveCount(0);
    await memberPage.getByRole("button", { name: "Actions" }).click();
    await expect(memberPage.getByRole("menuitem", { name: "Fusionner…" })).toHaveCount(0);
    await memberPage.keyboard.press("Escape");

    const refused = await memberPage.request.post("/api/objets/company/fusion", { data: { keptId: kept, absorbedId: absorbed } });
    expect(refused.status()).toBe(403);
    /* Rien n'a bougé : les deux fiches sont toujours là. */
    expect((await memberPage.request.get(`/api/entreprises/${absorbed}`)).status()).toBe(200);
  });

  test("fusionner une fiche avec elle-même, ou une personne avec une entreprise, répond 400", async ({ adminPage }) => {
    const sfx = suffix();
    const alone = await createCompany(adminPage, `Papeterie Vidal ${sfx}`);
    const someone = await adminPage.request.post("/api/personnes", { data: { firstName: "Claire", lastName: `Bonnet ${sfx}` } });
    const someoneId = ((await someone.json()) as { id: string }).id;

    const itself = await adminPage.request.post("/api/objets/company/fusion", { data: { keptId: alone, absorbedId: alone } });
    expect(itself.status()).toBe(400);
    expect((await itself.json()).error).toBe("meme_fiche");

    const crossed = await adminPage.request.post("/api/objets/company/fusion", { data: { keptId: alone, absorbedId: someoneId, absorbedType: "person" } });
    expect(crossed.status()).toBe(400);
    expect((await crossed.json()).error).toBe("types_differents");
  });
});

test.describe("téléphone, 375 px (contrat 25 de la feature 1, D9)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** Aucun défilement horizontal de la page, un seul h1, et aucun cadre qui défile en largeur. */
  async function fitsTheScreen(page: Page, label: string, { modalOpen = false } = {}) {
    if (!modalOpen) await expect(page.getByRole("heading", { level: 1 }), label).toHaveCount(1);
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

  test("la bannière de doublon et le dialogue de fusion tiennent dans l'écran", async ({ adminPage }) => {
    const sfx = suffix();
    const kept = await createCompany(adminPage, `Manufacture des Étoffes du Nord ${sfx}`);
    await createCompany(adminPage, `Manufacture des Étoffes du Nord SAS ${sfx}`);

    await adminPage.goto(`/entreprises/${kept}`);
    await expect(adminPage.getByRole("link", { name: "Fusionner…" })).toBeVisible();
    await fitsTheScreen(adminPage, "fiche avec la bannière de doublon");

    await adminPage.getByRole("link", { name: "Fusionner…" }).click();
    await expect(adminPage.getByRole("dialog", { name: "Fusionner deux fiches" })).toBeVisible();
    await fitsTheScreen(adminPage, "dialogue de fusion", { modalOpen: true });
  });
});
