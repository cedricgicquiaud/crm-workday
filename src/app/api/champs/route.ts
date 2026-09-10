import { NextResponse } from "next/server";
import { createDefinition, listDefinitions } from "@/features/custom-fields/definitions";
import { requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Champs définis, tous objets confondus ou pour l'objet demandé (`?objet=company`). */
export const GET = withApi(async (request: Request) => {
  await requireAdmin(request);
  const objectType = new URL(request.url).searchParams.get("objet") ?? undefined;
  return NextResponse.json({ fields: await listDefinitions(objectType) });
});

/**
 * Définit un champ sur un objet, réservé aux administrateurs (contrat 20) : 201 avec le champ,
 * 400 hors règle, 403 pour un membre, 409 libellé déjà pris sur cet objet (contrat 22).
 */
export const POST = withApi(async (request: Request) => {
  const { user: actor } = await requireAdmin(request);
  const field = await createDefinition(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ field }, { status: 201 });
});
