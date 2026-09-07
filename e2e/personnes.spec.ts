import type { Locator, Page } from "@playwright/test";
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

async function pickOption(page: Page, combobox: Locator, option: string | RegExp) {
  await combobox.click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

async function createCompany(page: Page, name: string): Promise<string> {
  const created = await page.request.post("/api/entreprises", { data: { name, type: "client" } });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

test.describe("contact d'une entreprise : liens, rôle, changement d'entreprise (CRM-42, contrats 6 et 7)", () => {
  test("une personne rattachée à une entreprise apparaît dans les « Contacts » de sa fiche ; sa propre fiche montre l'entreprise, le rôle « Décideur » se règle, et changer l'entreprise la déplace en gardant l'ancienne dans l'historique", async ({ memberPage }) => {
    const solveige = `Banque Solveige ${suffix()}`;
    const ferrandi = `Groupe Ferrandi ${suffix()}`;
    const solveigeId = await createCompany(memberPage, solveige);
    const ferrandiId = await createCompany(memberPage, ferrandi);
    const lastName = `Dupont ${suffix()}`;
    const created = await memberPage.request.post("/api/personnes", { data: { firstName: "Jean", lastName, email: `jean.${Date.now()}@solveige.fr`, companyId: solveigeId, jobTitle: "DSI" } });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const fullName = `Jean ${lastName}`;

    await memberPage.goto(`/entreprises/${solveigeId}`);
    const contacts = memberPage.getByRole("region", { name: "Liens" }).getByRole("region", { name: "Contacts" });
    await expect(contacts.getByRole("link", { name: fullName })).toBeVisible();
    await contacts.getByRole("link", { name: fullName }).click();
    await expect(memberPage).toHaveURL(`/personnes/${id}`);

    await expect(memberPage.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
    await expect(memberPage.getByText("Profils : Contact")).toBeVisible();
    const links = memberPage.getByRole("region", { name: "Liens" }).getByRole("region", { name: "Entreprise" });
    await expect(links.getByRole("link", { name: solveige })).toBeVisible();
    const profile = memberPage.getByRole("region", { name: "Profil contact" });
    await expect(profile.getByRole("combobox", { name: "Entreprise" })).toContainText(solveige);
    await expect(profile.getByLabel("Poste")).toHaveValue("DSI");
    await expect(profile.getByRole("combobox", { name: "Rôle dans la décision" })).toContainText("Non précisé");

    const history = memberPage.getByRole("region", { name: "Historique" });
    await pickOption(memberPage, profile.getByRole("combobox", { name: "Rôle dans la décision" }), "Décideur");
    await expect(profile.getByRole("combobox", { name: "Rôle dans la décision" })).toContainText("Décideur");
    await expect(history.getByText("decisionRole : Non précisé → Décideur")).toBeVisible();

    await pickOption(memberPage, profile.getByRole("combobox", { name: "Entreprise" }), ferrandi);
    await expect(profile.getByRole("combobox", { name: "Entreprise" })).toContainText(ferrandi);
    await expect(links.getByRole("link", { name: ferrandi })).toBeVisible();
    await expect(links.getByRole("link", { name: solveige })).toHaveCount(0);
    await expect(history.getByText(`companyId : ${solveige} → ${ferrandi}`)).toBeVisible();

    await memberPage.reload();
    await expect(profile.getByRole("combobox", { name: "Entreprise" })).toContainText(ferrandi);
    await expect(profile.getByRole("combobox", { name: "Rôle dans la décision" })).toContainText("Décideur");

    await memberPage.goto(`/entreprises/${solveigeId}`);
    await expect(memberPage.getByRole("region", { name: "Contacts" }).getByText("Aucune fiche liée.")).toBeVisible();
    await memberPage.goto(`/entreprises/${ferrandiId}`);
    await expect(memberPage.getByRole("region", { name: "Contacts" }).getByRole("link", { name: fullName })).toBeVisible();
  });
});
