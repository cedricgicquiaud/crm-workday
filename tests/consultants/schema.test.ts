import { afterAll, describe, expect, it } from "vitest";
import "@/features/objects/manifest.server";
import { COMPANY_TYPES } from "@/features/companies/schema";
import { fieldsOf, validateValues } from "@/features/objects/fields";
import type { FieldDescriptor } from "@/features/objects/registry";
import { closeDb } from "@/lib/db";
import { schemaSnapshot } from "../helpers/db";

afterAll(closeDb);

const personFields = () => fieldsOf("person");
const field = (key: string): FieldDescriptor => personFields().find((candidate) => candidate.key === key)!;
const profileFields = () => personFields().filter((candidate) => candidate.profile !== undefined);
const check = (input: Record<string, unknown>) => validateValues(profileFields(), input, { partial: true });

/**
 * D18 : les deux tables du profil consultant, la société de facturation portée par la personne (comme
 * l'entreprise de rattachement du profil contact) et « Profils » passé d'une valeur à un ensemble.
 */
describe("tables du profil consultant (CRM-80, D18)", () => {
  it("porte le profil, ses modules, la société de facturation de la personne et un ensemble de profils", async () => {
    const snapshot = await schemaSnapshot();
    expect(snapshot).toContain("consultant_profile.person_id");
    expect(snapshot).toContain("consultant_profile.status");
    expect(snapshot).toContain("consultant_profile.daily_cost:numeric");
    expect(snapshot).toContain("consultant_profile.available_from:date");
    expect(snapshot).toContain("consultant_profile.unavailable:boolean");
    expect(snapshot).toContain("consultant_profile.unavailable_reason");
    expect(snapshot).toContain("consultant_profile.years_experience:integer");
    expect(snapshot).toContain("consultant_profile.languages");
    expect(snapshot).toContain("consultant_profile.cv_url");
    expect(snapshot).toContain("consultant_module.profile_id");
    expect(snapshot).toContain("consultant_module.module");
    expect(snapshot).toContain("consultant_module.certified:boolean");
    expect(snapshot).toContain("person.billing_company_id");
    /* « Profils » est un ensemble : une personne en porte zéro, un ou deux (D8). */
    expect(snapshot).toContain("person.profiles:ARRAY");
  });
});

/**
 * D19 : les champs du profil se déclarent avec leur profil. Ils restent des champs de la personne —
 * colonnes, filtres et tris de ses listes — mais se règlent par l'API du profil.
 */
describe("champs du profil consultant déclarés par la personne (CRM-80, D2, D3, D5, D6, D7)", () => {
  it("déclare chaque champ du profil sous le profil consultant, et laisse « Poste » dans les champs de la personne", () => {
    expect(profileFields().map((entry) => entry.key)).toEqual([
      "status",
      "modules",
      "certifiedModules",
      "billingCompanyName",
      "dailyCost",
      "availableFrom",
      "unavailable",
      "unavailableReason",
      "yearsExperience",
      "languages",
      "cvUrl",
    ]);
    expect(new Set(profileFields().map((entry) => entry.profile?.key))).toEqual(new Set(["consultant"]));
    expect(field("jobTitle").profile).toBeUndefined();
  });

  it("ferme le statut à salarié, freelance et portage, et le rend obligatoire dans le profil", () => {
    expect(field("status").values?.map((value) => value.value)).toEqual(["salarie", "freelance", "portage"]);
    expect(field("status").required).toBe(true);
    expect(check({ status: "stagiaire" }).errors.status).toBe("Valeur hors liste pour « Statut ».");
    expect(check({ status: "freelance" }).errors).toEqual({});
  });

  it("ferme les modules Workday aux dix-huit modules de la décision 3, en ensemble", () => {
    expect(field("modules").type).toBe("multilist");
    expect(field("modules").values).toHaveLength(18);
    expect(field("modules").values?.map((value) => value.label)).toContain("Adaptive Planning");
    expect(check({ modules: ["hcm", "integration"] }).errors).toEqual({});
    expect(check({ modules: ["workday_plus"] }).errors.modules).toBe("Valeur hors liste pour « Modules ».");
  });

  it("refuse un coût hors bornes ou à trois décimales, et l'écrit en euros", () => {
    expect(check({ dailyCost: 650 }).errors).toEqual({});
    expect(check({ dailyCost: 650.123 }).errors.dailyCost).toBe("« Coût journalier » ne prend pas plus de 2 décimales.");
    expect(check({ dailyCost: -1 }).errors.dailyCost).toBe("« Coût journalier » doit être compris entre 0 et 10 000.");
    expect(check({ dailyCost: 10_001 }).errors.dailyCost).toBe("« Coût journalier » doit être compris entre 0 et 10 000.");
    expect(field("dailyCost").unit).toBe("€");
  });

  it("refuse des années d'expérience à virgule ou au-delà de quarante", () => {
    expect(check({ yearsExperience: 6.5 }).errors.yearsExperience).toBe("« Années d'expérience » doit être un nombre entier.");
    expect(check({ yearsExperience: 41 }).errors.yearsExperience).toBe("« Années d'expérience » doit être compris entre 0 et 40.");
    expect(check({ yearsExperience: 6 }).errors).toEqual({});
  });

  it("refuse un lien de CV qui n'est pas une adresse https, ou de plus de deux cents caractères", () => {
    expect(check({ cvUrl: "http://exemple.fr/cv.pdf" }).errors.cvUrl).toBe("Le lien du CV doit être une adresse https (https://…).");
    expect(check({ cvUrl: `https://exemple.fr/${"c".repeat(200)}` }).errors.cvUrl).toBe("« CV » dépasse 200 caractères.");
    expect(check({ cvUrl: "https://exemple.fr/cv.pdf" }).errors).toEqual({});
  });

  it("borne les langues et le motif d'indisponibilité à cent vingt caractères, et rend « Indisponible » en oui / non", () => {
    expect(check({ languages: "l".repeat(121) }).errors.languages).toBe("« Langues » dépasse 120 caractères.");
    expect(check({ unavailableReason: "m".repeat(121) }).errors.unavailableReason).toBe("« Motif d'indisponibilité » dépasse 120 caractères.");
    expect(field("unavailable").type).toBe("list");
    expect(field("unavailable").values?.map((value) => value.value)).toEqual(["oui", "non"]);
  });
});

describe("« Profils » devient un ensemble (CRM-80, D8)", () => {
  it("porte Contact et Consultant, dans cet ordre, et n'enregistre plus « aucun »", () => {
    expect(field("profiles").type).toBe("multilist");
    expect(field("profiles").values).toEqual([
      { value: "contact", label: "Contact" },
      { value: "consultant", label: "Consultant" },
    ]);
    expect(field("profiles").emptyLabel).toBe("Aucun");
    expect(field("profiles").default).toBeUndefined();
  });
});

describe("type d'entreprise du freelance (CRM-80, D4)", () => {
  it("ajoute « société de consultant » aux types d'entreprise", () => {
    expect(COMPANY_TYPES.map((entry) => entry.value)).toContain("societe_de_consultant");
    expect(COMPANY_TYPES.find((entry) => entry.value === "societe_de_consultant")?.label).toBe("Société de consultant");
  });
});
