import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { user } from "@/db/schema";
import { HttpError, requireSession, withApi } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Identité de la personne connectée, pour la page « Mon profil » (D13). */
export const GET = withApi(async (request) => {
  const { user: me } = await requireSession(request);
  return NextResponse.json({ firstName: me.firstName, lastName: me.lastName, email: me.email });
});

const identitySchema = z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1) });

/** Mise à jour du profil de la personne connectée : prénom et nom (D13). */
export const PATCH = withApi(async (request) => {
  const { user: me } = await requireSession(request);
  const parsed = identitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Le prénom et le nom sont requis.");
  const { firstName, lastName } = parsed.data;
  await db.update(user).set({ firstName, lastName, name: `${firstName} ${lastName}`, updatedAt: new Date() }).where(eq(user.id, me.id));
  return NextResponse.json({ ok: true });
});
