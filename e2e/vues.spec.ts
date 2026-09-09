import type { Page } from "@playwright/test";
import { expect, MEMBER, seedAccounts, signInAs, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";
import { resetViews } from "./fixtures/vues";

/* Fiches et vues finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const VIEW_BAR = '[data-slot="view-bar"]';
const VIEW_FORM = '[data-slot="view-form"]';
const VIEW_MENU = '[data-slot="view-menu"]';
const SIDEBAR = '[data-slot="sidebar"]';
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les vues d'abord : elles retiennent les fiches par personne. */
function resetAll() {
  resetViews();
  resetPersons();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
test.afterAll(resetAll);

async function createCompany(page: Page, name: string, values: Record<string, string>) {
  const res = await page.request.post("/api/entreprises", { data: { name, ...values } });
  expect(res.status()).toBe(201);
}

/** Les raisons sociales affichées par la liste, dans l'ordre. */
const names = async (page: Page) => (await page.getByRole("table", { name: "Entreprises" }).getByRole("row").filter({ hasNot: page.getByRole("columnheader") }).getByRole("link").allTextContents()).map((text) => text.trim());

test.describe("barre des vues d'une liste (CRM-53, contrat 24)", () => {
  test("un membre enregistre l'état d'une liste sous un nom, et le rouvre depuis la barre des vues", async ({ memberPage }) => {
    const mark = tag();
    await createCompany(memberPage, named("Alpha", mark), { type: "client", city: "Paris" });
    await createCompany(memberPage, named("Bravo", mark), { type: "prospect", city: "Lyon" });

    /* L'état à ranger sous un nom : les fiches de ce test, les clients seulement, triées. */
    await memberPage.goto(`/entreprises?f=name:contient:${mark}&f=type:est:client&tri=name:asc`);
    const bar = memberPage.locator(VIEW_BAR);
    await expect(bar.getByRole("button", { name: "Vue : Toutes les entreprises" })).toBeVisible();

    await bar.getByRole("button", { name: "Enregistrer la vue" }).click();
    const form = memberPage.locator(VIEW_FORM);
    await form.getByLabel("Nom de la vue").fill(named("Clients", mark));
    await form.getByRole("button", { name: "Enregistrer", exact: true }).click();

    /* La vue devient la vue courante et l'adresse la porte (contrat 24). */
    await expect(memberPage).toHaveURL(/vue=/);
    await expect(bar.getByRole("button", { name: `Vue : ${named("Clients", mark)}` })).toBeVisible();
    expect(await names(memberPage)).toEqual([named("Alpha", mark)]);

    /* La liste nue revient à la vue par défaut ; la vue enregistrée attend dans le menu. */
    await memberPage.goto("/entreprises");
    await expect(bar.getByRole("button", { name: "Vue : Toutes les entreprises" })).toBeVisible();
    await bar.getByRole("button", { name: "Vue : Toutes les entreprises" }).click();
    const menu = memberPage.locator(VIEW_MENU);
    await expect(menu.getByRole("link", { name: "Toutes les entreprises" })).toHaveAttribute("aria-current", "page");

    await menu.getByRole("link", { name: named("Clients", mark) }).click();
    await expect(memberPage).toHaveURL(/vue=/);
    expect(await names(memberPage)).toEqual([named("Alpha", mark)]);
    /* L'état de la vue est appliqué : la puce du filtre enregistré est de retour. */
    await expect(memberPage.getByRole("button", { name: "Retirer le filtre Type est Client" })).toBeVisible();
  });
});

/** Vues épinglées de la barre latérale d'une page, dans l'ordre affiché. */
const pinnedNav = (page: Page) => page.locator(SIDEBAR).getByRole("navigation", { name: "Vues épinglées" }).getByRole("link");

test.describe("vues épinglées dans la barre latérale (CRM-52, contrat 24)", () => {
  test("un membre épingle deux vues, les range, et sa barre latérale les garde après reconnexion sans les imposer au collègue", async ({ memberPage, adminPage, browser }) => {
    const mark = tag();
    for (const [name, query] of [[named("Clients", mark), "f=type:est:client"], [named("Lyon", mark), "f=city:contient:Lyon"]]) {
      const res = await memberPage.request.post("/api/vues", { data: { objectType: "company", name, query } });
      expect(res.status()).toBe(201);
    }

    await memberPage.goto("/entreprises");
    await memberPage.locator(VIEW_BAR).getByRole("button", { name: /^Vue : / }).click();
    const menu = memberPage.locator(VIEW_MENU);
    await menu.getByRole("checkbox", { name: `Épingler ${named("Clients", mark)}` }).click();
    await menu.getByRole("checkbox", { name: `Épingler ${named("Lyon", mark)}` }).click();
    await expect(pinnedNav(memberPage)).toHaveText([named("Clients", mark), named("Lyon", mark)]);

    /* L'ordre de la barre latérale est choisi, donc enregistré. */
    await menu.getByRole("button", { name: `Monter la vue ${named("Lyon", mark)}` }).click();
    await expect(pinnedNav(memberPage)).toHaveText([named("Lyon", mark), named("Clients", mark)]);

    /* Le collègue voit ces vues dans le menu des vues, mais sa barre latérale reste la sienne. */
    await adminPage.goto("/entreprises");
    await expect(adminPage.locator(SIDEBAR).getByRole("navigation", { name: "Vues épinglées" })).toHaveCount(0);
    await adminPage.locator(VIEW_BAR).getByRole("button", { name: /^Vue : / }).click();
    await expect(adminPage.locator(VIEW_MENU).getByRole("link", { name: named("Lyon", mark) })).toBeVisible();

    /* Reconnexion : la barre latérale les garde, dans l'ordre choisi (contrat 24). */
    const context = await browser.newContext();
    await signInAs(context.request, MEMBER);
    const again = await context.newPage();
    await again.goto("/accueil");
    await expect(pinnedNav(again)).toHaveText([named("Lyon", mark), named("Clients", mark)]);
    await context.close();

    /* Une vue épinglée ouvre la liste dans son état, et se retire de la barre depuis le même menu. */
    await pinnedNav(memberPage).first().click();
    await expect(memberPage).toHaveURL(/vue=/);
    await memberPage.locator(VIEW_BAR).getByRole("button", { name: /^Vue : / }).click();
    await menu.getByRole("checkbox", { name: `Épingler ${named("Lyon", mark)}` }).click();
    await expect(pinnedNav(memberPage)).toHaveText([named("Clients", mark)]);
  });
});

test.describe("modifier et supprimer une vue (CRM-53, contrat 26)", () => {
  test("un membre renomme une vue pour toute l'équipe et la supprime après confirmation ; la vue par défaut, elle, ne se touche pas", async ({ memberPage, adminPage }) => {
    const mark = tag();
    await createCompany(memberPage, named("Alpha", mark), { type: "client", city: "Paris" });
    await createCompany(memberPage, named("Bravo", mark), { type: "prospect", city: "Lyon" });
    const save = async (name: string) => {
      const res = await memberPage.request.post("/api/vues", { data: { objectType: "company", name, query: `f=name:contient:${mark}&f=type:est:client` } });
      expect(res.status()).toBe(201);
      return ((await res.json()) as { id: string }).id;
    };
    const clients = await save(named("Clients", mark));
    await save(named("Prospects", mark));

    /* Sur la vue par défaut, rien à modifier ni à supprimer (contrat 26). */
    await memberPage.goto("/entreprises");
    const bar = memberPage.locator(VIEW_BAR);
    await expect(bar.getByRole("button", { name: "Modifier la vue" })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Supprimer la vue" })).toHaveCount(0);

    await memberPage.goto(`/entreprises?vue=${clients}`);
    expect(await names(memberPage)).toEqual([named("Alpha", mark)]);

    /* Un nom déjà porté par une autre vue de la liste est refusé, sous le champ (contrat 26). */
    await bar.getByRole("button", { name: "Modifier la vue" }).click();
    const form = memberPage.locator(VIEW_FORM);
    await form.getByLabel("Nom de la vue").fill(named("Prospects", mark));
    await form.getByRole("button", { name: "Enregistrer les changements" }).click();
    await expect(form.getByRole("alert")).toHaveText(`« ${named("Prospects", mark)} » est déjà le nom d'une vue de cette liste.`);

    await form.getByLabel("Nom de la vue").fill(named("Clients de l'Ouest", mark));
    await form.getByRole("button", { name: "Enregistrer les changements" }).click();
    await expect(bar.getByRole("button", { name: `Vue : ${named("Clients de l'Ouest", mark)}` })).toBeVisible();

    /* La modification est celle de toute l'équipe : le collègue lit le nouveau nom (contrat 24). */
    await adminPage.goto(`/entreprises?vue=${clients}`);
    await expect(adminPage.locator(VIEW_BAR).getByRole("button", { name: `Vue : ${named("Clients de l'Ouest", mark)}` })).toBeVisible();

    /* Aucune suppression sans confirmation (CRM-53). */
    await bar.getByRole("button", { name: "Supprimer la vue" }).click();
    await memberPage.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();
    await expect(bar.getByRole("button", { name: `Vue : ${named("Clients de l'Ouest", mark)}` })).toBeVisible();

    await bar.getByRole("button", { name: "Supprimer la vue" }).click();
    const dialog = memberPage.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: `Supprimer la vue « ${named("Clients de l'Ouest", mark)} » ?` })).toBeVisible();
    await dialog.getByRole("button", { name: "Supprimer", exact: true }).click();

    /* La liste revient à sa vue par défaut, et la vue a quitté le menu de tout le monde. */
    await expect(bar.getByRole("button", { name: "Vue : Toutes les entreprises" })).toBeVisible();
    await bar.getByRole("button", { name: "Vue : Toutes les entreprises" }).click();
    await expect(memberPage.locator(VIEW_MENU).getByRole("link", { name: named("Clients de l'Ouest", mark) })).toHaveCount(0);
  });
});

