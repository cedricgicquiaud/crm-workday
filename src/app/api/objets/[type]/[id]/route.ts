import { NextResponse } from "next/server";
import { deleteRecord } from "@/features/archive/delete";
import { requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string; id: string }> };

/**
 * Suppression définitive d'une fiche, réservée à un administrateur (contrat 31) : 401 sans session,
 * 403 pour un membre, 404 type ou fiche inconnus, 409 avec la liste de ce qui la retient. Cacher la
 * commande n'est jamais la protection : la route refuse de son côté.
 */
export const DELETE = withApi(async (request: Request, { params }: Context) => {
  await requireAdmin(request);
  const { type, id } = await params;
  await deleteRecord(type, id);
  return NextResponse.json({ ok: true });
});
