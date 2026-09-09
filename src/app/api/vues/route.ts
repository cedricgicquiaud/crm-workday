import { NextResponse } from "next/server";
import { createView, listViews } from "@/features/views/views";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Vues d'une liste (`?objet=<clé d'objet>`) : la vue par défaut, puis les vues enregistrées par l'équipe. */
export const GET = withApi(async (request: Request) => {
  await requireSession(request);
  const type = new URL(request.url).searchParams.get("objet") ?? "";
  return NextResponse.json({ views: await listViews(type) });
});

/** Enregistre l'état d'une liste sous un nom, ouvert à tout membre (D11) : 201, 400 nom hors règle, 409 nom déjà pris. */
export const POST = withApi(async (request: Request) => {
  const { user: actor } = await requireSession(request);
  const view = await createView(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ id: view.id }, { status: 201 });
});
