import { NextResponse } from "next/server";
import { z } from "zod";
import { resendFromJournal } from "@/features/emails/renvoi";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** « Renvoyer » un envoi du journal, réservé aux administrateurs (D24). */
export const POST = withApi(async (request, { params }: Context) => {
  const { user: admin } = await requireAdmin(request);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "envoi_introuvable", "Cet envoi n'existe pas dans le journal.");
  await resendFromJournal(id, admin.id);
  return NextResponse.json({ ok: true });
});
