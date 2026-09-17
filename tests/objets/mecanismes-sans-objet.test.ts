import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou de la règle de branchement (D4, contrat 33) : les mécanismes communs ne nomment aucun
 * objet. Seuls le registre et le manifeste ont le droit de citer `company`, `person`,
 * `consultant`, `lead` ou `opportunity` — le consultant arrive avec la feature 3 (D19), le lead avec
 * la 4.1 (D21), l'opportunité avec la 4.2 (D54), et aucun n'entre ici sans bruit.
 */
const MECHANISM_DIRS = ["src/features/objects", "src/features/history", "src/features/activities", "src/features/archive", "src/features/custom-fields", "src/features/views", "src/features/duplicates", "src/features/merge"];
const ALLOWED = /^(registry|manifest)(\.server)?\.ts$/;
const FORBIDDEN = /\b(company|person|consultant|lead|opportunity|Company|Person|Consultant|Lead|Opportunity)\b/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("les mécanismes ne citent aucun objet (CRM-33, D4)", () => {
  it("aucun fichier des mécanismes — objets, historique, activités, archivage, champs personnalisés, vues, doublons, fusion — hors registre et manifeste, ne contient « company », « person », « consultant », « lead » ni « opportunity »", () => {
    const offenders = MECHANISM_DIRS.flatMap(filesUnder)
      .filter((path) => !ALLOWED.test(relative(MECHANISM_DIRS.find((d) => path.startsWith(d))!, path)))
      .filter((path) => FORBIDDEN.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));
    expect(offenders).toEqual([]);
    /* Le garde-fou lit bien quelque chose : les dossiers existent et contiennent des fichiers surveillés. */
    expect(MECHANISM_DIRS.flatMap(filesUnder).length).toBeGreaterThan(2);
  });

  it("échouerait sur un fichier des mécanismes qui citerait un objet", () => {
    expect(FORBIDDEN.test('const label = getObject("company").labels;')).toBe(true);
    expect(FORBIDDEN.test('const label = getObject("consultant").labels;')).toBe(true);
    expect(FORBIDDEN.test('const label = getObject("lead").labels;')).toBe(true);
    expect(FORBIDDEN.test('const label = getObject("opportunity").labels;')).toBe(true);
    expect(FORBIDDEN.test("if (type === 'Lead') return;")).toBe(true);
    expect(FORBIDDEN.test("const leader = misleading;")).toBe(false);
    expect(FORBIDDEN.test("import { companies } from './x'; // personne, personnel")).toBe(false);
  });
});
