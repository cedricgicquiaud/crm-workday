import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PATCH as updateTheme } from "@/app/api/theme/route";
import { user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-theme@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Theme-1", role: "membre" as const };

let cookie: string;

beforeAll(async () => {
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await createUserWithPassword(MEMBER);
  cookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(closeDb);

async function storedTheme(): Promise<string> {
  const [row] = await db.select({ theme: user.theme }).from(user).where(eq(user.email, MEMBER.email));
  return row.theme;
}

describe("API du thème (CRM-29, D17)", () => {
  it("enregistre « sombre » sur l'utilisateur connecté et répond 200", async () => {
    expect(await storedTheme()).toBe("systeme");
    const res = await updateTheme(jsonRequest("PATCH", "/api/theme", { theme: "sombre" }, cookie));
    expect(res.status).toBe(200);
    expect(await storedTheme()).toBe("sombre");
  });
});
