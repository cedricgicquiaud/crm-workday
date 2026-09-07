import type { Page } from "@playwright/test";
import { resetActivities, seedJournalEmail } from "./fixtures/activites";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const suffix = () => `${Date.now().toString(36)} (e2e)`;

/** Jour à Paris, décalé de `shift` jours, au format des échéances (`AAAA-MM-JJ`). */
const parisDay = (shift = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + shift * 86_400_000));

/** « 7 sept. 2026 » : le titre du groupe du jour dans le fil. */
const dayLabel = () => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());

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

    /* Le signalement est en haut du contenu, au-dessus des champs (fondations « Signalement »). */
    const bannerBox = await banner.boundingBox();
    const fieldsBox = await memberPage.getByRole("region", { name: "Champs" }).boundingBox();
    expect(bannerBox!.y).toBeLessThan(fieldsBox!.y);

    await feed.getByRole("checkbox", { name: "Relancer la proposition" }).click();
    await expect(banner).toHaveCount(0);
    await expect(feed.getByRole("listitem").filter({ hasText: "Relancer la proposition" })).toContainText("faite");
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

    await expect(tabs.getByRole("tab", { name: /^Fiche/ })).toHaveAttribute("aria-current", "page");
    await expect(fields).toBeVisible();
    await expect(feed).toBeHidden();

    await tabs.getByRole("tab", { name: /^Fil d'activité/ }).click();
    await expect(feed).toBeVisible();
    await expect(fields).toBeHidden();
    const overflow = await memberPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await memberPage.setViewportSize({ width: 1280, height: 900 });
    await expect(tabs).toBeHidden();
    await expect(feed).toBeVisible();
    await expect(fields).toBeVisible();
  });
});