/** Nom long, tel qu'une équipe en écrit : il doit se borner partout où il s'affiche. */
const LONG_NAME = "Comptes stratégiques grands groupes Île-de-France 2026";

test.describe("un nom de vue long reste borné, et la vue courante se voit (CRM-53)", () => {
  test("à 1280 px le déclencheur borne le nom et le tronque, le nom entier restant lisible au survol", async ({ memberPage }) => {
    const mark = tag();
    const long = named(LONG_NAME, mark);
    const res = await memberPage.request.post("/api/vues", { data: { objectType: "company", name: long, query: "f=type:est:client" } });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };

    await memberPage.goto(`/entreprises?vue=${id}`);
    const trigger = memberPage.locator(VIEW_BAR).getByRole("button", { name: `Vue : ${long}` });
    /* Le nom entier reste le nom accessible et le survol le rend, mais le bouton, lui, ne s'étire pas. */
    await expect(trigger).toHaveAttribute("title", `Vue : ${long}`);
    const width = (await trigger.boundingBox())?.width ?? 0;
    expect(width, "largeur du déclencheur de la barre des vues").toBeLessThanOrEqual(280);
    /* Tronqué par points de suspension, comme la barre latérale tronque le même nom. */
    const clipped = await trigger.locator('[data-slot="view-name"]').evaluate((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === "ellipsis");
    expect(clipped, "nom tronqué par points de suspension").toBe(true);
  });

  test("la vue courante porte aria-current=page et une marque visible que l'épingle ne porte pas", async ({ memberPage }) => {
    const mark = tag();
    const pinned = named("Clients à épingler", mark);
    const res = await memberPage.request.post("/api/vues", { data: { objectType: "company", name: pinned, query: "f=type:est:client" } });
    expect(res.status()).toBe(201);
    /* Une vue épinglée qui n'est pas la vue courante : la case cochée ne doit pas se lire « vue active ». */
    const { id } = (await res.json()) as { id: string };
    const pin = await memberPage.request.post("/api/vues-epinglees", { data: { viewId: id } });
    expect(pin.status()).toBe(201);

    await memberPage.goto("/entreprises");
    const bar = memberPage.locator(VIEW_BAR);
    await bar.getByRole("button", { name: /^Vue : / }).click();
    const menu = memberPage.locator(VIEW_MENU);
    await expect(menu.getByRole("checkbox", { name: `Épingler ${pinned}` })).toBeChecked();

    const line = (name: string) => menu.getByRole("listitem").filter({ has: memberPage.getByRole("link", { name, exact: true }) });
    /* La vue courante est la vue par défaut : c'est elle qui porte la marque, pas l'épinglée. */
    await expect(menu.getByRole("link", { name: "Toutes les entreprises" })).toHaveAttribute("aria-current", "page");
    await expect(menu.getByRole("link", { name: pinned })).not.toHaveAttribute("aria-current", "page");
    await expect(line("Toutes les entreprises").locator('[data-slot="view-current"]')).toBeVisible();
    await expect(line(pinned).locator('[data-slot="view-current"]')).toHaveCount(0);

    /* Ce que la case et les flèches commandent se lit aussi au survol, là où le dessin ne parle pas. */
    await expect(menu.getByRole("checkbox", { name: `Épingler ${pinned}` })).toHaveAttribute("title", `Épingler ${pinned}`);
    await expect(menu.getByRole("button", { name: `Monter la vue ${pinned}` })).toHaveAttribute("title", `Monter la vue ${pinned}`);

    /* L'épingle est personnelle et survit à la fin du test : ce test la retire, les suivants retrouvent une barre latérale nue. */
    expect((await memberPage.request.delete(`/api/vues-epinglees/${id}`)).status()).toBe(200);
  });

  test("une coupure du réseau pendant un épinglage laisse un message sous la barre, jamais un silence", async ({ memberPage }) => {
    const mark = tag();
    const name = named("Vue hors ligne", mark);
    const res = await memberPage.request.post("/api/vues", { data: { objectType: "company", name, query: "f=type:est:client" } });
    expect(res.status()).toBe(201);

    await memberPage.goto("/entreprises");
    await memberPage.route("**/api/vues-epinglees", (route) => route.abort("connectionfailed"));
    const bar = memberPage.locator(VIEW_BAR);
    await bar.getByRole("button", { name: /^Vue : / }).click();
    await memberPage.locator(VIEW_MENU).getByRole("checkbox", { name: `Épingler ${name}` }).click();

    await expect(bar.getByRole("alert")).toHaveText("L'action a échoué. Réessayez.");
    /* L'écran reste dans l'état enregistré : la vue n'a pas rejoint la barre latérale. */
    await expect(memberPage.locator(SIDEBAR).getByRole("link", { name })).toHaveCount(0);
  });
});

