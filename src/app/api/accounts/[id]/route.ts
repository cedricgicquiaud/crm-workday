import { NextResponse } from "next/server";
import { z } from "zod";
import { deactivateAccount } from "@/features/accounts/accounts";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({ status: z.enum(["desactive"]) });

/** Changement d'état d'un compte par un administrateur (D12). */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  await requireAdmin(request);
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "Rien à modifier.");
  await deactivateAccount(id);
  return NextResponse.json({ ok: true });
});
