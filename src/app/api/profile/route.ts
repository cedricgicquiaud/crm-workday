import { NextResponse } from "next/server";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Identité de la personne connectée, pour la page « Mon profil » (D13). */
export const GET = withApi(async (request) => {
  const { user } = await requireSession(request);
  return NextResponse.json({ firstName: user.firstName, lastName: user.lastName, email: user.email });
});
