import { NextResponse } from "next/server";
import { unpinView } from "@/features/views/pinned";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Retire une vue de sa propre barre latérale ; la vue reste à l'équipe. 404 si elle n'y était pas. */
export const DELETE = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  await unpinView(actor.id, id);
  return NextResponse.json({ ok: true });
});
