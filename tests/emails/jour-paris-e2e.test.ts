import { describe, expect, it } from "vitest";
import { parisDayFromToday } from "../../e2e/helpers/paris-day";

/* CRM-99 : le test d'écran du journal calculait « demain » sur le jour UTC et rougissait entre 0 h et 2 h à Paris. */
describe("jour civil de Paris pour les tests d'écran (CRM-99)", () => {
  it("à 22 h 30 UTC le 16 septembre, Paris est déjà le 17 : demain est le 18", () => {
    const at = new Date("2026-09-16T22:30:00Z");
    expect(parisDayFromToday(0, at)).toBe("2026-09-17");
    expect(parisDayFromToday(1, at)).toBe("2026-09-18");
  });

  it("en journée, le jour de Paris et le jour UTC coïncident", () => {
    const at = new Date("2026-09-17T09:00:00Z");
    expect(parisDayFromToday(1, at)).toBe("2026-09-18");
    expect(parisDayFromToday(-1, at)).toBe("2026-09-16");
  });
});
