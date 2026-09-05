import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { user } from "@/db/schema";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from "@/features/auth/password-rule";
import { getAuth } from "@/lib/auth";
import { HttpError, requireSession, withApi } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Identité de la personne connectée, pour la page « Mon profil » (D13). */
export const GET = withApi(async (request) => {
  const { user: me } = await requireSession(request);
  return NextResponse.json({ firstName: me.firstName, lastName: me.lastName, email: me.email });
});

const identitySchema = z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1) });
const passwordSchema = z.object({ currentPassword: z.string(), newPassword: z.string() });
const bodySchema = z.union([identitySchema, passwordSchema]);

/** Ancien mot de passe vérifié par Better Auth, règle des 12 caractères en amont (D9). */
async function changePassword(request: Request, input: z.infer<typeof passwordSchema>) {
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, "mot_de_passe_trop_court", PASSWORD_RULE);
  try {
    await getAuth().api.changePassword({ body: input, headers: request.headers });
  } catch (error) {
    /** `isAPIError` plutôt que `instanceof` : le serveur de dev peut charger deux copies de la classe. */
    if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") {
      throw new HttpError(400, "mot_de_passe_actuel_incorrect", "Le mot de passe actuel est incorrect.");
    }
    throw error;
  }
}

/** Mise à jour du profil de la personne connectée : prénom et nom, ou mot de passe (D13). */
export const PATCH = withApi(async (request) => {
  const { user: me } = await requireSession(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Prénom et nom, ou mot de passe actuel et nouveau, sont requis.");
  if ("newPassword" in parsed.data) {
    await changePassword(request, parsed.data);
  } else {
    const { firstName, lastName } = parsed.data;
    await db.update(user).set({ firstName, lastName, name: `${firstName} ${lastName}`, updatedAt: new Date() }).where(eq(user.id, me.id));
  }
  return NextResponse.json({ ok: true });
});
