import { NextResponse } from "next/server";
import { changeProposal } from "@/features/opportunities/proposals";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; personId: string }> };

/** Changement du résultat d'une proposition par tout membre (D45, D55). */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id, personId } = await params;
  return NextResponse.json(await changeProposal(id, personId, await request.json().catch(() => null)));
});