test.describe("téléphone, 375 px (contrat 25 de la feature 1)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("le menu des vues tient dans l'écran sur un nom long, l'épingle et les flèches restant atteignables", async ({ memberPage }) => {
    const mark = tag();
    const long = named(LONG_NAME, mark);
    const res = await memberPage.request.post("/api/vues", { data: { objectType: "company", name: long, query: "f=type:est:client" } });
    expect(res.status()).toBe(201);

    await memberPage.goto("/entreprises");
    const bar = memberPage.locator(VIEW_BAR);
    await bar.getByRole("button", { name: /^Vue : / }).click();
    const menu = memberPage.locator(VIEW_MENU);
    await expect(menu.getByRole("link", { name: long })).toBeVisible();
    await menu.getByRole("checkbox", { name: `Épingler ${long}` }).click();
    await expect(menu.getByRole("checkbox", { name: `Épingler ${long}` })).toBeChecked();

    /* Aucun défilement horizontal de la page, menu ouvert compris (il est porté hors du flux). */
    const { scrollWidth, clientWidth } = await memberPage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(scrollWidth, "largeur de la page, menu des vues ouvert").toBeLessThanOrEqual(clientWidth);
    const wider = await memberPage.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => el.clientWidth > 1 && el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).textOverflow !== "ellipsis")
        .map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`),
    );
    expect(wider, "éléments plus larges que leur cadre").toEqual([]);

    /* Chaque ligne du menu, et donc l'épingle et les flèches, reste dans la fenêtre. */
    const boxes = await menu.getByRole("listitem").evaluateAll((items) => items.map((el) => el.getBoundingClientRect().right));
    expect(Math.max(...boxes), "bord droit des lignes du menu").toBeLessThanOrEqual(375);
    await expect(menu.getByRole("checkbox", { name: `Épingler ${long}` })).toBeInViewport();
    await expect(menu.getByRole("button", { name: `Monter la vue ${long}` })).toBeInViewport();
    await expect(menu.getByRole("button", { name: `Descendre la vue ${long}` })).toBeInViewport();
  });
});
