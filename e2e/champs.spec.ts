import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetCustomFields } from "./fixtures/champs";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";
import { resetViews } from "./fixtures/vues";

/* Champs et fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const FIELD_FORM = '[data-slot="field-form"]';
const FIELDS_LIST = '[data-slot="fields-list"]';
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/** Définit un champ par l'API, comme l'écran des Paramètres le fait, et rend sa clé de champ. */
async function createField(page: Page, body: Record<string, unknown>): Promise<string> {
  const res = await page.request.post("/api/champs", { data: body });
  expect(res.status()).toBe(201);
  const { field } = (await res.json()) as { field: { id: string } };
  return `cf_${field.id}`;
}

/* Les personnes d'abord : leur historique retient les comptes de test, effacés ensuite par l'amorce. */
function resetAll() {
  resetViews();
  resetCustomFields();
  resetPersons();
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

test.describe("champs personnalisés sur la fiche et dans la liste (CRM-55, CRM-56, contrats 17, 18, 21)", () => {
  test("les champs définis s'affichent sur la fiche entreprise et la fiche personne, s'y saisissent, refusent une valeur hors règle, et deviennent colonne, filtre et tri", async ({ adminPage }) => {
    const mark = tag();
    const effectifLabel = named("Effectif", mark);
    const segmentLabel = named("Segment", mark);
    await createField(adminPage, { objectType: "company", label: effectifLabel, type: "number" });
    const segment = await createField(adminPage, { objectType: "company", label: segmentLabel, type: "list", values: ["Grand compte", "PME", "Startup"], required: true });
    const note = await createField(adminPage, { objectType: "person", label: named("Note", mark), type: "text" });

    /* Contrat 21 : le champ obligatoire vide bloque la création, et il est proposé dans le dialogue. */
    const refused = await adminPage.request.post("/api/entreprises", { data: { name: named("Sans segment", mark), type: "client" } });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).fields[segment]).toContain("obligatoire");

    await adminPage.goto("/entreprises");
    await adminPage.getByRole("button", { name: "Nouvelle entreprise" }).click();
    await expect(adminPage.getByRole("dialog", { name: "Nouvelle entreprise" }).getByLabel(segmentLabel)).toBeVisible();
    await adminPage.keyboard.press("Escape");

    const created = await adminPage.request.post("/api/entreprises", { data: { name: named("Alpha", mark), type: "client", [segment]: "PME" } });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    await adminPage.request.post("/api/entreprises", { data: { name: named("Bravo", mark), type: "prospect", [segment]: "Grand compte" } });

    /* Contrat 17 : les deux champs sont sur la fiche, dans leur propre section. */
    await adminPage.goto(`/entreprises/${id}`);
    const others = adminPage.getByRole("region", { name: "Autres champs" });
    await expect(others.getByLabel(effectifLabel)).toBeVisible();
    await expect(others.getByRole("combobox", { name: segmentLabel })).toBeVisible();

    /* Contrat 21 : un champ nombre est un champ nombre — « douze » n'y entre pas, et rien n'est envoyé.
       Le refus du serveur, lui, s'affiche sous le champ : le mécanisme est celui du SIREN (2.1a). */
    await others.getByLabel(effectifLabel).pressSequentially("douze");
    await expect(others.getByLabel(effectifLabel)).toHaveValue("");
    await expect(others.getByRole("alert")).toHaveCount(0);

    await others.getByLabel(effectifLabel).fill("120");
    await others.getByLabel(effectifLabel).blur();
    /* Contrat 17 : le changement entre dans le fil, sous le libellé du champ — et il n'y entre qu'après la réponse 2xx. */
    await expect(adminPage.getByRole("region", { name: "Fil d'activité" }).getByText(`${effectifLabel} : vide → 120`)).toBeVisible();
    await adminPage.reload();
    await expect(adminPage.getByRole("region", { name: "Autres champs" }).getByLabel(effectifLabel)).toHaveValue("120");

    /* Contrat 18 : le champ liste est colonne, filtre et tri de la liste, sans autre manipulation. */
    await adminPage.goto(`/entreprises?colonnes=${segment}&f=name:contient:${mark}`);
    const table = adminPage.getByRole("table", { name: "Entreprises" });
    await expect(table.getByRole("columnheader", { name: segmentLabel })).toBeVisible();
    await expect(table.getByRole("cell", { name: "PME" })).toBeVisible();

    await adminPage.goto(`/entreprises?f=name:contient:${mark}&f=${segment}:est:PME`);
    const filtered = adminPage.getByRole("table", { name: "Entreprises" });
    await expect(filtered.getByRole("row")).toHaveCount(2);
    await expect(filtered.getByRole("link", { name: named("Alpha", mark) })).toBeVisible();

    await adminPage.goto(`/entreprises?f=name:contient:${mark}&tri=${segment}:asc`);
    await expect(adminPage.getByRole("table", { name: "Entreprises" }).getByRole("columnheader", { name: "Raison sociale" })).toBeVisible();

    /* Le menu des colonnes propose le champ : rien n'a été branché à la main. */
    await adminPage.getByRole("button", { name: "Colonnes" }).click();
    await expect(adminPage.locator('[data-slot="column-menu"]').getByText(segmentLabel)).toBeVisible();
    await adminPage.keyboard.press("Escape");

    /* La fiche personne compose ses briques à la main : elle porte la même section. */
    const person = await adminPage.request.post("/api/personnes", { data: { firstName: "Iris", lastName: named("Nadal", mark), [note]: "à rappeler" } });
    expect(person.status()).toBe(201);
    await adminPage.goto(`/personnes/${((await person.json()) as { id: string }).id}`);
    await expect(adminPage.getByRole("region", { name: "Autres champs" }).getByLabel(named("Note", mark))).toHaveValue("à rappeler");
  });
});

