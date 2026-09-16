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

/* Les personnes d'abord : une personne créée par un compte de test retient ce compte, qui ne s'effacerait plus. */
test.beforeAll(() => {
  resetPersons();
  resetObjects();
  seedAccounts();
});
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

/** Une écriture du profil part au geste qui enregistre (Entrée, clic) ; on attend la réponse du serveur, jamais le texte saisi. */
async function saveProfile(page: Page, commit: () => Promise<void>) {
  const response = page.waitForResponse((res) => res.url().includes("/profil-consultant") && res.request().method() === "PATCH");
  await commit();
  expect((await response).status()).toBe(200);
}

/** Saisit un champ du profil, puis l'enregistre par Entrée. */
async function fillProfile(page: Page, field: ReturnType<Page["getByLabel"]>, value: string) {
  await field.fill(value);
  await saveProfile(page, () => field.press("Enter"));
}

/**
 * Tape une date `AAAA-MM-JJ` au clavier, comme un membre, puis l'enregistre par Entrée. `fill` pose la
 * valeur sans que le champ de la fiche l'enregistre, et l'ordre des segments suit la langue du
 * système (jj/mm ou mm/jj) : on tape jj/mm/aaaa, et si le champ lit autre chose on revient au premier
 * segment par les flèches — sans quitter le champ, qui enregistrerait la mauvaise date — pour taper mm/jj/aaaa.
 */
async function typeDate(page: Page, field: ReturnType<Page["getByLabel"]>, day: string) {
  const [year, month, date] = day.split("-");
  await field.focus();
  await field.pressSequentially(`${date}${month}${year}`);
  if ((await field.inputValue()) !== day) {
    await field.press("ArrowLeft");
    await field.press("ArrowLeft");
    await field.pressSequentially(`${month}${date}${year}`);
  }
  await expect(field).toHaveValue(day);
  await saveProfile(page, () => field.press("Enter"));
}

test.describe("état d'un consultant sur sa fiche (CRM-85, contrat 11)", () => {
  test("l'état suit la date et la case : en mission avec sa date, disponible, indisponible quelle que soit la date ; décocher efface le motif ; l'historique a une ligne par champ", async ({ memberPage }) => {
    const { id } = await createConsultant(memberPage, "Olga", { status: "freelance" });
    await memberPage.goto(`/personnes/${id}`);
    const section = memberPage.getByRole("region", { name: "Profil consultant" });
    const state = section.getByLabel("État", { exact: true });
    await expect(state).toHaveText("Disponible");

    const date = section.getByLabel("Disponible à partir du", { exact: true });
    const inFifteenDays = parisDayFromToday(15);
    await typeDate(memberPage, date, inFifteenDays);
    await expect(state).toHaveText(`En mission · disponible le ${shortDate(inFifteenDays)}`);

    await typeDate(memberPage, date, parisDayFromToday(-1));
    await expect(state).toHaveText("Disponible");

    await saveProfile(memberPage, () => section.getByRole("checkbox", { name: "Indisponible" }).click());
    await fillProfile(memberPage, section.getByLabel("Motif d'indisponibilité"), "congé parental");
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

/** Colonnes par défaut de la liste « Consultants » (contrat 14) : Nom, Statut, Modules, Coût journalier, État… — État est la cinquième cellule. */
const STATE_CELL = 4;

test.describe("mention « à replacer » sur la fiche et dans la liste (CRM-85, contrat 13)", () => {
  test("un salarié disponible porte « à replacer » sur sa fiche et dans la colonne État ; un freelance disponible et un salarié en mission ne la portent pas", async ({ memberPage }) => {
    const inTwentyDays = parisDayFromToday(20);
    const employee = await createConsultant(memberPage, "Rémi", { status: "salarie" });
    const freelance = await createConsultant(memberPage, "Dina", { status: "freelance", availableFrom: parisDayFromToday(-3) });
    const onAssignment = await createConsultant(memberPage, "Léo", { status: "salarie", availableFrom: inTwentyDays });
    const expected = [
      [employee, "Disponible · à replacer"],
      [freelance, "Disponible"],
      [onAssignment, `En mission · disponible le ${shortDate(inTwentyDays)}`],
    ] as const;

    for (const [consultant, label] of expected) {
      await memberPage.goto(`/personnes/${consultant.id}`);
      await expect(memberPage.getByRole("region", { name: "Profil consultant" }).getByLabel("État", { exact: true }), consultant.name).toHaveText(label);
    }

    await memberPage.goto("/consultants");
    const table = memberPage.getByRole("table", { name: "Consultants" });
    for (const [consultant, label] of expected) {
      const row = table.getByRole("row").filter({ has: memberPage.getByRole("link", { name: consultant.name, exact: true }) });
      await expect(row.getByRole("cell").nth(STATE_CELL), consultant.name).toHaveText(label);
    }
  });
});
