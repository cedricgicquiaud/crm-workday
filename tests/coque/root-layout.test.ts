import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToString } from "react-dom/server";
import { user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { sessionCookie } from "../helpers/auth";

/** Le layout racine lit la session par `headers()` : on lui présente la requête du navigateur (avec ou sans cookie). */
let requestCookie: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestCookie ? { cookie: requestCookie } : {}),
}));
/** `next/font` n'existe qu'à travers le compilateur de Next.js : la police se réduit ici à sa variable CSS. */
vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "--font-inter" }) }));

const MEMBER = { email: "membre-layout@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Layout-1", role: "membre" as const };

beforeAll(async () => {
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await createUserWithPassword(MEMBER);
});
afterAll(closeDb);

async function servedHtml(): Promise<string> {
  const { default: RootLayout } = await import("@/app/layout");
  return renderToString(await RootLayout({ children: "page" }));
}

const htmlTag = (html: string) => html.match(/<html[^>]*>/)![0];

describe("HTML servi et thème (CRM-29, contrat 26)", () => {
  it("porte la classe « dark » sur <html> pour un utilisateur en thème sombre, sans attendre un script", async () => {
    await db.update(user).set({ theme: "sombre" }).where(eq(user.email, MEMBER.email));
    requestCookie = await sessionCookie(MEMBER.email, MEMBER.password);
    expect(htmlTag(await servedHtml())).toMatch(/class="[^"]*\bdark\b/);
  });
});
