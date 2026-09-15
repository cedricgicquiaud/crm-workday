import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const suffix = () => `${Date.now().toString(36)} (e2e)`;

test.beforeAll(() => {
  resetPersons();
  resetObjects();
  seedAccounts();
});
test.afterAll(() => {
  resetPersons();
  resetObjects();
});

async function createPerson(page: Page, data: Record<string, unknown>): Promise<string> {
  const created = await page.request.post("/api/personnes", { data });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

test.describe("« Nouveau consultant » depuis la liste et la palette (CRM-83, CRM-84, contrats 2, 5 et 7)", () => {
  test("ouvre « Consultants » après « Personnes » dans la barre latérale, crée un consultant en cinq champs, et le trouve en tête de la liste", async ({ memberPage }) => {
    const lastName = `Dupont ${suffix()}`;
    const email = `chloe.${Date.now()}@dupont-conseil.fr`;

    await memberPage.goto("/accueil");
    const objectsNav = memberPage.locator('[data-slot="sidebar"]').getByRole("navigation", { name: "Objets" });
    await expect(objectsNav.getByRole("link")).toHaveText(["Entreprises", "Personnes", "Consultants"]);
    await objectsNav.getByRole("link", { name: "Consultants" }).click();
    await expect(memberPage).toHaveURL("/consultants");
    await expect(memberPage.getByRole("heading", { level: 1, name: "Consultants" })).toBeVisible();

    await memberPage.getByRole("button", { name: "Nouveau consultant" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouveau consultant" });
    await dialog.getByLabel("Prénom").fill("Chloé");
    await dialog.getByLabel("Nom", { exact: true }).fill(lastName);
    await dialog.getByLabel("Email principal").fill(email);
    await dialog.getByRole("combobox", { name: "Statut" }).click();
    await memberPage.getByRole("option", { name: "Freelance", exact: true }).click();
    await dialog.getByLabel("Coût journalier").fill("650");
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(memberPage).toHaveURL(/\/personnes\/[0-9a-f-]{36}$/);
    await expect(memberPage.getByRole("heading", { level: 1, name: `Chloé ${lastName}` })).toBeVisible();
    await expect(memberPage.getByText("Profils : Consultant")).toBeVisible();
    const section = memberPage.getByRole("region", { name: "Profil consultant" });
    await expect(section.getByRole("combobox", { name: "Statut" })).toContainText("Freelance");
    await expect(section.getByLabel("Coût journalier")).toHaveValue("650");

    await memberPage.goto("/consultants");
    const table = memberPage.getByRole("table", { name: "Consultants" });
    await expect(table.getByRole("row").nth(1).getByRole("link", { name: `Chloé ${lastName}` })).toBeVisible();
    await expect(table.getByRole("row").nth(1)).toContainText("650,00 €");
  });

  test("la palette ⌘K retrouve le consultant par son nom, annonce son statut et ses modules, et ouvre sa fiche", async ({ memberPage }) => {
    const lastName = `Duquesne ${suffix()}`;
    const id = await createPerson(memberPage, { firstName: "Chloé", lastName });
    expect((await memberPage.request.patch(`/api/personnes/${id}/profil-consultant`, { data: { status: "freelance", modules: ["hcm", "integration"] } })).status()).toBe(200);

    await memberPage.goto("/accueil");
    await memberPage.keyboard.press("ControlOrMeta+k");
    const palette = memberPage.getByRole("dialog");
    await palette.getByRole("combobox").fill("duq");
    const hit = palette.getByRole("option", { name: new RegExp(`Chloé ${lastName.replace(/[()]/g, "\\$&")}`) });
    await expect(hit).toContainText("Freelance · HCM, Integration");
    await hit.click();
    await expect(memberPage).toHaveURL(`/personnes/${id}`);
  });

  test("la palette ⌘K propose les trois créations, et « Nouveau consultant » ouvre le dialogue depuis n'importe où", async ({ memberPage }) => {
    await memberPage.goto("/accueil");
    await memberPage.keyboard.press("ControlOrMeta+k");
    const palette = memberPage.getByRole("dialog");
    await palette.getByRole("combobox").fill("Nouve");
    await expect(palette.getByRole("option", { name: /^Nouvelle entreprise/ })).toBeVisible();
    await expect(palette.getByRole("option", { name: /^Nouvelle personne/ })).toBeVisible();
    await palette.getByRole("option", { name: /^Nouveau consultant/ }).click();
    await expect(memberPage).toHaveURL(/\/consultants\?creation=1/);
    await expect(memberPage.getByRole("dialog", { name: "Nouveau consultant" })).toBeVisible();
  });

  test("refuse une adresse déjà portée en nommant la personne, et signale un doublon probable sur le nom sans empêcher la création", async ({ memberPage }) => {
    const lastName = `Berger ${suffix()}`;
    const email = `marc.${Date.now()}@berger.fr`;
    await createPerson(memberPage, { firstName: "Marc", lastName, email });

    await memberPage.goto("/consultants");
    await memberPage.getByRole("button", { name: "Nouveau consultant" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouveau consultant" });
    await dialog.getByLabel("Prénom").fill("Marc");
    await dialog.getByLabel("Nom", { exact: true }).fill(lastName);
    await dialog.getByRole("combobox", { name: "Statut" }).click();
    await memberPage.getByRole("option", { name: "Salarié", exact: true }).click();

    /* Le nom d'une personne existante : le doublon probable est signalé, et propose d'ouvrir sa fiche. */
    const hint = dialog.getByRole("status");
    await expect(hint).toContainText(`Marc ${lastName}`);
    await expect(hint.getByRole("link", { name: "Ouvrir la fiche" })).toBeVisible();

    /* La même adresse, en une autre casse : refus 409 qui nomme la personne, et rien n'est créé. */
    await dialog.getByLabel("Email principal").fill(email.toUpperCase());
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(dialog.getByRole("alert")).toContainText(`déjà portée par « Marc ${lastName} »`);
    await expect(memberPage).toHaveURL(/\/consultants/);

    /* Avec une autre adresse, on crée quand même : le signal n'empêche rien. */
    await dialog.getByLabel("Email principal").fill(`marc.bis.${Date.now()}@berger.fr`);
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(memberPage).toHaveURL(/\/personnes\/[0-9a-f-]{36}$/);
    await expect(memberPage.getByText("Profils : Consultant")).toBeVisible();
  });

  test("la liste ne montre que des consultants, même avec un filtre bricolé dans l'adresse, et tient à 375 px", async ({ memberPage }) => {
    const contactName = `Contact Seul ${suffix()}`;
    await createPerson(memberPage, { firstName: "Simple", lastName: contactName });
    const consultantName = `Consultant Seul ${suffix()}`;
    const id = await createPerson(memberPage, { firstName: "Vrai", lastName: consultantName });
    expect((await memberPage.request.patch(`/api/personnes/${id}/profil-consultant`, { data: { status: "salarie" } })).status()).toBe(200);

    await memberPage.goto("/consultants?f=profiles:est_vide:");
    await expect(memberPage.getByText(`Simple ${contactName}`)).toHaveCount(0);
    await memberPage.goto("/consultants");
    await expect(memberPage.getByRole("link", { name: `Vrai ${consultantName}` })).toBeVisible();
    await expect(memberPage.getByText(`Simple ${contactName}`)).toHaveCount(0);

    await memberPage.setViewportSize({ width: 375, height: 900 });
    await memberPage.reload();
    await expect(memberPage.getByRole("heading", { level: 1, name: "Consultants" })).toBeVisible();
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
