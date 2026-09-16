import type { Locator, Page } from "@playwright/test";
import { expect, MEMBER, seedAccounts, test } from "./fixtures/auth";
import { resetCustomFields } from "./fixtures/champs";
import { resetLeads } from "./fixtures/leads";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";

/* Les leads portent un nom d'entreprise qui finit par « (e2e) » : la fixture les efface, et rien d'autre. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les champs d'abord (leurs valeurs désignent des leads), puis les leads, puis personnes et entreprises. */
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
test.afterAll(resetAll);

async function pickOption(page: Page, combobox: Locator, option: string) {
  await combobox.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function createLead(page: Page, data: Record<string, unknown>): Promise<string> {
  const created = await page.request.post("/api/leads", { data });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/** Attend la réponse de l'écriture déclenchée par `action` : deux écritures enchaînées sans l'attendre rendent le test instable. */
async function saved(page: Page, id: string, action: () => Promise<void>, method = "PATCH") {
  await Promise.all([page.waitForResponse((res) => res.url().includes(`/api/leads/${id}`) && res.request().method() === method), action()]);
}

const today = () => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());

test.describe("faire avancer un lead sur sa fiche (CRM-91, contrats 3 et 12)", () => {
  test("pose score, besoin, téléphone, LinkedIn et poste, passe l'avancement de nouveau à contacté, qualifié et nouveau ; tout se relit, l'historique montre chaque changement, et le sélecteur ne propose ni Converti ni Écarté", async ({ memberPage }) => {
    const mark = tag();
    const company = named("Banque X", mark);
    const id = await createLead(memberPage, { firstName: "Julie", lastName: "Martin", companyName: company, origin: "linkedin" });
    await memberPage.goto(`/leads/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    const history = memberPage.getByRole("region", { name: "Fil d'activité" });

    await saved(memberPage, id, async () => {
      await fields.getByLabel("Score").fill("2");
      await memberPage.keyboard.press("Enter");
    });
    await saved(memberPage, id, async () => {
      await fields.getByLabel("Besoin").fill("Migration Workday Paie en 2027");
      await fields.getByLabel("Besoin").blur();
    });
    await saved(memberPage, id, async () => {
      await fields.getByLabel("Téléphone").fill("06 12 34 56 78");
      await memberPage.keyboard.press("Enter");
    });
    await saved(memberPage, id, async () => {
      await fields.getByLabel("LinkedIn").fill("https://www.linkedin.com/in/julie-martin");
      await memberPage.keyboard.press("Enter");
    });
    await saved(memberPage, id, async () => {
      await fields.getByLabel("Poste").fill("DRH");
      await memberPage.keyboard.press("Enter");
    });

    const stage = fields.getByRole("combobox", { name: "Avancement" });
    await stage.click();
    await expect(memberPage.getByRole("option", { name: "Qualifié", exact: true })).toBeVisible();
    await expect(memberPage.getByRole("option", { name: "Converti", exact: true })).toHaveCount(0);
    await expect(memberPage.getByRole("option", { name: "Écarté", exact: true })).toHaveCount(0);
    await memberPage.keyboard.press("Escape");
    for (const next of ["Contacté", "Qualifié", "Nouveau"]) await saved(memberPage, id, () => pickOption(memberPage, stage, next));

    await memberPage.reload();
    await expect(fields.getByLabel("Score")).toHaveValue("2");
    await expect(fields.getByLabel("Besoin")).toHaveValue("Migration Workday Paie en 2027");
    await expect(fields.getByLabel("Téléphone")).toHaveValue("06 12 34 56 78");
    await expect(fields.getByLabel("LinkedIn")).toHaveValue("https://www.linkedin.com/in/julie-martin");
    await expect(fields.getByLabel("Poste")).toHaveValue("DRH");
    await expect(stage).toContainText("Nouveau");

    for (const line of ["Score : vide → 2", "Téléphone : vide → 06 12 34 56 78", "Poste : vide → DRH", "Avancement : Nouveau → Contacté", "Avancement : Contacté → Qualifié", "Avancement : Qualifié → Nouveau"]) {
      const entry = history.getByRole("listitem").filter({ hasText: line });
      await expect(entry).toHaveCount(1);
      await expect(entry).toContainText(new RegExp(`${MEMBER.firstName} ${MEMBER.lastName} · ${today().replace(".", "\\.")}, \\d{2}:\\d{2}`));
    }
  });

  test("garde l'avancement « Nouveau » après un appel et une tâche", async ({ memberPage }) => {
    const mark = tag();
    const id = await createLead(memberPage, { companyName: named("Banque Y", mark), origin: "partenaire" });
    expect((await memberPage.request.post(`/api/objets/lead/${id}/activites`, { data: { type: "appel", body: "Premier appel, rappeler en octobre." } })).status()).toBe(201);
    await memberPage.goto(`/leads/${id}`);
    await expect(memberPage.getByRole("region", { name: "Fil d'activité" }).getByText("Premier appel, rappeler en octobre.")).toBeVisible();
    await expect(memberPage.getByText("Avancement : Nouveau")).toBeVisible();
  });
});

test.describe("écarter et rouvrir un lead (CRM-91, contrat 8)", () => {
  test("écarté, le lead porte « Écarté » lu en texte à côté du seul bouton « Rouvrir », sa cellule ne s'édite pas et il sort de « Leads en cours » ; rouvert, il revient « Contacté » ; l'historique montre les deux passages", async ({ memberPage }) => {
    const mark = tag();
    const company = named("Banque Écartable", mark);
    const id = await createLead(memberPage, { companyName: company, origin: "linkedin" });
    expect((await memberPage.request.patch(`/api/leads/${id}`, { data: { stage: "contacte" } })).status()).toBe(200);

    await memberPage.goto(`/leads/${id}`);
    await saved(memberPage, id, () => memberPage.getByRole("button", { name: "Écarter" }).click(), "POST");
    await expect(memberPage.getByText("Avancement : Écarté")).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Rouvrir" })).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Écarter" })).toHaveCount(0);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    await expect(fields.getByRole("combobox", { name: "Avancement" })).toHaveCount(0);
    await expect(fields.getByLabel("Avancement")).toHaveText("Écarté");

    await memberPage.goto(`/leads?filtres=aucun&f=companyName:contient:${mark}`);
    const row = memberPage.getByRole("table", { name: "Leads" }).getByRole("row").filter({ has: memberPage.getByRole("link", { name: company }) });
    await expect(row).toContainText("Écarté");
    await expect(row.getByRole("button", { name: /^Avancement/ })).toHaveCount(0);
    await memberPage.goto("/leads");
    await expect(memberPage.getByRole("link", { name: company })).toHaveCount(0);

    await memberPage.goto(`/leads/${id}`);
    await saved(memberPage, id, () => memberPage.getByRole("button", { name: "Rouvrir" }).click(), "POST");
    await expect(memberPage.getByText("Avancement : Contacté")).toBeVisible();
    const history = memberPage.getByRole("region", { name: "Fil d'activité" });
    await expect(history.getByText("Avancement : Contacté → Écarté")).toBeVisible();
    await expect(history.getByText("Avancement : Écarté → Contacté")).toBeVisible();
  });
});

test.describe("refus sur la fiche d'un lead (CRM-91, CRM-93, contrats 9, 10 et 13)", () => {
  test("vider le dernier des trois champs du nom est refusé sous le champ et la valeur enregistrée revient", async ({ memberPage }) => {
    const mark = tag();
    const id = await createLead(memberPage, { firstName: named("Julie", mark), origin: "linkedin" });
    await memberPage.goto(`/leads/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    await saved(memberPage, id, async () => {
      await fields.getByLabel("Prénom").fill("");
      await memberPage.keyboard.press("Enter");
    });
    await expect(fields.getByRole("alert")).toHaveText(["Renseignez un prénom, un nom ou une entreprise"]);
    await expect(fields.getByLabel("Prénom")).toHaveValue(named("Julie", mark));
  });

  test("saisir l'adresse d'une personne dans le champ Email affiche l'avertissement sous le champ, sans rien bloquer", async ({ memberPage }) => {
    const mark = tag();
    const address = `claire.${mark}@banque-solveige.fr`;
    expect((await memberPage.request.post("/api/personnes", { data: { firstName: "Claire", lastName: named("Morvan", mark), email: address } })).status()).toBe(201);
    const id = await createLead(memberPage, { companyName: named("Banque Solveige", mark), origin: "recommandation" });

    await memberPage.goto(`/leads/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    await saved(memberPage, id, async () => {
      await fields.getByLabel("Email").fill(address.toUpperCase());
      await memberPage.keyboard.press("Enter");
    });
    const hint = fields.getByRole("status");
    await expect(hint).toContainText(`déjà portée par « Claire ${named("Morvan", mark)} » (personne)`);
    await expect(hint.getByRole("link", { name: "Ouvrir la fiche" })).toBeVisible();
    await expect(fields.getByLabel("Email")).toHaveValue(address);
  });

  test("un lead n'offre pas « Fusionner… » à un administrateur, et deux leads de même titre ne portent aucune bannière « doublon probable »", async ({ adminPage }) => {
    const mark = tag();
    const company = named("Banque Jumelle", mark);
    const id = await createLead(adminPage, { firstName: "Julie", lastName: "Martin", companyName: company, origin: "linkedin" });
    await createLead(adminPage, { firstName: "Julie", lastName: "Martin", companyName: company, origin: "linkedin" });

    await adminPage.goto(`/leads/${id}`);
    await expect(adminPage.getByRole("heading", { level: 1, name: `Julie Martin · ${company}` })).toBeVisible();
    await expect(adminPage.getByText(/Doublon probable/)).toHaveCount(0);
    await adminPage.getByRole("button", { name: "Actions" }).click();
    await expect(adminPage.getByRole("menuitem", { name: "Archiver" })).toBeVisible();
    await expect(adminPage.getByRole("menuitem", { name: "Fusionner…" })).toHaveCount(0);
  });
});

test.describe("champ personnalisé sur les leads (CRM-94, contrat 6)", () => {
  test("Paramètres → Champs propose « Leads » ; le champ « Événement » se saisit sur la fiche d'un lead, devient colonne et filtre de la liste", async ({ adminPage }) => {
    const mark = tag();
    const label = named("Événement", mark);

    await adminPage.goto("/parametres/champs");
    await adminPage.getByRole("button", { name: "Nouveau champ" }).click();
    const form = adminPage.locator('[data-slot="field-form"]');
    await form.getByLabel("Objet").selectOption({ label: "Leads" });
    await form.getByLabel("Libellé").fill(label);
    await form.getByLabel("Type").selectOption("text");
    await form.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(adminPage.locator('[data-slot="fields-list"]').getByRole("textbox", { name: `Libellé du champ ${label}` })).toHaveValue(label);

    const fieldsRes = await adminPage.request.get("/api/champs?objet=lead");
    const field = ((await fieldsRes.json()) as { fields: { id: string; label: string }[] }).fields.find((entry) => entry.label === label)!;
    const key = `cf_${field.id}`;

    const company = named("Banque du Salon", mark);
    const id = await createLead(adminPage, { companyName: company, origin: "autre" });
    await adminPage.goto(`/leads/${id}`);
    const others = adminPage.getByRole("region", { name: "Autres champs" });
    await saved(adminPage, id, async () => {
      await others.getByLabel(label).fill("Salon HR Tech");
      await adminPage.keyboard.press("Enter");
    });
    await expect(adminPage.getByRole("region", { name: "Fil d'activité" }).getByText(`${label} : vide → Salon HR Tech`)).toBeVisible();

    await adminPage.goto(`/leads?colonnes=stage,${key}&f=${key}:contient:hr tech`);
    const table = adminPage.getByRole("table", { name: "Leads" });
    await expect(table.getByRole("columnheader", { name: label })).toBeVisible();
    await expect(table.getByRole("link", { name: company })).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(2);
  });
});

test.describe("fiche d'un lead à 375 px (CRM-94, contrat 14)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("s'affiche en une colonne sans défilement horizontal, avec « Écarter » atteignable", async ({ memberPage }) => {
    const mark = tag();
    const id = await createLead(memberPage, { firstName: "Jean-Baptiste", lastName: "Delacroix-Montesquieu", companyName: named("Groupe Ferrandi et Associés du Sud-Ouest", mark), origin: "appel_d_offres" });
    await memberPage.goto(`/leads/${id}`);
    await expect(memberPage.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(memberPage.getByRole("region", { name: "Champs", exact: true })).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Écarter" })).toBeInViewport();
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
