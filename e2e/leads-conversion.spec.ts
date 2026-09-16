import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";
import { seedAccounts } from "./fixtures/auth";
import { resetCustomFields } from "./fixtures/champs";
import { resetLeads } from "./fixtures/leads";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";

/* Leads, personnes et entreprises portent un nom qui finit par « (e2e) » ou sont créés par un compte e2e : les fixtures les effacent, et rien d'autre. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Leads d'abord : un lead converti retient sa personne et son entreprise (F10). `resetObjects()` seul doit aussi passer. */
function resetAll() {
  resetCustomFields();
  resetLeads();
  resetPersons();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
test.beforeEach(resetAll);
/* Refus du découpage (T9) : `resetAll()` passe `resetObjects()` après la suite des leads sans buter sur une clé étrangère. Un `resetObjects()` isolé bute sur les profils contact que les tests laissent (déjà vrai avant 4.1b) : les personnes partent d'abord. */
test.afterAll(resetAll);

async function createLead(page: Page, data: Record<string, unknown>): Promise<string> {
  const created = await page.request.post("/api/leads", { data });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function openConversion(page: Page, id: string) {
  await page.goto(`/leads/${id}`);
  await Promise.all([page.waitForResponse((res) => res.url().includes(`/api/leads/${id}/conversion`) && res.request().method() === "GET"), page.getByRole("button", { name: "Convertir" }).click()]);
  const dialog = page.getByRole("dialog", { name: "Convertir le lead" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Confirme la fenêtre et attend la réponse de la conversion. */
async function confirm(page: Page, id: string, dialog: ReturnType<Page["getByRole"]>) {
  await Promise.all([page.waitForResponse((res) => res.url().includes(`/api/leads/${id}/conversion`) && res.request().method() === "POST"), dialog.getByRole("button", { name: "Convertir", exact: true }).click()]);
}

test.describe("convertir un lead depuis sa fiche (CRM-96, contrats 15, 19, 20, 26)", () => {
  test("nouvelle personne et nouvelle entreprise : le refus sans prénom s'affiche sous le champ ; converti, le lead porte le bandeau vers les deux fiches, ses champs se lisent en texte, et la personne montre « Issu du lead »", async ({ memberPage }) => {
    const mark = tag();
    const company = named("Banque X", mark);
    const id = await createLead(memberPage, { firstName: "Julie", lastName: "Martin", companyName: company, email: `julie.${mark}@banque-x.fr`, jobTitle: "DRH", origin: "linkedin" });
    expect((await memberPage.request.patch(`/api/leads/${id}`, { data: { stage: "qualifie" } })).status()).toBe(200);

    const dialog = await openConversion(memberPage, id);
    await expect(dialog.getByText("Une nouvelle personne sera créée.")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: `Créer « ${company} » (prospect)` })).toBeChecked();

    await dialog.getByRole("textbox", { name: "Prénom" }).fill("");
    await confirm(memberPage, id, dialog);
    await expect(dialog.getByRole("alert")).toHaveText(["« Prénom » est obligatoire."]);

    await dialog.getByRole("textbox", { name: "Prénom" }).fill("Julie");
    await confirm(memberPage, id, dialog);
    await expect(dialog).toHaveCount(0);

    const banner = memberPage.getByRole("status").filter({ hasText: "Converti le" });
    await expect(banner.getByRole("link", { name: "Julie Martin" })).toBeVisible();
    await expect(banner.getByRole("link", { name: company })).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Convertir" })).toHaveCount(0);
    await expect(memberPage.getByRole("region", { name: "Champs", exact: true }).getByRole("textbox")).toHaveCount(0);
    await expect(memberPage.getByRole("region", { name: "Fil d'activité" }).getByText(`Converti en Julie Martin · ${company}`)).toBeVisible();

    await banner.getByRole("link", { name: "Julie Martin" }).click();
    await expect(memberPage.getByRole("heading", { level: 1, name: "Julie Martin" })).toBeVisible();
    await expect(memberPage.getByRole("region", { name: "Issu du lead" }).getByRole("link", { name: `Julie Martin · ${company}` })).toBeVisible();
  });

  test("personne retrouvée par son autre adresse : la fenêtre la nomme, lit son prénom et son nom, et dit ce qui sera rempli et ce que la fiche garde", async ({ memberPage }) => {
    const mark = tag();
    const address = `claire.${mark}@banque-w.fr`;
    const person = await memberPage.request.post("/api/personnes", { data: { firstName: "Claire", lastName: named("Dumas", mark), email: `claire.${mark}@perso.fr`, otherEmails: address, linkedin: "https://www.linkedin.com/in/claire" } });
    expect(person.status()).toBe(201);
    const id = await createLead(memberPage, { companyName: named("Banque W", mark), email: address, phone: "01 23 45 67 89", linkedin: "https://www.linkedin.com/in/autre", origin: "linkedin" });

    const dialog = await openConversion(memberPage, id);
    await expect(dialog.getByText(`Cet email est celui de « Claire ${named("Dumas", mark)} »`)).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Prénom" })).toHaveCount(0);
    const differences = dialog.getByRole("list", { name: "Différences" });
    await expect(differences.getByRole("listitem")).toHaveText(["Téléphone : sera rempli", "LinkedIn : la fiche garde le sien"]);

    await confirm(memberPage, id, dialog);
    await expect(memberPage.getByRole("status").filter({ hasText: "Converti le" }).getByRole("link", { name: `Claire ${named("Dumas", mark)}` })).toBeVisible();
  });

  test("personne déjà contact chez Acme : garder « Acme » lie le lead à Acme sans créer l'entreprise du lead", async ({ memberPage }) => {
    const mark = tag();
    const acmeName = named("Acme", mark);
    const acme = await memberPage.request.post("/api/entreprises", { data: { name: acmeName, type: "client" } });
    expect(acme.status()).toBe(201);
    const { id: acmeId } = (await acme.json()) as { id: string };
    const address = `yves.${mark}@acme.fr`;
    expect((await memberPage.request.post("/api/personnes", { data: { firstName: "Yves", lastName: named("Garnier", mark), email: address, companyId: acmeId, jobTitle: "Acheteur IT" } })).status()).toBe(201);
    const bankName = named("Banque Garde", mark);
    const id = await createLead(memberPage, { companyName: bankName, email: address, origin: "recommandation" });

    const dialog = await openConversion(memberPage, id);
    await expect(dialog.getByText(`Déjà contact chez « ${acmeName} » : quelle entreprise garder ?`)).toBeVisible();
    await dialog.getByRole("radio", { name: `Garder « ${acmeName} »` }).check();
    await expect(dialog.getByRole("textbox", { name: "Entreprise" })).toHaveCount(0);
    /* Garder « Acme » laisse le profil entier inchangé (D15) : ni poste ni rôle à saisir, une phrase le dit. */
    await expect(dialog.getByRole("textbox", { name: "Poste" })).toHaveCount(0);
    await expect(dialog.getByRole("combobox", { name: "Rôle dans la décision" })).toHaveCount(0);
    await expect(dialog.getByText(`Le profil contact chez « ${acmeName} » reste inchangé.`)).toBeVisible();
    await confirm(memberPage, id, dialog);

    const banner = memberPage.getByRole("status").filter({ hasText: "Converti le" });
    await expect(banner.getByRole("link", { name: acmeName })).toBeVisible();
    const companies = await memberPage.request.get("/api/entreprises");
    expect(JSON.stringify(await companies.json())).not.toContain(bankName);
  });
});

test.describe("entreprises proposées et refus d'une entreprise archivée (CRM-96, contrats 18, 25)", () => {
  test("propose le client homonyme, marque « même nom que » à la création ; archivé, il est proposé marqué « archivée » et le choisir est refusé avec son nom", async ({ memberPage }) => {
    const mark = tag();
    const clientName = named("Banque Proche", mark);
    const client = await memberPage.request.post("/api/entreprises", { data: { name: clientName, type: "client" } });
    expect(client.status()).toBe(201);
    const { id: clientId } = (await client.json()) as { id: string };
    const id = await createLead(memberPage, { firstName: "Léna", lastName: "Faure", companyName: `${clientName} SA`, origin: "linkedin" });

    let dialog = await openConversion(memberPage, id);
    await expect(dialog.getByRole("radio", { name: clientName, exact: true })).toBeVisible();
    await expect(dialog.getByText(`même nom que ${clientName}`)).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler" }).click();

    expect((await memberPage.request.post(`/api/objets/company/${clientId}/archiver`)).status()).toBe(200);
    dialog = await openConversion(memberPage, id);
    /* Archivée, la proposition porte sa marque dans son nom accessible. */
    const archived = dialog.getByRole("radio", { name: `${clientName} archivée`, exact: true });
    await archived.check();
    await confirm(memberPage, id, dialog);
    await expect(dialog.getByRole("alert")).toContainText(`« ${clientName} »`);
    await expect(dialog.getByRole("alert")).toContainText("Restaurez-la");
    await expect(memberPage.getByText("Avancement : Nouveau")).toBeVisible();
  });
});

test.describe("conversion à 375 px (CRM-96, contrat 30)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("« Convertir » est atteignable sur la fiche, et la fenêtre garde son bouton de confirmation visible sans défilement horizontal", async ({ memberPage }) => {
    const mark = tag();
    const id = await createLead(memberPage, { firstName: "Jean-Baptiste", lastName: "Delacroix-Montesquieu", companyName: named("Groupe Ferrandi et Associés du Sud-Ouest", mark), jobTitle: "Directeur des systèmes d'information", origin: "appel_d_offres" });
    await memberPage.goto(`/leads/${id}`);
    await expect(memberPage.getByRole("button", { name: "Convertir" })).toBeInViewport();

    const dialog = await openConversion(memberPage, id);
    await expect(dialog.getByRole("button", { name: "Convertir", exact: true })).toBeInViewport();
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("le dialogue tient dans 375 px : sa phrase, ses champs et son pied restent dans son cadre, lui-même dans l'écran", async ({ memberPage }) => {
    const mark = tag();
    const id = await createLead(memberPage, { firstName: "Sophie", lastName: "Lambert", companyName: named("Groupe Hélios", mark), jobTitle: "DRH", origin: "linkedin" });

    const dialog = await openConversion(memberPage, id);
    await expect(dialog.getByRole("textbox", { name: "Prénom" })).toBeVisible();
    /* Ce qui sort du cadre du dialogue (ou le cadre qui sort de l'écran), nommé ; vide quand tout tient. L'animation d'ouverture passe avant la mesure. */
    const outside = () =>
      dialog.evaluate((root) => {
        const frame = root.getBoundingClientRect();
        const escapes: string[] = [];
        if (frame.left < 0 || frame.right > window.innerWidth) escapes.push("dialogue");
        const inside = (box: DOMRect) => box.left >= frame.left - 0.5 && box.right <= frame.right + 0.5 && box.bottom <= frame.bottom + 0.5;
        const parts: [string, Element | null][] = [
          ["phrase", root.querySelector('[data-slot="dialog-description"]')],
          ["pied", root.querySelector('[data-slot="dialog-footer"]')],
          ...Array.from(root.querySelectorAll("input:not([type=radio]), select")).map((control) => [control.closest("label")?.querySelector("span")?.textContent ?? "champ", control] as [string, Element]),
        ];
        for (const [name, element] of parts) if (element && !inside(element.getBoundingClientRect())) escapes.push(name);
        return escapes;
      });
    await expect.poll(outside).toEqual([]);
    await expect(dialog.getByRole("button", { name: "Convertir", exact: true })).toBeInViewport();
  });
});
