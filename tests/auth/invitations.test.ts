import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createInvitation } from "@/app/api/invitations/route";
import { user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { getAuth } from "@/lib/auth";
import { closeDb, db } from "@/lib/db";

const ADMIN = { email: "admin-invitations@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Invit-1", role: "administrateur" as const };
const MEMBER = { email: "membre-invitations@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };

/** Connexion par l'API, puis cookie de session tel que le navigateur le renverrait. */
async function sessionCookie(email: string, password: string): Promise<string> {
  const res = await getAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim()).join("; ");
}

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

let adminCookie: string;
let memberCookie: string;

beforeAll(async () => {
  await db.delete(user);
  await createUserWithPassword(ADMIN);
  await createUserWithPassword(MEMBER);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(closeDb);

describe("API des invitations (CRM-15)", () => {
  it("refuse la création à un membre (403) et sans session (401) : requireAdmin() (contrat 16)", async () => {
    const invitee = { email: "invite@exemple.fr", firstName: "Inès", lastName: "Roux", role: "membre" };
    const asMember = await createInvitation(post("/api/invitations", invitee, memberCookie));
    expect(asMember.status).toBe(403);
    const anonymous = await createInvitation(post("/api/invitations", invitee));
    expect(anonymous.status).toBe(401);
    expect(await db.select().from(user).where(eq(user.email, invitee.email))).toHaveLength(0);
  });
});
