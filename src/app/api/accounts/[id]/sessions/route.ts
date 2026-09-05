import { NextResponse } from "next/server";
import { revokeAccountSessions } from "@/features/accounts/accounts";
import { requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** « Fermer toutes les sessions » d'un compte : il se reconnecte sur chacun de ses navigateurs (D10, contrat 11). */
export const DELETE = withApi(async (request: Request, { params }: Context) => {
  await requireAdmin(request);
  const { id } = await params;
  await revokeAccountSessions(id);
  return NextResponse.json({ ok: true });
});
