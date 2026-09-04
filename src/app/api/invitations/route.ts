import { NextResponse } from "next/server";
import { requireAdmin, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Création d'une invitation par un administrateur (D7). */
export const POST = withApi(async (request) => {
  await requireAdmin(request);
  return NextResponse.json({ error: "non_implemente" }, { status: 501 });
});
