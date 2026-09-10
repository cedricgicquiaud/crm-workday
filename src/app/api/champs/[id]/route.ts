import { NextResponse } from "next/server";
import { updateDefinition } from "@/features/custom-fields/definitions";
import { requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Modifie un champ défini, réservé aux administrateurs (contrat 20) : libellé, obligation, valeurs
 * de la liste, rang et archivage. 400 hors règle, 403 pour un membre, 404 champ inconnu, 409
 * libellé déjà pris. Un champ ne se supprime pas : il s'archive (D).
 */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  await requireAdmin(request);
  const { id } = await params;
  return NextResponse.json({ field: await updateDefinition(id, await request.json().catch(() => null)) });
});
