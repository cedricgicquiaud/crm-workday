import { NextResponse } from "next/server";
import { addProposal } from "@/features/opportunities/proposals";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Ajout d'un consultant à une opportunité par tout membre (D44, D55). */
export const POST = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await addProposal(id, await request.json().catch(() => null), { id: actor.id }), { status: 201 });
});
