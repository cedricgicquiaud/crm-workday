import { NextResponse } from "next/server";
import { getCommit, getVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Route de santé : version de package.json et commit court réels (contrat 2). */
export function GET() {
  return NextResponse.json({ status: "ok", version: getVersion(), commit: getCommit() });
}
