import { NextResponse } from "next/server";
import { z } from "zod";
import { sendTestEmail } from "@/features/emails/envoi-test";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ to: z.string().optional() });

/** Envoi d'un email de test, réservé aux administrateurs ; sans `to`, vers leur propre adresse (contrat 30). */
export const POST = withApi(async (request) => {
  const { user: admin } = await requireAdmin(request);
  const parsed = bodySchema.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Le destinataire doit être une chaîne.");
  const result = await sendTestEmail({ id: admin.id, email: admin.email, firstName: admin.firstName ?? "", lastName: admin.lastName ?? "" }, parsed.data.to);
  return NextResponse.json(result);
});
