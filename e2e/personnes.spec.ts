import type { Locator, Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { archiveCompany, resetPersons } from "./fixtures/personnes";

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
  test("depuis la fiche d'une entreprise, « Ajouter une personne » ouvre le dialogue avec l'entreprise pré-remplie ; la personne créée apparaît sous « Contacts », sa fiche montre l'entreprise, le rôle « Décideur » se règle, et changer l'entreprise la déplace en gardant l'ancienne dans l'historique", async ({ memberPage }) => {
    const solveige = `Banque Solveige ${suffix()}`;
    const ferrandi = `Groupe Ferrandi ${suffix()}`;
    const solveigeId = await createCompany(memberPage, solveige);
    const ferrandiId = await createCompany(memberPage, ferrandi);
    const lastName = `Dupont ${suffix()}`;
    const fullName = `Jean ${lastName}`;

    await memberPage.goto(`/entreprises/${solveigeId}`);
    const contacts = memberPage.getByRole("region", { name: "Liens" }).getByRole("region", { name: "Contacts" });
    await expect(contacts.getByText("Aucune fiche liée.")).toBeVisible();
    await contacts.getByRole("button", { name: "Ajouter une personne" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle personne" });
    await expect(dialog.getByRole("combobox", { name: "Entreprise" })).toContainText(solveige);
    await dialog.getByLabel("Prénom").fill("Jean");
    await dialog.getByLabel("Nom", { exact: true }).fill(lastName);
    await dialog.getByLabel("Email principal").fill(`jean.${Date.now()}@solveige.fr`);
    await dialog.getByLabel("Poste").fill("DSI");
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(memberPage).toHaveURL(/\/personnes\/[0-9a-f-]{36}$/);
    const id = memberPage.url().split("/").pop()!;

    await expect(memberPage.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
    await expect(memberPage.getByText("Profils : Contact")).toBeVisible();
    const links = memberPage.getByRole("region", { name: "Liens" }).getByRole("region", { name: "Entreprise" });
    await expect(links.getByRole("link", { name: solveige })).toBeVisible();
    const profile = memberPage.getByRole("region", { name: "Profil contact" });
    await expect(profile.getByRole("combobox", { name: "Entreprise" })).toContainText(solveige);
    await expect(memberPage.getByRole("region", { name: "Champs" }).getByLabel("Poste")).toHaveValue("DSI");
    await memberPage.goto(`/entreprises/${solveigeId}`);
    await expect(contacts.getByRole("link", { name: fullName })).toBeVisible();
    await contacts.getByRole("link", { name: fullName }).click();
    await expect(memberPage).toHaveURL(`/personnes/${id}`);
    await expect(profile.getByRole("combobox", { name: "Rôle dans la décision" })).toContainText("Non précisé");

    const history = memberPage.getByRole("region", { name: "Fil d'activité" });
    await pickOption(memberPage, profile.getByRole("combobox", { name: "Rôle dans la décision" }), "Décideur");
    await expect(profile.getByRole("combobox", { name: "Rôle dans la décision" })).toContainText("Décideur");
    await expect(history.getByText("Rôle dans la décision : Non précisé → Décideur")).toBeVisible();

    await pickOption(memberPage, profile.getByRole("combobox", { name: "Entreprise" }), ferrandi);
    await expect(profile.getByRole("combobox", { name: "Entreprise" })).toContainText(ferrandi);
    await expect(links.getByRole("link", { name: ferrandi })).toBeVisible();
    await expect(links.getByRole("link", { name: solveige })).toHaveCount(0);
    await expect(history.getByText(`Entreprise : ${solveige} → ${ferrandi}`)).toBeVisible();

    await memberPage.reload();
    await expect(profile.getByRole("combobox", { name: "Entreprise" })).toContainText(ferrandi);
    await expect(profile.getByRole("combobox", { name: "Rôle dans la décision" })).toContainText("Décideur");

    await memberPage.goto(`/entreprises/${solveigeId}`);
    await expect(memberPage.getByRole("region", { name: "Contacts" }).getByText("Aucune fiche liée.")).toBeVisible();
    await memberPage.goto(`/entreprises/${ferrandiId}`);
    await expect(memberPage.getByRole("region", { name: "Contacts" }).getByRole("link", { name: fullName })).toBeVisible();
  });
});

/**
 * Mesures d'écran du dialogue de création rapide (défauts de la repasse visuelle 2.2) : un champ plus
 * court que ses voisins et une liste décalée se voient à l'œil mais se constatent au pixel.
 */
test.describe("dialogue « Nouvelle personne » : hauteur des champs et alignement de la liste (repasse visuelle 2.2)", () => {
  test("le sélecteur « Entreprise » a la hauteur des autres champs, sa liste s'ouvre alignée sur lui, et les entreprises proposées viennent de la source bornée", async ({ memberPage }) => {
    const entreprise = `Banque Solveige ${suffix()}`;
    await createCompany(memberPage, entreprise);
    await memberPage.goto("/personnes");
    const demandes: string[] = [];
    memberPage.on("request", (request) => demandes.push(new URL(request.url()).pathname));

    await memberPage.getByRole("button", { name: "Nouvelle personne" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle personne" });
    const picker = dialog.getByRole("combobox", { name: "Entreprise" });
    await expect(picker).toBeVisible();

    /* Le dialogue et la liste s'ouvrent par une mise à l'échelle : on remesure jusqu'à ce qu'ils ne bougent plus, un écart de position réel ne se résorbant jamais. */
    await expect(async () => {
      const champ = (await dialog.getByLabel("Prénom").boundingBox())!;
      const selecteur = (await picker.boundingBox())!;
      expect(Math.round(selecteur.height), "hauteur du sélecteur").toBe(Math.round(champ.height));
      expect(Math.round(selecteur.width), "largeur du sélecteur").toBe(Math.round(champ.width));
    }).toPass({ timeout: 5_000 });

    const liste = memberPage.locator('[data-slot="select-content"]');
    const alignee = async (quand: string) => {
      await expect(liste).toBeVisible();
      await expect(async () => {
        const ouverte = (await liste.boundingBox())!;
        const selecteur = (await picker.boundingBox())!;
        expect(Math.round(ouverte.width), `largeur de la liste ${quand}`).toBe(Math.round(selecteur.width));
        expect(Math.round(ouverte.x), `bord gauche de la liste ${quand}`).toBe(Math.round(selecteur.x));
      }).toPass({ timeout: 5_000 });
      await memberPage.keyboard.press("Escape");
    };

    await picker.click();
    await alignee("sans entreprise choisie");

    /* Une entreprise choisie : la liste reste alignée sur le champ, au lieu de se caler sur l'option retenue. */
    await pickOption(memberPage, picker, entreprise);
    await picker.click();
    await alignee("une entreprise choisie");

    /* Les entreprises proposées viennent de la source bornée des mécanismes, jamais de la liste complète. */
    expect(demandes).toContain("/api/objets/company/options");
    expect(demandes).not.toContain("/api/entreprises");
  });
});

const PALETTE_INPUT = "Rechercher une page ou une action";

/** Cmd+K (Ctrl+K hors macOS). Le raccourci n'existe qu'une fois la page hydratée : on réessaie. */
async function openPalette(page: Page) {
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return palette;
}

test.describe("personne sans email ni entreprise, Profils dérivé, deux adresses (CRM-41, contrat 8)", () => {
  test("créée depuis la liste avec prénom et nom seuls, la fiche et la liste disent Profils « Aucun » ; « Ajouter un profil contact » puis une entreprise : « Contact » ; deux adresses la retrouvent dans la palette", async ({ memberPage }) => {
    const company = `Assurances Vaubourg ${suffix()}`;
    await createCompany(memberPage, company);
    const lastName = `Faure ${suffix()}`;
    const fullName = `Camille ${lastName}`;
    await memberPage.goto("/accueil");
    const objectsNav = memberPage.locator('[data-slot="sidebar"]').getByRole("navigation", { name: "Objets" });
    await expect(objectsNav.getByRole("link")).toHaveText(["Entreprises", "Personnes"]);
    await objectsNav.getByRole("link", { name: "Personnes" }).click();
    await expect(memberPage).toHaveURL(/\/personnes$/);
    await expect(memberPage.getByRole("heading", { level: 1, name: "Personnes" })).toBeVisible();

    await memberPage.getByRole("button", { name: "Nouvelle personne" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle personne" });
    await dialog.getByLabel("Prénom").fill("Camille");
    await dialog.getByLabel("Nom", { exact: true }).fill(lastName);
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(memberPage).toHaveURL(/\/personnes\/[0-9a-f-]{36}$/);
    const id = memberPage.url().split("/").pop()!;
    await expect(memberPage.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
    await expect(memberPage.getByText("Profils : Aucun")).toBeVisible();
    for (const region of ["Liens", "Champs", "Profil contact", "Fil d'activité"]) await expect(memberPage.getByRole("region", { name: region })).toBeVisible();
    await expect(memberPage.getByRole("region", { name: "Liens" }).getByRole("region", { name: "Entreprise" }).getByText("Aucune fiche liée.")).toBeVisible();

    await memberPage.goto("/personnes");
    const table = memberPage.getByRole("table", { name: "Personnes" });
    const row = table.getByRole("row").filter({ has: memberPage.getByRole("link", { name: fullName }) });
    await expect(row).toContainText("Aucun");

    await memberPage.goto(`/personnes/${id}`);
    const profile = memberPage.getByRole("region", { name: "Profil contact" });
    await expect(profile.getByText("Cette personne n'a pas de profil contact.")).toBeVisible();
    await profile.getByRole("button", { name: "Ajouter un profil contact" }).click();
    await pickOption(memberPage, profile.getByRole("combobox", { name: "Entreprise" }), company);
    await expect(memberPage.getByText("Profils : Contact")).toBeVisible();
    await expect(memberPage.getByRole("region", { name: "Champs" }).getByLabel("Poste")).toHaveValue("");
    await expect(profile.getByRole("combobox", { name: "Rôle dans la décision" })).toContainText("Non précisé");
    await expect(memberPage.getByRole("region", { name: "Fil d'activité" }).getByText("Profils : Aucun → Contact")).toBeVisible();

    await expect(memberPage.getByRole("region", { name: "Liens" }).getByRole("link", { name: company })).toBeVisible();
    await memberPage.goto("/personnes");
    await expect(table.getByRole("row").filter({ has: memberPage.getByRole("link", { name: fullName }) })).toContainText("Contact");

    await memberPage.goto(`/personnes/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs" });

    /* Un champ en lecture seule se lit comme du texte : rendu par un contrôle éteint, il serait à demi transparent (défaut d'audit 2.2). */
    await expect(fields.getByRole("combobox", { name: "Profils" })).toHaveCount(0);
    await expect(fields.getByLabel("Profils")).toHaveText("Contact");
    await expect(fields.getByRole("textbox", { name: "Nom complet" })).toHaveCount(0);
    await expect(fields.getByLabel("Nom complet")).toHaveText(fullName);

    const stamp = Date.now().toString(36);
    await fields.getByLabel("Email principal").fill(`Camille.Faure.${stamp}@Vaubourg.fr`);
    await memberPage.keyboard.press("Enter");
    await expect(fields.getByLabel("Email principal")).toHaveValue(`camille.faure.${stamp}@vaubourg.fr`);
    await fields.getByLabel("Autres emails").fill(`camille.${stamp}@perso.fr`);
    await memberPage.keyboard.press("Enter");
    await expect(memberPage.getByRole("region", { name: "Fil d'activité" }).getByText(`Autres emails : vide → camille.${stamp}@perso.fr`)).toBeVisible();

    for (const query of [`faure.${stamp}@vaubourg`, `camille.${stamp}@perso.fr`, `mille ${lastName.slice(0, 5)}`]) {
      const palette = await openPalette(memberPage);
      await palette.getByPlaceholder(PALETTE_INPUT).fill(query);
      const hit = palette.getByRole("option", { name: new RegExp(`^${fullName.replace(/[()]/g, "\\$&")}`) });
      await expect(hit, query).toBeVisible();
      await expect(hit.locator("svg.lucide-users")).toBeVisible();
      await expect(hit).toContainText(company);
      await memberPage.keyboard.press("Escape");
    }
  });
});

test.describe("refus à la création et au rattachement (CRM-40, CRM-42, contrats 9 et 10)", () => {
  test("une adresse mal formée est refusée sous le champ ; une adresse déjà portée est refusée en nommant la personne avec « Ouvrir la fiche » ; le sélecteur d'entreprise ne propose pas une archivée", async ({ memberPage }) => {
    const stamp = Date.now().toString(36);
    const holderLastName = `Dupont ${suffix()}`;
    const created = await memberPage.request.post("/api/personnes", { data: { firstName: "Jean", lastName: holderLastName, email: `jean.dupont.${stamp}@acme.fr` } });
    expect(created.status()).toBe(201);
    const { id: holderId } = (await created.json()) as { id: string };
    const active = `Ouverte ${suffix()}`;
    const archived = `Fermée ${suffix()}`;
    await createCompany(memberPage, active);
    archiveCompany(await createCompany(memberPage, archived));

    await memberPage.goto("/personnes");
    await memberPage.getByRole("button", { name: "Nouvelle personne" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle personne" });
    const form = dialog.locator("form");
    await dialog.getByLabel("Prénom").fill("Jeanne");
    await dialog.getByLabel("Nom", { exact: true }).fill(`Refusée ${suffix()}`);
    await dialog.getByLabel("Email principal").fill("jeanne.dupont@");
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(form.getByRole("alert")).toHaveText(["Cette adresse n'est pas valide."]);
    await expect(dialog.getByLabel("Email principal")).toBeFocused();
    await expect(memberPage).toHaveURL(/\/personnes$/);

    await dialog.getByLabel("Email principal").fill(`Jean.Dupont.${stamp}@Acme.fr`);
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(form.getByRole("alert")).toContainText(`L'adresse jean.dupont.${stamp}@acme.fr est déjà portée par « Jean ${holderLastName} ».`);
    await expect(form.getByRole("link", { name: "Ouvrir la fiche" })).toHaveAttribute("href", `/personnes/${holderId}`);
    await expect(memberPage).toHaveURL(/\/personnes$/);
    await memberPage.keyboard.press("Escape");

    await memberPage.goto(`/personnes/${holderId}`);
    const profile = memberPage.getByRole("region", { name: "Profil contact" });
    await profile.getByRole("button", { name: "Ajouter un profil contact" }).click();
    await profile.getByRole("combobox", { name: "Entreprise" }).click();
    await expect(memberPage.getByRole("option", { name: active })).toBeVisible();
    await expect(memberPage.getByRole("option", { name: archived })).toHaveCount(0);
    await memberPage.keyboard.press("Escape");

    /* Un refus du serveur s'affiche sous le champ et la valeur enregistrée revient. */
    const fields = memberPage.getByRole("region", { name: "Champs" });
    await fields.getByLabel("Autres emails").fill("pas-une-adresse");
    await memberPage.keyboard.press("Enter");
    await expect(fields.getByRole("alert")).toHaveText("Cette adresse n'est pas valide : pas-une-adresse.");
    await expect(fields.getByLabel("Autres emails")).toHaveValue("");
  });
});

test.describe("téléphone, 375 px (contrat 25 de la feature 1, D9)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** Aucun défilement horizontal de la page, un seul h1, et aucun cadre qui défile en largeur (un texte tronqué par des points de suspension n'est pas un débordement). */
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

  test("la liste des personnes, le dialogue et une fiche avec profil tiennent dans l'écran, avec un seul titre", async ({ memberPage }) => {
    await memberPage.setViewportSize({ width: 375, height: 812 });
    const companyId = await createCompany(memberPage, `Groupe Ferrandi et Associés du Sud-Ouest ${suffix()}`);
    const created = await memberPage.request.post("/api/personnes", { data: { firstName: "Anne-Sophie", lastName: `de La Rochefoucauld-Montbazon ${suffix()}`, email: `anne.sophie.${Date.now()}@ferrandi.fr`, companyId, jobTitle: "Directrice des systèmes d'information" } });
    const { id } = (await created.json()) as { id: string };

    await memberPage.goto("/personnes");
    await fitsTheScreen(memberPage, "liste des personnes");
    await expect(memberPage.getByRole("button", { name: "Nouvelle personne" })).toBeInViewport();
    await memberPage.getByRole("button", { name: "Nouvelle personne" }).click();
    await expect(memberPage.getByRole("dialog", { name: "Nouvelle personne" })).toBeVisible();
    await fitsTheScreen(memberPage, "dialogue de création", { modalOpen: true });
    await memberPage.keyboard.press("Escape");

    await memberPage.goto(`/personnes/${id}`);
    await fitsTheScreen(memberPage, "fiche personne");
    for (const region of ["Liens", "Champs", "Profil contact"]) await expect(memberPage.getByRole("region", { name: region })).toBeVisible();
    /* Sous 900 px le fil est le second onglet de la fiche (D5) : il s'affiche quand on l'ouvre. */
    await memberPage.getByRole("tab", { name: /^Fil d'activité/ }).click();
    await expect(memberPage.getByRole("region", { name: "Fil d'activité" })).toBeVisible();
  });
});

test.describe("identifiant qui n'est pas un UUID (D24)", () => {
  test("la fiche /personnes/abc répond 404 et affiche l'écran « introuvable », pas une erreur", async ({ memberPage }) => {
    const response = await memberPage.goto("/personnes/abc");
    expect(response?.status()).toBe(404);
    await expect(memberPage.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(memberPage.getByText(/Internal Server Error|Application error|Unhandled Runtime Error/)).toHaveCount(0);
  });
});
