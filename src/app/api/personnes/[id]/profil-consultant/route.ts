import { NextResponse } from "next/server";
import { getConsultantProfile, refuseProfileRemoval, upsertConsultantProfile } from "@/features/consultants/consultant-profile";
import { getObjectRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Le profil consultant d'une personne, ou `null` si elle n'en a pas ; 404 personne inconnue. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  await getObjectRecord("person", id);
  return NextResponse.json(await getConsultantProfile(id));
});

/** Ajoute le profil (au premier statut) ou le modifie : 400 données invalides, 404 personne inconnue, 409 personne ou société archivée. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await upsertConsultantProfile(id, await request.json().catch(() => null), { id: actor.id }));
});

/** Un profil consultant ne se retire pas en V1 (D1) : 405, la personne le garde jusqu'à sa suppression. */
export const DELETE = withApi(async (request: Request) => {
  await requireSession(request);
  return refuseProfileRemoval();
});
