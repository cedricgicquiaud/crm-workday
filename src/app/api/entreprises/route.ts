import { NextResponse } from "next/server";
import { createCompany } from "@/features/companies/companies";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Création d'une entreprise, ouverte à tout membre (D11) : 201 avec l'identifiant, 400 données invalides, 409 SIREN déjà porté. */
export const POST = withApi(async (request) => {
  const { user: actor } = await requireSession(request);
  const record = await createCompany(await request.json().catch(() => null), { id: actor.id });
  return NextResponse.json({ id: record.id }, { status: 201 });
});
