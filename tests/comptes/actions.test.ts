import { describe, expect, it } from "vitest";
import { accountActions } from "@/features/accounts/actions";

const admin = { role: "administrateur" as const, status: "actif" as const };
const member = { role: "membre" as const, status: "actif" as const };

const byId = (actions: ReturnType<typeof accountActions>) => Object.fromEntries(actions.map((a) => [a.id, a]));

describe("actions d'une ligne de compte (CRM-19, contrat 17)", () => {
  it("rend inactifs « Désactiver » et « Passer membre » pour le dernier administrateur actif, actifs dès qu'un second administrateur actif existe", () => {
    const last = byId(accountActions(admin, { activeAdminCount: 1 }));
    expect(last["desactiver"].disabledReason).toBe("Dernier administrateur actif");
    expect(last["changer-role"].label).toBe("Passer membre");
    expect(last["changer-role"].disabledReason).toBe("Dernier administrateur actif");
    expect(last["fermer-sessions"].disabledReason).toBeUndefined();

    const notLast = byId(accountActions(admin, { activeAdminCount: 2 }));
    expect(notLast["desactiver"].disabledReason).toBeUndefined();
    expect(notLast["changer-role"].disabledReason).toBeUndefined();

    const simpleMember = byId(accountActions(member, { activeAdminCount: 1 }));
    expect(simpleMember["desactiver"].disabledReason).toBeUndefined();
    expect(simpleMember["changer-role"].label).toBe("Passer administrateur");
  });
});
