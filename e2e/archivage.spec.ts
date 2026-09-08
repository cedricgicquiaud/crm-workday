import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const suffix = () => `${Date.now().toString(36)} (e2e)`;

/* Les personnes d'abord : une personne rattachée retient son entreprise. */
function resetAll() {
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

async function createPerson(page: Page, lastName: string): Promise<string> {
  const res = await page.request.post("/api/personnes", { data: { firstName: "Claire", lastName } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Le menu d'actions de la fiche, ouvert sur sa commande. */
async function runAction(page: Page, action: string) {
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

const ARCHIVED_BANNER = "Entreprise archivée : la fiche est en lecture seule.";

test.describe("archiver et restaurer une entreprise depuis sa fiche (CRM-61, contrat 30)", () => {
  test("un membre archive : la bannière l'annonce, la fiche passe en lecture seule et sort de la liste ; « Restaurer » la ramène telle qu'elle était", async ({ memberPage }) => {
    const name = `Fonderie Vasseur ${suffix()}`;
    const id = await createCompany(memberPage, name);
    await memberPage.goto(`/entreprises/${id}`);

    const fields = memberPage.getByRole("region", { name: "Champs" });
    const links = memberPage.getByRole("region", { name: "Liens" });
    await expect(fields.getByRole("textbox", { name: "Raison sociale" })).toBeVisible();
    await expect(links.getByRole("button", { name: "Ajouter une personne" })).toBeVisible();

    await runAction(memberPage, "Archiver");

    await expect(memberPage.getByText(ARCHIVED_BANNER)).toBeVisible();
    /* Un champ en lecture seule se rend en texte : un contrôle éteint serait à demi transparent. */
    await expect(fields.getByRole("textbox", { name: "Raison sociale" })).toHaveCount(0);
    await expect(fields.getByText(name)).toBeVisible();
    await expect(memberPage.getByRole("group", { name: "Nouvelle activité" })).toHaveCount(0);
    await expect(links.getByRole("button", { name: "Ajouter une personne" })).toHaveCount(0);

    await memberPage.goto(`/entreprises?f=name:contient:${encodeURIComponent(name)}`);
    await expect(memberPage.getByRole("link", { name })).toHaveCount(0);
    await memberPage.getByRole("switch", { name: "Archivées" }).click();
    await expect(memberPage.getByRole("link", { name })).toBeVisible();

    await memberPage.goto(`/entreprises/${id}`);
    await runAction(memberPage, "Restaurer");

    await expect(memberPage.getByText(ARCHIVED_BANNER)).toHaveCount(0);
    await expect(fields.getByRole("textbox", { name: "Raison sociale" })).toHaveValue(name);
    await expect(memberPage.getByRole("group", { name: "Nouvelle activité" })).toBeVisible();
  });
});

test.describe("archiver une personne : profil contact en lecture seule (CRM-61, contrat 30)", () => {
  test("« Ajouter un profil contact » disparaît sur une personne archivée, et un profil déjà posé se lit en texte", async ({ memberPage }) => {
    const companyName = `Groupe Ferrandi ${suffix()}`;
    const companyId = await createCompany(memberPage, companyName);
    const profile = memberPage.getByRole("region", { name: "Profil contact" });

    const soloId = await createPerson(memberPage, `Solo ${suffix()}`);
    await memberPage.goto(`/personnes/${soloId}`);
    await expect(profile.getByRole("button", { name: "Ajouter un profil contact" })).toBeVisible();
    await runAction(memberPage, "Archiver");
    await expect(memberPage.getByText("Personne archivée : la fiche est en lecture seule.")).toBeVisible();
    await expect(profile.getByRole("button", { name: "Ajouter un profil contact" })).toHaveCount(0);

    const contactId = await createPerson(memberPage, `Contact ${suffix()}`);
    const attached = await memberPage.request.patch(`/api/personnes/${contactId}/profil-contact`, { data: { companyId } });
    expect(attached.status()).toBe(200);
    await memberPage.goto(`/personnes/${contactId}`);
    await expect(profile.getByRole("combobox", { name: "Entreprise" })).toBeVisible();

    await runAction(memberPage, "Archiver");
    await expect(profile.getByRole("combobox", { name: "Entreprise" })).toHaveCount(0);
    await expect(profile.getByRole("combobox", { name: "Rôle dans la décision" })).toHaveCount(0);
    await expect(profile.getByText(companyName)).toBeVisible();
    await expect(profile.getByText("Non précisé")).toBeVisible();
  });
});

/** Rattache une personne à une entreprise : le contact ainsi créé retient sa fiche. */
async function attachContact(page: Page, companyId: string, lastName: string): Promise<string> {
  const personId = await createPerson(page, lastName);
  const attached = await page.request.patch(`/api/personnes/${personId}/profil-contact`, { data: { companyId } });
  expect(attached.status()).toBe(200);
  return personId;
}

test.describe("supprimer définitivement une entreprise (CRM-62, CRM-63, contrat 31)", () => {
  test("un membre ne voit pas la commande ; l'administrateur la voit, l'écran lui liste ce qui retient une fiche liée, et une fiche sans lien disparaît", async ({ memberPage, adminPage }) => {
    const heldName = `Fonderie Retenue ${suffix()}`;
    const heldId = await createCompany(memberPage, heldName);
    await attachContact(memberPage, heldId, `Bonnet ${suffix()}`);

    await memberPage.goto(`/entreprises/${heldId}`);
    await memberPage.getByRole("button", { name: "Actions" }).click();
    await expect(memberPage.getByRole("menuitem", { name: "Archiver" })).toBeVisible();
    await expect(memberPage.getByRole("menuitem", { name: "Supprimer définitivement" })).toHaveCount(0);

    await adminPage.goto(`/entreprises/${heldId}`);
    await runAction(adminPage, "Supprimer définitivement");
    const dialog = adminPage.getByRole("dialog", { name: "Supprimer définitivement ?" });
    await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Contacts");
    expect(await dialog.getByRole("alert").getByRole("listitem").allTextContents()).toEqual(["Contacts : 1"]);
    await dialog.getByRole("button", { name: "Annuler" }).click();
    expect((await adminPage.request.get(`/api/entreprises/${heldId}`)).status()).toBe(200);

    const freeName = `Presses Delcourt ${suffix()}`;
    const freeId = await createCompany(adminPage, freeName);
    await adminPage.goto(`/entreprises/${freeId}`);
    await runAction(adminPage, "Supprimer définitivement");
    await adminPage.getByRole("dialog", { name: "Supprimer définitivement ?" }).getByRole("button", { name: "Supprimer définitivement" }).click();

    await expect(adminPage).toHaveURL(/\/entreprises$/);
    await expect(adminPage.getByRole("link", { name: freeName })).toHaveCount(0);
    expect((await adminPage.request.get(`/api/entreprises/${freeId}`)).status()).toBe(404);
  });
});

test.describe("téléphone, 375 px (contrat 25 de la feature 1, D9)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** Aucun défilement horizontal de la page, un seul h1, et aucun cadre qui défile en largeur (un texte tronqué par des points de suspension n'est pas un débordement). */
  async function fitsTheScreen(page: Page, label: string, { modalOpen = false } = {}) {
    /* Un dialogue ouvert masque le reste de la page à l'accessibilité : le titre ne se compte qu'à dialogue fermé. */
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

  test("le menu d'actions, la fiche archivée sous sa bannière et la confirmation de suppression tiennent dans l'écran", async ({ adminPage }) => {
    const id = await createCompany(adminPage, `Fonderie Étroite du Sud-Ouest ${suffix()}`);
    await adminPage.goto(`/entreprises/${id}`);
    await fitsTheScreen(adminPage, "fiche avec le menu d'actions");

    await adminPage.getByRole("button", { name: "Actions" }).click();
    const remove = adminPage.getByRole("menuitem", { name: "Supprimer définitivement" });
    await expect(remove).toBeInViewport();
    await remove.click();
    await expect(adminPage.getByRole("dialog", { name: "Supprimer définitivement ?" })).toBeVisible();
    await fitsTheScreen(adminPage, "confirmation de suppression", { modalOpen: true });
    await adminPage.keyboard.press("Escape");

    await runAction(adminPage, "Archiver");
    await expect(adminPage.getByText(ARCHIVED_BANNER)).toBeVisible();
    await fitsTheScreen(adminPage, "fiche archivée");
  });
});
