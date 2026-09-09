import { NextResponse } from "next/server";
import { deleteView, updateView } from "@/features/views/views";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Renomme une vue ou met à jour son état, pour toute l'équipe (D11) : 400 nom hors règle, 404 vue inconnue, 409 vue par défaut ou nom déjà pris. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await updateView(id, await request.json().catch(() => null)));
});

/** Supprime une vue pour toute l'équipe, épingles comprises : 404 vue inconnue, 409 vue par défaut (contrat 26). */
export const DELETE = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  await deleteView(id);
  return NextResponse.json({ ok: true });
});
