import { NextResponse } from "next/server";
import { z } from "zod";
import { deactivateAccount, reactivateAccount, setAccountRole } from "@/features/accounts/accounts";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.union([z.object({ status: z.enum(["actif", "desactive"]) }), z.object({ role: z.enum(["administrateur", "membre"]) })]);

/** Changement d'état (D12) ou de rôle (D11) d'un compte par un administrateur. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  await requireAdmin(request);
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Rien à modifier.");
  if ("role" in parsed.data) await setAccountRole(id, parsed.data.role);
  else if (parsed.data.status === "desactive") await deactivateAccount(id);
  else await reactivateAccount(id);
  return NextResponse.json({ ok: true });
});
