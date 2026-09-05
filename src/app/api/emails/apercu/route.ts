import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";
import { previewText } from "@/lib/mail/send";

export const dynamic = "force-dynamic";

const textSchema = z.object({ subject: z.string(), body: z.string() });

/** Aperçu du texte saisi avec des valeurs d'exemple ; rien n'est enregistré (D22). */
export const POST = withApi(async (request) => {
  await requireAdmin(request);
  const parsed = textSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Le sujet et le corps sont requis.");
  return NextResponse.json(await previewText(parsed.data));
});
