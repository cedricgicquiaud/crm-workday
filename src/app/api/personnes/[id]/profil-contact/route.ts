import { NextResponse } from "next/server";
import { getContactProfile, upsertContactProfile } from "@/features/persons/contact-profile";
import { getObjectRecord } from "@/features/objects/service";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Le profil contact d'une personne, ou `null` si elle n'en a pas ; 404 personne inconnue. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  await getObjectRecord("person", id);
  return NextResponse.json(await getContactProfile(id));
});

/** Ajoute (entreprise obligatoire) ou modifie le profil contact : 400 données invalides, 404 personne inconnue, 409 entreprise ou personne archivée. */
export const PATCH = withApi(async (request: Request, { params }: Context) => {
  const { user: actor } = await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await upsertContactProfile(id, await request.json().catch(() => null), { id: actor.id }));
});
