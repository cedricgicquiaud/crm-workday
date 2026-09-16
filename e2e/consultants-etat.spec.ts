import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const suffix = () => `${Date.now().toString(36)} (e2e)`;

/** Le jour civil de Paris décalé de `days` jours, en `AAAA-MM-JJ` : le navigateur du test est réglé sur Paris, le serveur compare sur ce jour-là. */
function parisDayFromToday(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const noon = new Date(`${today}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

/** « 5 oct. 2026 » : le format court des dates de contexte (idiome d'interface). */
const shortDate = (day: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${day}T12:00:00Z`));

test.beforeAll(() => seedAccounts());
/* Chaque test pose ses consultants : ceux du test d'avant fausseraient la colonne État et son tri. */
test.beforeEach(() => {
  resetPersons();
  resetObjects();
});
test.afterAll(() => {
  resetPersons();
  resetObjects();
});

async function createConsultant(page: Page, firstName: string, profile: Record<string, unknown>): Promise<{ id: string; name: string }> {
  const lastName = `Etat ${suffix()}`;
  const created = await page.request.post("/api/personnes", { data: { firstName, lastName } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect((await page.request.patch(`/api/personnes/${id}/profil-consultant`, { data: profile })).status()).toBe(200);
  return { id, name: `${firstName} ${lastName}` };
}

/** Une écriture du profil part et revient : on attend la réponse du serveur, jamais le texte saisi. */
async function saveProfile(page: Page, action: () => Promise<void>) {
  const [response] = await Promise.all([page.waitForResponse((res) => res.url().includes("/profil-consultant") && res.request().method() === "PATCH"), action()]);
  expect(response.status()).toBe(200);
}

test.describe("état d'un consultant sur sa fiche (CRM-85, contrat 11)", () => {
  test("l'état suit la date et la case : en mission avec sa date, disponible, indisponible quelle que soit la date ; décocher efface le motif ; l'historique a une ligne par champ", async ({ memberPage }) => {
    const { id } = await createConsultant(memberPage, "Olga", { status: "freelance" });
    await memberPage.goto(`/personnes/${id}`);
    const section = memberPage.getByRole("region", { name: "Profil consultant" });
    const state = section.getByLabel("État", { exact: true });
    await expect(state).toHaveText("Disponible");

    const inFifteenDays = parisDayFromToday(15);
    await saveProfile(memberPage, () => section.getByLabel("Disponible à partir du").fill(inFifteenDays).then(() => section.getByLabel("Disponible à partir du").press("Enter")));
    await expect(state).toHaveText(`En mission · disponible le ${shortDate(inFifteenDays)}`);

    await saveProfile(memberPage, () => section.getByLabel("Disponible à partir du").fill(parisDayFromToday(-1)).then(() => section.getByLabel("Disponible à partir du").press("Enter")));
    await expect(state).toHaveText("Disponible");

    await saveProfile(memberPage, () => section.getByRole("checkbox", { name: "Indisponible" }).click());
    await saveProfile(memberPage, () => section.getByLabel("Motif d'indisponibilité").fill("congé parental").then(() => section.getByLabel("Motif d'indisponibilité").press("Enter")));
    await expect(state).toHaveText("Indisponible");

    await saveProfile(memberPage, () => section.getByRole("checkbox", { name: "Indisponible" }).click());
    await expect(state).toHaveText("Disponible");
    await memberPage.reload();
    await expect(section.getByRole("checkbox", { name: "Indisponible" })).not.toBeChecked();
    await expect(section.getByLabel("Motif d'indisponibilité")).toHaveCount(0);

    const feed = memberPage.getByRole("region", { name: "Fil d'activité" });
    await expect(feed.getByText("Indisponible : Non → Oui")).toBeVisible();
    await expect(feed.getByText("Indisponible : Oui → Non")).toBeVisible();
    await expect(feed.getByText("Motif d'indisponibilité : vide → congé parental")).toBeVisible();
    await expect(feed.getByText("Motif d'indisponibilité : congé parental → vide")).toBeVisible();
  });
});
