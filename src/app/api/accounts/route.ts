import { NextResponse } from "next/server";
import { z } from "zod";
import { inviteAccount, listAccounts } from "@/features/accounts/accounts";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Liste des comptes, réservée aux administrateurs (contrat 16). */
export const GET = withApi(async (request) => {
  await requireAdmin(request);
  return NextResponse.json({ accounts: await listAccounts() });
});

const newAccountSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  role: z.enum(["administrateur", "membre"]),
});

/** Création d'un compte depuis l'écran des comptes : le compte naît « invité » (D7, contrat 5). */
export const POST = withApi(async (request) => {
  const { user: admin } = await requireAdmin(request);
  const parsed = newAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Email, prénom, nom et rôle sont requis.");
  const { userId } = await inviteAccount({ ...parsed.data, authorId: admin.id });
  return NextResponse.json({ userId }, { status: 201 });
});
