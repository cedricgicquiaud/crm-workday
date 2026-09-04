import { NextResponse } from "next/server";
import { z } from "zod";
import { resendInvitation } from "@/features/auth/invitations";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().email() });

/** « Renvoyer l'invitation » : lien neuf, l'ancien ne vaut plus (D7). */
export const POST = withApi(async (request) => {
  const { user: admin } = await requireAdmin(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "L'email est requis.");
  const { userId } = await resendInvitation(parsed.data.email, admin.id);
  return NextResponse.json({ userId });
});
