import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PATCH as updateAccount } from "@/app/api/accounts/[id]/route";
import { session, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { HttpError, requireSession } from "@/lib/auth/session";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie, signIn } from "../helpers/auth";

const ADMIN = { email: "admin-statut@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Statut-1", role: "administrateur" as const };
const MEMBER = { email: "membre-statut@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };

let adminCookie: string;
let memberId: string;

const patch = (id: string, body: unknown, cookie?: string) =>
  updateAccount(jsonRequest("PATCH", `/api/accounts/${id}`, body, cookie), { params: Promise.resolve({ id }) });

/** Ce que voit une page ou une API appelée avec ce cookie : la session, ou l'erreur HTTP. */
const sessionFor = (cookie: string) =>
  requireSession(new Request("http://localhost:3000/accueil", { headers: { cookie } })).then(
    (s) => s,
    (error: unknown) => error,
  );

beforeAll(async () => {
  await db.delete(user);
  await createUserWithPassword(ADMIN);
  memberId = (await createUserWithPassword(MEMBER)).id;
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
});
afterAll(closeDb);

describe("désactivation d'un compte (CRM-19, contrat 10, D12)", () => {
  it("déconnecte le compte à sa prochaine requête, ferme ses sessions en base et refuse sa connexion", async () => {
    const memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
    expect(((await sessionFor(memberCookie)) as { user: { email: string } }).user.email).toBe(MEMBER.email);

    const asMember = await patch(memberId, { status: "desactive" }, memberCookie);
    expect(asMember.status).toBe(403);

    const res = await patch(memberId, { status: "desactive" }, adminCookie);
    expect(res.status).toBe(200);
    const [row] = await db.select().from(user).where(eq(user.id, memberId));
    expect(row.status).toBe("desactive");
    expect(await db.select().from(session).where(eq(session.userId, memberId))).toHaveLength(0);

    const refused = await sessionFor(memberCookie);
    expect(refused).toBeInstanceOf(HttpError);
    expect((refused as HttpError).status).toBe(401);
    expect((await signIn(MEMBER.email, MEMBER.password)).status).toBe(401);
  });
});
