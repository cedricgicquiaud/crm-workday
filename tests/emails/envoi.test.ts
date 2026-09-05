import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { cabinetSettings, emailLog } from "@/db/schema";
import { closeDb, db } from "@/lib/db";
import { sendTemplatedEmail, type MailTransport } from "@/lib/mail/send";

const VARIABLES = { prenom: "Ana", nom: "Martin", cabinet: "votre cabinet", lien: "http://localhost:3000/invitation/abc" };

/** Faux client Resend : le chemin de production s'exerce sans réseau, en injectant ce transport. */
function fakeTransport(outcome: { id: string } | Error): MailTransport & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => (outcome instanceof Error ? Promise.reject(outcome) : outcome)) };
}

beforeEach(async () => {
  await db.delete(cabinetSettings);
});
afterAll(async () => {
  await db.delete(cabinetSettings);
  await closeDb();
});

describe("chemin de production (CRM-22, CRM-26)", () => {
  it("sans expéditeur configuré, l'envoi échoue « expéditeur non configuré », le journal le consigne et rien ne part (contrat 33)", async () => {
    const transport = fakeTransport({ id: "re_123" });
    const to = `sans-expediteur-${Date.now()}@exemple.fr`;
    const result = await sendTemplatedEmail({ to, template: "invitation", variables: VARIABLES }, { transport });
    expect(result).toMatchObject({ status: "echec", errorReason: "expéditeur non configuré" });
    expect(transport.send).not.toHaveBeenCalled();
    const [row] = await db.select().from(emailLog).where(eq(emailLog.to, to));
    expect(row).toMatchObject({ status: "echec", errorReason: "expéditeur non configuré", template: "invitation", providerId: null });
  });
});
