import { NextResponse } from "next/server";
import { z } from "zod";
import { mergeRecords, planMerge } from "@/features/merge/merge";
import { serializeRecord } from "@/features/objects/service";
import { HttpError, requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string }> };

const pairSchema = z.object({
  keptId: z.string().trim().min(1),
  absorbedId: z.string().trim().min(1),
  /** type annoncé pour l'absorbée ; absent, c'est celui de l'adresse */
  absorbedType: z.string().trim().min(1).optional(),
  /** clés des champs dont la valeur est prise à l'absorbée plutôt qu'à la conservée (D20) */
  take: z.array(z.string()).optional(),
});

/**
 * Les deux fiches d'une fusion, telles que l'appel les annonce. Deux fiches de types différents ne
 * se fusionnent pas (contrat 32) : le refus est ici, seul endroit qui connaisse les deux types
 * annoncés. Le reste — même fiche, fiche inconnue, fiche archivée — est vérifié par le mécanisme.
 */
function pairOf(type: string, input: unknown): { keptId: string; absorbedId: string; take: string[] } {
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "donnees_invalides", "La fiche conservée et la fiche absorbée sont attendues.");
  const { keptId, absorbedId, absorbedType, take } = parsed.data;
  if (absorbedType && absorbedType !== type) throw new HttpError(400, "types_differents", "Deux fiches de types différents ne se fusionnent pas.");
  return { keptId, absorbedId, take: take ?? [] };
}

/**
 * Ce qu'une fusion déplacerait, avant de la faire (contrat 29) : le dialogue de confirmation annonce
 * ce compte. Réservé à un administrateur, comme la fusion elle-même. 400 appel incomplet, 404 type
 * ou fiche inconnus, 409 fiche archivée.
 */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireAdmin(request);
  const { type } = await params;
  const { keptId, absorbedId } = pairOf(type, Object.fromEntries(new URL(request.url).searchParams.entries()));
  return NextResponse.json(await planMerge(type, keptId, absorbedId));
});

/**
 * Fusionne deux fiches (D20, contrat 29), réservé à un administrateur (contrat 31) : 401 sans
 * session, 403 pour un membre, 400 même fiche ou types différents (contrat 32), 404 type ou fiche
 * inconnus, 409 fiche archivée. Cacher la commande n'est jamais la protection : la route refuse de
 * son côté. La réponse est la fiche conservée, telle qu'elle est après la fusion.
 */
export const POST = withApi(async (request: Request, { params }: Context) => {
  await requireAdmin(request);
  const { type } = await params;
  const { keptId, absorbedId, take } = pairOf(type, await request.json().catch(() => null));
  return NextResponse.json(serializeRecord(await mergeRecords(type, keptId, absorbedId, take)));
});
