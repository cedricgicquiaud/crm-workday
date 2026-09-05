import { NextResponse } from "next/server";
import { getCompany } from "@/features/companies/companies";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Une entreprise par son identifiant ; 404 si elle n'existe pas. */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { id } = await params;
  return NextResponse.json(await getCompany(id));
});
