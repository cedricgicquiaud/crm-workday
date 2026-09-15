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

async function createCompany(page: Page, name: string, type: string): Promise<string> {
  const created = await page.request.post("/api/entreprises", { data: { name, type } });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function createPerson(page: Page, data: Record<string, unknown>): Promise<string> {
  const created = await page.request.post("/api/personnes", { data });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/** Une écriture du profil part et revient : on attend la réponse du serveur, jamais le texte saisi. */
async function saveProfile(page: Page, action: () => Promise<void>) {
  const [response] = await Promise.all([page.waitForResponse((res) => res.url().includes("/profil-consultant") && res.request().method() === "PATCH"), action()]);
  expect(response.status()).toBe(200);
}

test.describe("profil consultant sur la fiche d'une personne (CRM-81, contrats 3, 4 et 9)", () => {
  test("ajoute un profil consultant, coche ses modules et sa certification, choisit sa société de facturation : tout se relit après rechargement, l'entreprise le liste sous « Consultants facturés » et l'historique dit chaque changement", async ({ memberPage }) => {
    const dupont = `Dupont Conseil ${suffix()}`;
    const dupontId = await createCompany(memberPage, dupont, "societe_de_consultant");
    const client = `Banque Solveige ${suffix()}`;
    await createCompany(memberPage, client, "client");
    const lastName = `Marchand ${suffix()}`;
    const id = await createPerson(memberPage, { firstName: "Léa", lastName });

    await memberPage.goto(`/personnes/${id}`);
    const section = memberPage.getByRole("region", { name: "Profil consultant" });
    await expect(memberPage.getByText("Profils : Aucun")).toBeVisible();
    await expect(section.getByText("Cette personne n'a pas de profil consultant.")).toBeVisible();

    await section.getByRole("button", { name: "Ajouter un profil consultant" }).click();
    await saveProfile(memberPage, async () => {
      await section.getByRole("combobox", { name: "Statut" }).click();
      await memberPage.getByRole("option", { name: "Freelance", exact: true }).click();
    });
    await expect(memberPage.getByText("Profils : Consultant")).toBeVisible();

    /* Deux écritures successives attendent chacune leur réponse : enchaînées, elles rendraient le test instable. */
    await saveProfile(memberPage, () => section.getByRole("checkbox", { name: "HCM", exact: true }).click());
    await saveProfile(memberPage, () => section.getByRole("checkbox", { name: "Integration", exact: true }).click());
    await saveProfile(memberPage, () => section.getByRole("checkbox", { name: "HCM certifié" }).click());
    await saveProfile(memberPage, () => section.getByLabel("Années d'expérience").fill("6").then(() => section.getByLabel("Années d'expérience").press("Enter")));
    await saveProfile(memberPage, () => section.getByLabel("Langues").fill("français, anglais").then(() => section.getByLabel("Langues").press("Enter")));
    await saveProfile(memberPage, () => section.getByLabel("CV").fill("https://exemple.fr/cv-lea.pdf").then(() => section.getByLabel("CV").press("Enter")));
    await saveProfile(memberPage, async () => {
      await section.getByRole("combobox", { name: "Société de facturation" }).click();
      /* Le sélecteur ne propose que le type imposé par le statut : l'entreprise cliente n'y est pas. */
      await expect(memberPage.getByRole("option", { name: client })).toHaveCount(0);
      await memberPage.getByRole("option", { name: dupont }).click();
    });

    await memberPage.reload();
    await expect(section.getByRole("combobox", { name: "Statut" })).toContainText("Freelance");
    await expect(section.getByRole("checkbox", { name: "HCM", exact: true })).toBeChecked();
    await expect(section.getByRole("checkbox", { name: "Integration", exact: true })).toBeChecked();
    await expect(section.getByRole("checkbox", { name: "HCM certifié" })).toBeChecked();
    await expect(section.getByRole("checkbox", { name: "Integration certifié" })).not.toBeChecked();
    await expect(section.getByLabel("Années d'expérience")).toHaveValue("6");
    await expect(section.getByLabel("Langues")).toHaveValue("français, anglais");
    await expect(section.getByLabel("CV")).toHaveValue("https://exemple.fr/cv-lea.pdf");
    await expect(section.getByRole("combobox", { name: "Société de facturation" })).toContainText(dupont);

    const feed = memberPage.getByRole("region", { name: "Fil d'activité" });
    await expect(feed.getByText("Modules : vide → HCM, Integration")).toBeVisible();
    await expect(feed.getByText("Certifié sur : vide → HCM")).toBeVisible();
    await expect(feed.getByText(`Société de facturation : vide → ${dupont}`)).toBeVisible();
    await expect(feed.getByText("Années d'expérience : vide → 6")).toBeVisible();

    await memberPage.goto(`/entreprises/${dupontId}`);
    const billed = memberPage.getByRole("region", { name: "Liens" }).getByRole("region", { name: "Consultants facturés" });
    await expect(billed.getByRole("link", { name: `Léa ${lastName}` })).toBeVisible();
  });

  test("une personne qui a déjà un profil contact reçoit un profil consultant : le badge porte les deux, les deux sections coexistent, et les champs du profil ne sont pas dans « Champs »", async ({ memberPage }) => {
    const acme = `Acme ${suffix()}`;
    const acmeId = await createCompany(memberPage, acme, "client");
    const lastName = `Bicasquette ${suffix()}`;
    const id = await createPerson(memberPage, { firstName: "Théo", lastName, companyId: acmeId, jobTitle: "Architecte" });

    await memberPage.goto(`/personnes/${id}`);
    await expect(memberPage.getByText("Profils : Contact")).toBeVisible();
    const section = memberPage.getByRole("region", { name: "Profil consultant" });
    await section.getByRole("button", { name: "Ajouter un profil consultant" }).click();
    await saveProfile(memberPage, async () => {
      await section.getByRole("combobox", { name: "Statut" }).click();
      await memberPage.getByRole("option", { name: "Salarié", exact: true }).click();
    });

    await memberPage.reload();
    await expect(memberPage.getByText("Profils : Contact, Consultant")).toBeVisible();
    await expect(memberPage.getByRole("region", { name: "Profil contact" }).getByRole("combobox", { name: "Entreprise" })).toContainText(acme);
    await expect(section.getByRole("combobox", { name: "Statut" })).toContainText("Salarié");

    /* Les champs du profil ne se montrent que dans leur section (D19) : « Champs » garde « Poste ». */
    const fields = memberPage.getByRole("region", { name: "Champs" });
    await expect(fields.getByLabel("Poste")).toHaveValue("Architecte");
    await expect(fields.getByLabel("Statut")).toHaveCount(0);
    await expect(fields.getByLabel("Coût journalier")).toHaveCount(0);

    /* Il est à la fois dans les contacts de son entreprise et dans la liste des consultants. */
    await memberPage.goto(`/entreprises/${acmeId}`);
    await expect(memberPage.getByRole("region", { name: "Liens" }).getByRole("region", { name: "Contacts" }).getByRole("link", { name: `Théo ${lastName}` })).toBeVisible();
    await memberPage.goto("/consultants");
    await expect(memberPage.getByRole("table", { name: "Consultants" }).getByRole("link", { name: `Théo ${lastName}` })).toBeVisible();
  });

  test("sur une fiche archivée, la section du profil se lit et n'a aucun contrôle", async ({ memberPage }) => {
    const lastName = `Archivé ${suffix()}`;
    const id = await createPerson(memberPage, { firstName: "Paul", lastName });
    expect((await memberPage.request.patch(`/api/personnes/${id}/profil-consultant`, { data: { status: "portage", dailyCost: 480 } })).status()).toBe(200);
    expect((await memberPage.request.post(`/api/objets/person/${id}/archiver`, { data: {} })).status()).toBe(200);

    await memberPage.goto(`/personnes/${id}`);
    const section = memberPage.getByRole("region", { name: "Profil consultant" });
    await expect(section.getByText("Portage")).toBeVisible();
    await expect(section.getByText("480,00 €")).toBeVisible();
    await expect(section.getByRole("combobox")).toHaveCount(0);
    await expect(section.getByRole("textbox")).toHaveCount(0);
    await expect(section.getByRole("button")).toHaveCount(0);
  });

  test("à 375 px, la section du profil tient dans la largeur : aucun défilement horizontal, un seul titre de page", async ({ memberPage }) => {
    const lastName = `Mobile ${suffix()}`;
    const id = await createPerson(memberPage, { firstName: "Nina", lastName });
    expect((await memberPage.request.patch(`/api/personnes/${id}/profil-consultant`, { data: { status: "freelance", modules: ["hcm", "adaptive_planning"], languages: "français" } })).status()).toBe(200);

    await memberPage.setViewportSize({ width: 375, height: 900 });
    await memberPage.goto(`/personnes/${id}`);
    await expect(memberPage.getByRole("region", { name: "Profil consultant" })).toBeVisible();
    await expect(memberPage.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
