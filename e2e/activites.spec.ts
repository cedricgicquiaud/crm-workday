import type { Locator, Page } from "@playwright/test";
import { resetActivities, seedJournalEmail } from "./fixtures/activites";
import { expect, MEMBER, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const suffix = () => `${Date.now().toString(36)} (e2e)`;

/** Jour à Paris, décalé de `shift` jours, au format des échéances (`AAAA-MM-JJ`). */
const parisDay = (shift = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + shift * 86_400_000));

/** « 7 sept. 2026 » : le titre du groupe du jour dans le fil, et la date d'une tâche cochée aujourd'hui. */
const dayLabel = () => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());

/** « Marc Leroy » : le membre connecté, auteur des activités écrites par ces cas. */
const memberName = `${MEMBER.firstName} ${MEMBER.lastName}`;

/** Nombre de fois qu'un texte se lit dans une entrée du fil. */
const occurrences = (needle: string, haystack: string) => haystack.split(needle).length - 1;

/**
 * Motif ARIA d'onglets : l'onglet désigne son ou ses volets par `aria-controls`, et chacun de ces
 * volets est un `tabpanel` que l'onglet nomme. Rend les volets désignés, pour vérifier ensuite
 * lequel est affiché.
 */
async function panelsOf(page: Page, tab: Locator): Promise<Locator[]> {
  const tabId = await tab.getAttribute("id");
  expect(tabId).toBeTruthy();
  const ids = ((await tab.getAttribute("aria-controls")) ?? "").split(" ").filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  const panels: Locator[] = [];
  for (const id of ids) {
    const panel = page.locator(`[id="${id}"]`);
    await expect(panel).toHaveAttribute("role", "tabpanel");
    await expect(panel).toHaveAttribute("aria-labelledby", tabId!);
    panels.push(panel);
  }
  return panels;
}

test.beforeAll(() => {
  resetActivities();
  resetPersons();
  resetObjects();
  seedAccounts();
});
test.afterAll(() => {
  resetActivities();
  resetPersons();
  resetObjects();
});

