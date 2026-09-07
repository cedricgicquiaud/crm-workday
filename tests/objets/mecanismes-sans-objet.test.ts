import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou de la règle de branchement (D4, contrat 33) : les mécanismes communs ne nomment aucun
 * objet. Seuls le registre et le manifeste ont le droit de citer `company` ou `person`.
 */
const MECHANISM_DIRS = ["src/features/objects", "src/features/history", "src/features/activities"];
const ALLOWED = /^(registry|manifest)(\.server)?\.ts$/;
const FORBIDDEN = /\b(company|person|Company|Person)\b/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("les mécanismes ne citent aucun objet (CRM-33, D4)", () => {
  it("aucun fichier de src/features/objects, src/features/history et src/features/activities, hors registre et manifeste, ne contient « company » ni « person »", () => {
    const offenders = MECHANISM_DIRS.flatMap(filesUnder)
      .filter((path) => !ALLOWED.test(relative(MECHANISM_DIRS.find((d) => path.startsWith(d))!, path)))
      .filter((path) => FORBIDDEN.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));
    expect(offenders).toEqual([]);
    /* Le garde-fou lit bien quelque chose : les deux dossiers existent et contiennent des fichiers surveillés. */
    expect(MECHANISM_DIRS.flatMap(filesUnder).length).toBeGreaterThan(2);
  });

  it("échouerait sur un fichier des mécanismes qui citerait un objet", () => {
    expect(FORBIDDEN.test('const label = getObject("company").labels;')).toBe(true);
    expect(FORBIDDEN.test("import { companies } from './x'; // personne, personnel")).toBe(false);
  });
});
