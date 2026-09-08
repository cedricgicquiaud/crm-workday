import { NextResponse } from "next/server";
import { z } from "zod";
import { pinView, reorderPins } from "@/features/views/pinned";
import { HttpError, requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const pinSchema = z.object({ viewId: z.string().trim().min(1) });
const orderSchema = z.object({ viewIds: z.array(z.string().trim().min(1)) });

/** Épingle une vue dans sa propre barre latérale (contrat 24) : 201, 404 vue inconnue, 409 vue déjà épinglée. */
export const POST = withApi(async (request: Request) => {
  const { user: actor } = await requireSession(request);
  const parsed = pinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "La vue à épingler est attendue.");
  await pinView(actor.id, parsed.data.viewId);
  return NextResponse.json({ ok: true }, { status: 201 });
});

/** Range sa barre latérale dans l'ordre reçu : le rang des épingles est choisi, donc enregistré. */
export const PATCH = withApi(async (request: Request) => {
  const { user: actor } = await requireSession(request);
  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "L'ordre des vues épinglées est attendu.");
  await reorderPins(actor.id, parsed.data.viewIds);
  return NextResponse.json({ ok: true });
});
