import { NextResponse } from "next/server";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Recherche transverse pour la palette Cmd+K (D8) : session requise. */
export const GET = withApi(async (request) => {
  await requireSession(request);
  return NextResponse.json({ results: [] });
});
