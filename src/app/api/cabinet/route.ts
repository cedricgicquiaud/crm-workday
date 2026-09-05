import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";
import { getCabinetSettings, saveCabinetSettings } from "@/lib/mail/settings";

export const dynamic = "force-dynamic";

/** Paramètres du cabinet, réservés aux administrateurs (D11, contrat 16). */
export const GET = withApi(async (request) => {
  await requireAdmin(request);
  return NextResponse.json({ settings: await getCabinetSettings() });
});

const settingsSchema = z.object({
  name: z.string().trim().min(1),
  senderName: z.string().trim().min(1),
  senderEmail: z.string().trim().email(),
});

/** Nom du cabinet, nom d'affichage et adresse d'expédition : la ligne unique est remplacée (D20). */
export const PUT = withApi(async (request) => {
  await requireAdmin(request);
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Le nom du cabinet, le nom d'affichage et une adresse d'expédition valide sont requis.");
  await saveCabinetSettings(parsed.data);
  return NextResponse.json({ ok: true });
});
