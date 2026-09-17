import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * CRM-100 : une suite d'écran teste toujours le dossier qui la contient. Lancée depuis le dépôt
 * principal pour une copie de travail, elle lit le `.env.local` de la copie (port et bases du poste)
 * et appelle les scripts `tsx` de la copie, jamais ceux du dossier courant.
 */
const ROOT = join(__dirname, "..", "..");
const scratch = mkdtempSync(join(tmpdir(), "crm-100-"));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("tests d'écran liés à leur dossier (CRM-100)", () => {
  it("la configuration chargée depuis un autre dossier lit le .env.local de la copie", () => {
    const copy = join(scratch, "copie");
    const elsewhere = join(scratch, "ailleurs");
    mkdirSync(join(copy, "src", "lib"), { recursive: true });
    mkdirSync(elsewhere);
    copyFileSync(join(ROOT, "playwright.config.ts"), join(copy, "playwright.config.ts"));
    copyFileSync(join(ROOT, "src", "lib", "dotenv.ts"), join(copy, "src", "lib", "dotenv.ts"));
    symlinkSync(join(ROOT, "node_modules"), join(copy, "node_modules"), "dir");
    writeFileSync(join(copy, ".env.local"), "APP_URL=http://localhost:3999\n");
    writeFileSync(join(elsewhere, ".env.local"), "APP_URL=http://localhost:3998\n");
    writeFileSync(join(copy, "lire.ts"), 'import config from "./playwright.config";\nconsole.log(config.use?.baseURL);\n');

    const env = { ...process.env };
    delete env.APP_URL;
    const baseURL = execFileSync(join(ROOT, "node_modules", ".bin", "tsx"), [join(copy, "lire.ts")], { cwd: elsewhere, env, encoding: "utf8" }).trim();

    expect(baseURL).toBe("http://localhost:3999");
  });

  it("refus : aucun process.cwd() dans la configuration, la préparation globale, les fixtures et les utilitaires", () => {
    const files = [join(ROOT, "playwright.config.ts"), join(ROOT, "e2e", "global-setup.ts"), ...filesUnder(join(ROOT, "e2e", "fixtures")), ...filesUnder(join(ROOT, "e2e", "helpers"))];
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes("process.cwd("));
    expect(offenders.map((file) => relative(ROOT, file))).toEqual([]);
  });

  it("refus : les scripts tsx s'appellent par un chemin dérivé du fichier, dans le dossier de la copie", () => {
    const files = [join(ROOT, "e2e", "global-setup.ts"), ...filesUnder(join(ROOT, "e2e", "fixtures")), ...filesUnder(join(ROOT, "e2e", "helpers"))];
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const name = relative(ROOT, file);
      /* un chemin écrit depuis la racine du dépôt (« e2e/… », « src/… ») se résout depuis le dossier courant */
      for (const match of source.matchAll(/["'](?:\.\/)?(?:e2e|src)\/[^"']*["']/g)) offenders.push(`${name} : ${match[0]}`);
      /* chaque sous-processus fixe son dossier : le .env.local et l'alias @/ de l'enfant sont ceux de la copie */
      for (const call of source.matchAll(/execFileSync\([\s\S]*?\);/g)) if (!/\bcwd\s*:/.test(call[0])) offenders.push(`${name} : ${call[0].split("\n")[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