test.describe("champ personnalisé archivé (CRM-56, contrat 19)", () => {
  test("garde la valeur lisible en texte sur la fiche, ne se saisit plus, et laisse s'ouvrir une vue qui filtrait dessus avec « filtre inactif »", async ({ adminPage }) => {
    const mark = tag();
    const effectifLabel = named("Effectif", mark);
    const effectif = await createField(adminPage, { objectType: "company", label: effectifLabel, type: "number" });

    const created = await adminPage.request.post("/api/entreprises", { data: { name: named("Echo", mark), type: "client", [effectif]: 90 } });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const view = await adminPage.request.post("/api/vues", { data: { objectType: "company", name: named("Grosses structures", mark), query: `f=${effectif}:plus_grand:50` } });
    expect(view.status()).toBe(201);
    const viewId = ((await view.json()) as { id: string }).id;

    expect((await adminPage.request.patch(`/api/champs/${effectif.replace("cf_", "")}`, { data: { archived: true } })).status()).toBe(200);

    /* La valeur reste lisible, en texte : un contrôle éteint la rendrait à demi transparente. */
    await adminPage.goto(`/entreprises/${id}`);
    const others = adminPage.getByRole("region", { name: "Autres champs" });
    await expect(others.getByText("90")).toBeVisible();
    await expect(others.getByRole("spinbutton", { name: effectifLabel })).toHaveCount(0);
    await expect(others.getByRole("textbox", { name: effectifLabel })).toHaveCount(0);

    /* La vue s'ouvre encore, avec son avertissement, et rend toutes les fiches. */
    await adminPage.goto(`/entreprises?vue=${viewId}`);
    const warning = adminPage.locator('[data-slot="list-warnings"]');
    await expect(warning).toContainText("Filtre inactif");
    await expect(warning).toContainText(effectifLabel);
    await expect(adminPage.getByRole("link", { name: named("Echo", mark) })).toBeVisible();

    /* Le champ archivé ne se pose plus en filtre : la barre de filtres ne le propose pas. */
    await adminPage.getByRole("button", { name: "Ajouter un filtre" }).click();
    await expect(adminPage.locator('[data-slot="filter-form"]').getByLabel("Champ").getByRole("option", { name: effectifLabel })).toHaveCount(0);
  });
});
