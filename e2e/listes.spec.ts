import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";

/* Les fiches finissent par « (e2e) » : la fixture des objets les efface, et rien d'autre. */
/* Next.js pose un annonceur de route au même rôle dans le corps de page : les avertissements se ciblent par leur conteneur. */
const WARNINGS = '[data-slot="list-warnings"]';
const FILTER_FORM = '[data-slot="filter-form"]';
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

test.beforeAll(() => {
  resetObjects();
  seedAccounts();
});
test.afterAll(() => resetObjects());

async function createCompany(page: Page, name: string, values: Record<string, string>) {
  const res = await page.request.post("/api/entreprises", { data: { name, ...values } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Les lignes de données de la liste (l'en-tête compte comme une ligne du tableau). */
const rows = (page: Page) => page.getByRole("table", { name: "Entreprises" }).getByRole("row").filter({ hasNot: page.getByRole("columnheader") });

const names = async (page: Page) => (await rows(page).getByRole("link").allTextContents()).map((text) => text.trim());

test.describe("filtres en puces et état dans l'URL (CRM-47, contrat 23)", () => {
  test("un membre pose deux filtres depuis la liste : l'URL les porte, un autre onglet ouvre le même état, et retirer une puce retire son filtre", async ({ memberPage }) => {
    const mark = tag();
    await createCompany(memberPage, named("Alpha", mark), { type: "client", city: "Paris" });
    await createCompany(memberPage, named("Bravo", mark), { type: "prospect", city: "Paris" });
    await createCompany(memberPage, named("Charlie", mark), { type: "client", city: "Lyon" });

    /* Un premier filtre posé par l'URL borne la liste aux fiches de ce test. */
    await memberPage.goto(`/entreprises?f=name:contient:${mark}&tri=name:asc`);
    expect(await names(memberPage)).toEqual([named("Alpha", mark), named("Bravo", mark), named("Charlie", mark)]);

    await memberPage.getByRole("button", { name: "Ajouter un filtre" }).click();
    const form = memberPage.locator(FILTER_FORM);
    await form.getByLabel("Champ").selectOption({ label: "Type" });
    await form.getByLabel("Opérateur").selectOption({ label: "est" });
    await form.getByLabel("Valeur").selectOption({ label: "Client" });
    await form.getByRole("button", { name: "Ajouter", exact: true }).click();

    await expect(memberPage).toHaveURL(/f=type%3Aest%3Aclient/);
    expect(await names(memberPage)).toEqual([named("Alpha", mark), named("Charlie", mark)]);
    await expect(memberPage.getByRole("button", { name: "Retirer le filtre Type est Client" })).toBeVisible();

    await memberPage.getByRole("button", { name: "Ajouter un filtre" }).click();
    await form.getByLabel("Champ").selectOption({ label: "Ville" });
    await form.getByLabel("Opérateur").selectOption({ label: "contient" });
    await form.getByLabel("Valeur").fill("Paris");
    await form.getByRole("button", { name: "Ajouter", exact: true }).click();

    await expect(memberPage).toHaveURL(/f=city%3Acontient%3AParis/);
    expect(await names(memberPage)).toEqual([named("Alpha", mark)]);

    /* La même adresse, ouverte dans un autre onglet, montre le même état (contrat 23). */
    const shared = memberPage.url();
    const other = await memberPage.context().newPage();
    await other.goto(shared);
    expect(await names(other)).toEqual([named("Alpha", mark)]);
    await expect(other.getByRole("button", { name: "Retirer le filtre Ville contient Paris" })).toBeVisible();
    await other.close();

    /* Retirer une puce retire son filtre de l'URL. */
    await memberPage.getByRole("button", { name: "Retirer le filtre Type est Client" }).click();
    await expect(memberPage).not.toHaveURL(/f=type%3Aest%3Aclient/);
    expect(await names(memberPage)).toEqual([named("Alpha", mark), named("Bravo", mark)]);
  });

  test("une URL dont le filtre porte sur un champ inconnu ou un opérateur invalide s'ouvre avec l'avertissement « filtre inactif », jamais une erreur", async ({ memberPage }) => {
    const mark = tag();
    await createCompany(memberPage, named("Delta", mark), { type: "client", city: "Nantes" });

    await memberPage.goto(`/entreprises?f=name:contient:${mark}&f=chiffre_affaires:est:12&f=type:contient:cli`);

    await expect(memberPage.getByRole("heading", { level: 1, name: "Entreprises" })).toBeVisible();
    const warnings = memberPage.locator(WARNINGS).getByRole("status");
    await expect(warnings).toHaveText([
      "Filtre inactif : « chiffre_affaires » n'est pas un champ de cette liste.",
      "Filtre inactif : « contient » ne s'applique pas au champ « Type ».",
    ]);
    /* La liste s'affiche quand même, sans les filtres ignorés. */
    expect(await names(memberPage)).toEqual([named("Delta", mark)]);
  });
});
