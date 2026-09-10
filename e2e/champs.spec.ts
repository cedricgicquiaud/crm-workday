import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetCustomFields } from "./fixtures/champs";
import { resetObjects } from "./fixtures/objets";

/* Champs et fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const FIELD_FORM = '[data-slot="field-form"]';
const FIELDS_LIST = '[data-slot="fields-list"]';
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

function resetAll() {
  resetCustomFields();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
test.afterAll(resetAll);

test.describe("Paramètres → Champs (CRM-54, contrats 20 et 22)", () => {
  test("un administrateur définit un champ nombre et un champ liste sur les entreprises ; un libellé déjà pris est refusé ; un membre n'y accède pas", async ({ adminPage, memberPage }) => {
    const mark = tag();
    const effectif = named("Effectif", mark);
    const segment = named("Segment", mark);

    await adminPage.goto("/parametres/champs");
    const nav = adminPage.getByRole("navigation", { name: "Sections des paramètres" });
    await expect(nav.getByRole("link", { name: "Champs" })).toHaveAttribute("aria-current", "page");

    /* Un champ nombre sur les entreprises. */
    await adminPage.getByRole("button", { name: "Nouveau champ" }).click();
    const form = adminPage.locator(FIELD_FORM);
    await form.getByLabel("Objet").selectOption("company");
    await form.getByLabel("Libellé").fill(effectif);
    await form.getByLabel("Type").selectOption("number");
    await form.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(adminPage.locator(FIELDS_LIST).getByText(effectif)).toBeVisible();

    /* Un champ liste à trois valeurs, obligatoire à la création d'une fiche. */
    await adminPage.getByRole("button", { name: "Nouveau champ" }).click();
    await form.getByLabel("Objet").selectOption("company");
    await form.getByLabel("Libellé").fill(segment);
    await form.getByLabel("Type").selectOption("list");
    await form.getByLabel("Valeurs").fill("Grand compte\nPME\nStartup");
    await form.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(adminPage.locator(FIELDS_LIST).getByText(segment)).toBeVisible();

    /* Contrat 22 : le même libellé sur le même objet est refusé, sous le champ, sans rien créer. */
    await adminPage.getByRole("button", { name: "Nouveau champ" }).click();
    await form.getByLabel("Objet").selectOption("company");
    await form.getByLabel("Libellé").fill(segment);
    await form.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("déjà le libellé");
    await adminPage.getByRole("button", { name: "Annuler" }).click();
    await expect(adminPage.locator(FIELDS_LIST).getByText(segment)).toHaveCount(1);

    /* Contrat 20 : un membre est renvoyé vers Accueil, et l'appel serveur répond 403. */
    await memberPage.goto("/parametres/champs");
    await expect(memberPage).toHaveURL(/\/accueil$/);
    expect((await memberPage.request.get("/api/champs?objet=company")).status()).toBe(403);
    const refused = await memberPage.request.post("/api/champs", { data: { objectType: "company", label: named("Interdit", mark), type: "text" } });
    expect(refused.status()).toBe(403);
  });
});