async function createCompany(page: Page, name: string): Promise<string> {
  const created = await page.request.post("/api/entreprises", { data: { name, type: "client" } });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function createPerson(page: Page, firstName: string, lastName: string, companyId: string): Promise<string> {
  const created = await page.request.post("/api/personnes", { data: { firstName, lastName, companyId } });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function createActivity(page: Page, type: string, id: string, data: Record<string, unknown>): Promise<void> {
  const created = await page.request.post(`/api/objets/${type}/${id}/activites`, { data });
  expect(created.status()).toBe(201);
}

test.describe("fil d'activité d'une fiche (CRM-44, contrats 11 et 14)", () => {
  test("un membre écrit une note, un appel et une tâche : le fil les montre groupés par jour avec les activités de ses contacts sous leur nom, et les puces filtrent par type avec leur compteur", async ({ memberPage }) => {
    const name = `Banque Solveige ${suffix()}`;
    const companyId = await createCompany(memberPage, name);
    const contact = `Morvan ${suffix()}`;
    const personId = await createPerson(memberPage, "Claire", contact, companyId);
    await createActivity(memberPage, "person", personId, { type: "note", body: "Note écrite sur le contact." });

    await memberPage.goto(`/entreprises/${companyId}`);
    const feed = memberPage.getByRole("region", { name: "Fil d'activité" });
    await expect(feed.getByRole("heading", { level: 2, name: "Fil d'activité" })).toBeVisible();
    const composer = feed.getByRole("group", { name: "Nouvelle activité" });

    await composer.getByRole("textbox").fill("Le client valide le renouvellement.");
    await composer.getByRole("button", { name: "Enregistrer" }).click();
    await expect(feed.getByText("Le client valide le renouvellement.")).toBeVisible();

    await composer.getByRole("button", { name: "Appel", exact: true }).click();
    await composer.getByRole("textbox").fill("Appel de suivi, 12 minutes.");
    await composer.getByRole("button", { name: "Enregistrer" }).click();
    await expect(feed.getByText("Appel de suivi, 12 minutes.")).toBeVisible();

    /* Contrat 16 à l'écran : sans titre, la tâche ne part pas. */
    await composer.getByRole("button", { name: "Tâche", exact: true }).click();
    await expect(composer.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    await composer.getByLabel("Titre").fill("Envoyer la proposition");
    await composer.getByLabel("Échéance").fill(parisDay(7));
    await composer.getByRole("button", { name: "Enregistrer" }).click();
    await expect(feed.getByText("Envoyer la proposition")).toBeVisible();

    /* Groupé par jour, et la note du contact y est, sous le nom de la personne. */
    const today = feed.getByRole("region", { name: dayLabel() });
    await expect(today.getByText("Note écrite sur le contact.")).toBeVisible();
    await expect(today.getByRole("link", { name: `Claire ${contact}` })).toBeVisible();

    /* Puces : « Tout » porte le total (trois activités, la note du contact, la création de la fiche). */
    await expect(feed.getByRole("button", { name: "Tout 5" })).toBeVisible();
    await feed.getByRole("button", { name: "Notes 2" }).click();
    await expect(feed.getByText("Le client valide le renouvellement.")).toBeVisible();
    await expect(feed.getByText("Note écrite sur le contact.")).toBeVisible();
    await expect(feed.getByText("Appel de suivi, 12 minutes.")).toHaveCount(0);
    await expect(feed.getByText("Fiche créée")).toHaveCount(0);
    await feed.getByRole("button", { name: "Changements 1" }).click();
    await expect(feed.getByText("Fiche créée")).toBeVisible();
    await expect(feed.getByText("Envoyer la proposition")).toHaveCount(0);
  });
});

test.describe("tâche échue et bannière de la fiche (CRM-45, contrat 12)", () => {
  test("une tâche dont l'échéance est la veille est signalée en bannière au-dessus du contenu, une tâche qui échoit aujourd'hui ne l'est pas, et cocher la tâche la marque faite et retire le signalement", async ({ memberPage }) => {
    const companyId = await createCompany(memberPage, `Assurances Vaubourg ${suffix()}`);
    await memberPage.goto(`/entreprises/${companyId}`);
    const feed = memberPage.getByRole("region", { name: "Fil d'activité" });
    const composer = feed.getByRole("group", { name: "Nouvelle activité" });
    const banner = memberPage.getByRole("status").filter({ hasText: "tâche échue" });

    await composer.getByRole("button", { name: "Tâche", exact: true }).click();
    await composer.getByLabel("Titre").fill("Appeler ce soir");
    await composer.getByLabel("Échéance").fill(parisDay(0));
    await composer.getByRole("button", { name: "Enregistrer" }).click();
    await expect(feed.getByText("Appeler ce soir")).toBeVisible();
    await expect(banner).toHaveCount(0);

    await composer.getByRole("button", { name: "Tâche", exact: true }).click();
    await composer.getByLabel("Titre").fill("Relancer la proposition");
    await composer.getByLabel("Échéance").fill(parisDay(-1));
    await composer.getByRole("button", { name: "Enregistrer" }).click();
    await expect(banner).toHaveText("1 tâche échue.");

    /* Le responsable est l'auteur : son nom ne se lit qu'une fois sur la ligne, pas deux. */
    const overdue = feed.getByRole("listitem").filter({ hasText: "Relancer la proposition" });
    expect(occurrences(memberName, await overdue.innerText())).toBe(1);

    /* Le signalement est en haut du contenu, au-dessus des champs (fondations « Signalement »). */
    const bannerBox = await banner.boundingBox();
    const fieldsBox = await memberPage.getByRole("region", { name: "Champs" }).boundingBox();
    expect(bannerBox!.y).toBeLessThan(fieldsBox!.y);

    await feed.getByRole("checkbox", { name: "Relancer la proposition" }).click();
    await expect(banner).toHaveCount(0);
    /* Contrat 12 : « faite » porte la date du cochage, celle du jour, pas celle de la création. */
    await expect(feed.getByRole("listitem").filter({ hasText: "Relancer la proposition" })).toContainText(`faite le ${dayLabel()}`);
    await memberPage.reload();
    await expect(feed.getByRole("checkbox", { name: "Relancer la proposition" })).toBeChecked();
    await expect(banner).toHaveCount(0);
  });
});

test.describe("emails du journal dans le fil (CRM-44, contrat 13)", () => {
  test("un email envoyé avec la référence de l'entreprise apparaît dans le fil avec son sujet, son statut et son auteur ; celui du système porte la mention « automatique », celui d'un membre non", async ({ memberPage }) => {
    const companyId = await createCompany(memberPage, `Groupe Ferrandi ${suffix()}`);
    seedJournalEmail({ objectType: "company", objectId: companyId, subject: "Proposition commerciale", status: "envoye", author: "membre" });
    seedJournalEmail({ objectType: "company", objectId: companyId, subject: "Relance de rappel", status: "echec", author: "systeme" });

    await memberPage.goto(`/entreprises/${companyId}`);
    const feed = memberPage.getByRole("region", { name: "Fil d'activité" });
    const parMembre = feed.getByRole("listitem").filter({ hasText: "Proposition commerciale" });
    await expect(parMembre).toContainText("Envoyé");
    await expect(parMembre).toContainText("Marc Leroy");
    await expect(parMembre).not.toContainText("automatique");

    const parSysteme = feed.getByRole("listitem").filter({ hasText: "Relance de rappel" });
    await expect(parSysteme).toContainText("Échec");
    await expect(parSysteme).toContainText("automatique");
    await expect(feed.getByRole("button", { name: "Emails 2" })).toBeVisible();
  });
});

test.describe("le fil sous 900 px (CRM-44, D5)", () => {
  test("à 375 px le fil devient un onglet à côté de la fiche, sans défilement horizontal ; à 1280 px les onglets disparaissent et tout est visible", async ({ memberPage }) => {
    const companyId = await createCompany(memberPage, `Fiche Étroite ${suffix()}`);
    await memberPage.setViewportSize({ width: 375, height: 800 });
    await memberPage.goto(`/entreprises/${companyId}`);
    const feed = memberPage.getByRole("region", { name: "Fil d'activité" });
    const fields = memberPage.getByRole("region", { name: "Champs" });
    const tabs = memberPage.getByRole("tablist", { name: "Sections de la fiche" });

    const ficheTab = tabs.getByRole("tab", { name: /^Fiche/ });
    const filTab = tabs.getByRole("tab", { name: /^Fil d'activité/ });
    await expect(ficheTab).toHaveAttribute("aria-current", "page");
    await expect(fields).toBeVisible();
    await expect(feed).toBeHidden();

    /* Chaque onglet désigne ses volets, chaque volet est un tabpanel nommé par son onglet ; seul celui de l'onglet courant s'affiche. */
    for (const panel of await panelsOf(memberPage, ficheTab)) await expect(panel).toBeVisible();
    for (const panel of await panelsOf(memberPage, filTab)) await expect(panel).toBeHidden();

    await filTab.click();
    await expect(feed).toBeVisible();
    await expect(fields).toBeHidden();
    /* L'idiome du projet reste servi : l'entrée courante porte aussi `aria-current`. */
    await expect(filTab).toHaveAttribute("aria-current", "page");
    await expect(ficheTab).not.toHaveAttribute("aria-current", "page");
    for (const panel of await panelsOf(memberPage, filTab)) await expect(panel).toBeVisible();
    for (const panel of await panelsOf(memberPage, ficheTab)) await expect(panel).toBeHidden();
    /* Le libellé « Fil d'activité » ne se lit qu'une fois : l'onglet le porte, le titre de section s'efface. */
    await expect(feed.getByRole("heading", { level: 2, name: "Fil d'activité" })).toBeHidden();
    const overflow = await memberPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await memberPage.setViewportSize({ width: 1280, height: 900 });
    await expect(tabs).toBeHidden();
    await expect(feed).toBeVisible();
    await expect(fields).toBeVisible();
    /* Sans onglet, le titre de section redevient le seul nom visible du fil. */
    await expect(feed.getByRole("heading", { level: 2, name: "Fil d'activité" })).toBeVisible();
  });
});

test.describe("fil d'activité d'une personne (CRM-44, contrat 11)", () => {
  test("un membre ajoute une note, un appel et une tâche avec échéance sur la fiche d'une personne : les trois sont dans son fil groupé par jour, la tâche échue met la bannière sur sa fiche, et le fil de son entreprise les reprend sous son nom", async ({ memberPage }) => {
    const companyId = await createCompany(memberPage, `Assurances Vaubourg ${suffix()}`);
    const lastName = `Benali ${suffix()}`;
    const personId = await createPerson(memberPage, "Sofia", lastName, companyId);

    await memberPage.goto(`/personnes/${personId}`);
    const feed = memberPage.getByRole("region", { name: "Fil d'activité" });
    const composer = feed.getByRole("group", { name: "Nouvelle activité" });

    await composer.getByRole("textbox").fill("Le budget SIRH est validé.");
    await composer.getByRole("button", { name: "Enregistrer" }).click();
    await expect(feed.getByText("Le budget SIRH est validé.")).toBeVisible();

    await composer.getByRole("button", { name: "Appel", exact: true }).click();
    await composer.getByRole("textbox").fill("Appel de cadrage, 20 minutes.");
    await composer.getByRole("button", { name: "Enregistrer" }).click();
    await expect(feed.getByText("Appel de cadrage, 20 minutes.")).toBeVisible();

    await composer.getByRole("button", { name: "Tâche", exact: true }).click();
    await composer.getByLabel("Titre").fill("Envoyer le calendrier de projet");
    await composer.getByLabel("Échéance").fill(parisDay(-1));
    await composer.getByRole("button", { name: "Enregistrer" }).click();

    const today = feed.getByRole("region", { name: dayLabel() });
    await expect(today.getByText("Le budget SIRH est validé.")).toBeVisible();
    await expect(today.getByText("Appel de cadrage, 20 minutes.")).toBeVisible();
    await expect(today.getByText("Envoyer le calendrier de projet")).toBeVisible();

    /* L'échéance est celle de la veille : la fiche de la personne porte la bannière (contrat 12). */
    await expect(memberPage.getByRole("status").filter({ hasText: "tâche échue" })).toHaveText("1 tâche échue.");

    await memberPage.goto(`/entreprises/${companyId}`);
    const companyFeed = memberPage.getByRole("region", { name: "Fil d'activité" });
    for (const text of ["Le budget SIRH est validé.", "Appel de cadrage, 20 minutes.", "Envoyer le calendrier de projet"]) {
      await expect(companyFeed.getByText(text)).toBeVisible();
    }
    await expect(companyFeed.getByRole("link", { name: `Sofia ${lastName}` })).toHaveCount(3);
  });
});
