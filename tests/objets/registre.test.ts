import { CircleDashedIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { fieldsOf, validateValues } from "@/features/objects/fields";
import { displayValue } from "@/features/objects/labels";
import { getObject, listObjects, registerObject, type FieldDescriptor, type ListValue } from "@/features/objects/registry";

/**
 * D4 (règle de branchement), CRM-33 : ce fichier est un « module de test » qui déclare un objet
 * auprès du registre sans toucher aux fichiers des mécanismes. Les objets des features suivantes
 * feront pareil.
 */
describe("registre d'objets (CRM-33, D4)", () => {
  it("rend à un module de test qui enregistre un objet ses champs typés (fieldsOf) et l'adresse de sa fiche (href)", () => {
    registerObject({
      key: "test_object",
      order: 900,
      labels: { singular: "Objet de test", plural: "Objets de test", article: "un" },
      icon: CircleDashedIcon,
      href: (id) => `/objets-de-test/${id}`,
      listHref: "/objets-de-test",
      apiBase: "/api/objets-de-test",
      titleField: "name",
      fields: [
        { key: "name", label: "Nom", type: "text", required: true, maxLength: 120, order: 10 },
        { key: "kind", label: "Genre", type: "list", values: [{ value: "a", label: "A" }], order: 20 },
      ],
      relations: [],
    });

    expect(fieldsOf("test_object").map((f) => [f.key, f.type])).toEqual([
      ["name", "text"],
      ["kind", "list"],
    ]);
    expect(getObject("test_object").href("42")).toBe("/objets-de-test/42");
  });
});

describe("ordre des objets", () => {
  it("liste les objets par rang « order » croissant, quel que soit l'ordre d'enregistrement", () => {
    const base = { labels: { singular: "x", plural: "x", article: "un" }, icon: CircleDashedIcon, href: (id: string) => id, listHref: "/x", apiBase: "/api/x", titleField: "name", fields: [{ key: "name", label: "Nom", type: "text" as const, order: 10 }], relations: [] };
    registerObject({ ...base, key: "test_ordre_b", order: 920 });
    registerObject({ ...base, key: "test_ordre_a", order: 910 });
    const keys = listObjects()
      .map((o) => o.key)
      .filter((k) => k.startsWith("test_ordre_"));
    expect(keys).toEqual(["test_ordre_a", "test_ordre_b"]);
  });
});

describe("objet mal déclaré (CRM-33, D4)", () => {
  const base = { order: 940, labels: { singular: "x", plural: "x", article: "un" }, icon: CircleDashedIcon, href: (id: string) => id, listHref: "/x", apiBase: "/api/x", relations: [], fields: [{ key: "name", label: "Nom", type: "text" as const, order: 10 }] };

  it("refuse à l'enregistrement, avec un message explicite, un champ titre qui ne correspond à aucun champ déclaré", () => {
    expect(() => registerObject({ ...base, key: "test_titre_absent", titleField: "libelle" })).toThrow("Objet « test_titre_absent » : le champ titre « libelle » n'est pas déclaré dans ses champs.");
    expect(() => getObject("test_titre_absent")).toThrow("Objet inconnu");
  });

  it("refuse à l'enregistrement une colonne de liste qui ne correspond à aucun champ déclaré", () => {
    expect(() => registerObject({ ...base, key: "test_colonne_absente", titleField: "name", listColumns: ["name", "ville"] })).toThrow("Objet « test_colonne_absente » : la colonne de liste « ville » n'est pas déclarée dans ses champs.");
    expect(() => getObject("test_colonne_absente")).toThrow("Objet inconnu");
  });

  /* Les badges de tête de la fiche (« Profils : Contact ») sont des champs déclarés : une clé inconnue ne doit pas attendre le rendu pour se voir. */
  it("refuse à l'enregistrement un champ de tête qui ne correspond à aucun champ déclaré", () => {
    expect(() => registerObject({ ...base, key: "test_tete_absente", titleField: "name", headerFields: ["statut"] })).toThrow("Objet « test_tete_absente » : le champ de tête « statut » n'est pas déclaré dans ses champs.");
    expect(() => getObject("test_tete_absente")).toThrow("Objet inconnu");
  });

  it("accepte un champ de tête qui correspond à un champ déclaré", () => {
    registerObject({ ...base, key: "test_tete_presente", titleField: "name", headerFields: ["name"] });
    expect(getObject("test_tete_presente").headerFields).toEqual(["name"]);
  });
});

/**
 * Types de champ de la feature 3 (D19) : un champ à plusieurs valeurs (`multilist`) et les
 * précisions d'un nombre (`unit`, `decimals`, `integer`, bornes). Les descripteurs sont écrits ici,
 * comme les écrirait n'importe quel objet : la validation est celle des mécanismes, pas celle d'un
 * objet en particulier.
 */
describe("champ à plusieurs valeurs et bornes d'un nombre (CRM-80, D19)", () => {
  const MODULES: readonly ListValue[] = [
    { value: "hcm", label: "HCM" },
    { value: "integration", label: "Integration" },
  ];
  const FIELDS: readonly FieldDescriptor[] = [
    { key: "modules", label: "Modules", type: "multilist", values: MODULES, retiredValues: [{ value: "student", label: "Student" }], order: 10 },
    { key: "dailyCost", label: "Coût journalier", type: "number", unit: "€", decimals: 2, min: 0, max: 10_000, order: 20 },
    { key: "yearsExperience", label: "Années d'expérience", type: "number", integer: true, min: 0, max: 40, order: 30 },
  ];
  const check = (input: Record<string, unknown>) => validateValues(FIELDS, input, { partial: true });

  it("accepte un tableau de valeurs de la liste et le rend tel quel", () => {
    const { values, errors } = check({ modules: ["hcm", "integration"] });
    expect(errors).toEqual({});
    expect(values.modules).toEqual(["hcm", "integration"]);
  });

  it("accepte un tableau vide : un ensemble vide est une valeur, pas une absence", () => {
    expect(check({ modules: [] })).toEqual({ values: { modules: [] }, errors: {} });
  });

  it("refuse une chaîne là où un ensemble est attendu", () => {
    expect(check({ modules: "hcm" }).errors.modules).toBe("« Modules » attend une liste de valeurs.");
  });

  it("refuse une valeur hors liste, une valeur retirée comprise", () => {
    expect(check({ modules: ["hcm", "inconnu"] }).errors.modules).toBe("Valeur hors liste pour « Modules ».");
    expect(check({ modules: ["student"] }).errors.modules).toBe("Valeur hors liste pour « Modules ».");
  });

  it("refuse un nombre à plus de décimales que le champ n'en prend", () => {
    expect(check({ dailyCost: 650.123 }).errors.dailyCost).toBe("« Coût journalier » ne prend pas plus de 2 décimales.");
    expect(check({ dailyCost: 650.5 }).errors).toEqual({});
  });

  it("refuse un nombre hors des bornes du champ", () => {
    expect(check({ dailyCost: -1 }).errors.dailyCost).toBe("« Coût journalier » doit être compris entre 0 et 10 000.");
    expect(check({ dailyCost: 10_001 }).errors.dailyCost).toBe("« Coût journalier » doit être compris entre 0 et 10 000.");
    expect(check({ yearsExperience: 41 }).errors.yearsExperience).toBe("« Années d'expérience » doit être compris entre 0 et 40.");
  });

  it("refuse un nombre à virgule sur un champ entier", () => {
    expect(check({ yearsExperience: 6.5 }).errors.yearsExperience).toBe("« Années d'expérience » doit être un nombre entier.");
    expect(check({ yearsExperience: 6 }).errors).toEqual({});
  });

  it("écrit un ensemble par ses libellés joints et son unité après un nombre", () => {
    const modules = FIELDS[0];
    const cost = FIELDS[1];
    expect(displayValue(modules, ["hcm", "integration"], [])).toBe("HCM, Integration");
    expect(displayValue(modules, ["student"], [])).toBe("Student (retirée)");
    expect(displayValue(cost, 650, [])).toBe("650,00 €");
  });

  it("marque les valeurs que le champ compagnon déclaré porte aussi", () => {
    const modules = { ...FIELDS[0], markedBy: { field: "certifiedModules", mark: "✔" } };
    expect(displayValue(modules, ["hcm", "integration"], [], ["hcm"])).toBe("HCM ✔, Integration");
    expect(displayValue(modules, ["hcm", "integration"], [], [])).toBe("HCM, Integration");
    /* Sans le champ compagnon, l'ensemble se lit comme n'importe quel autre. */
    expect(displayValue(modules, ["hcm"], [])).toBe("HCM");
  });

  it("affiche l'étiquette déclarée pour un ensemble vide, et « — » sans étiquette", () => {
    const modules = FIELDS[0];
    expect(displayValue(modules, [], [])).toBe("—");
    expect(displayValue({ ...modules, emptyLabel: "Aucun" }, [], [])).toBe("Aucun");
  });
});
