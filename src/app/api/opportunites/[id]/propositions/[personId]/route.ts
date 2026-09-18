import { NextResponse } from "next/server";
import { changeProposal, withdrawProposal } from "@/features/opportunities/proposals";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; personId: string }> };

/** Changement du résultat ou du TJM de vente proposé d'une proposition par tout membre (D45, D55). */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id, personId } = await params;
  return NextResponse.json(await changeProposal(id, personId, await request.json().catch(() => null), { id: actor.id }));
});

/** Retrait d'une proposition par tout membre, retenu compris (D46, D55). */
export const DELETE = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id, personId } = await params;
  await withdrawProposal(id, personId, { id: actor.id });
  return NextResponse.json({ ok: true });
});
