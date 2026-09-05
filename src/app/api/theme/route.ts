import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { user } from "@/db/schema";
import { isTheme } from "@/features/theme/theme";
import { requireSession, withApi } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Enregistre le thème (clair, sombre, système) de la personne connectée (D17). */
export const PATCH = withApi(async (request) => {
  const { user: me } = await requireSession(request);
  const body = (await request.json().catch(() => null)) as { theme?: unknown } | null;
  const theme = body?.theme;
  if (!isTheme(theme)) return NextResponse.json({ error: "theme_inconnu" }, { status: 400 });
  await db.update(user).set({ theme, updatedAt: new Date() }).where(eq(user.id, me.id));
  return NextResponse.json({ ok: true });
});
