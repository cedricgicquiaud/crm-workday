import { NextResponse } from "next/server";
import { listForState } from "@/features/lists/apply-filters";
import { getServerObject } from "@/features/objects/registry.server";
import { listObjectRecords, listUserOptions, serializeRecord } from "@/features/objects/service";
import { listStateWithView } from "@/features/views/views";
import { requireSession, withApi } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string }> };

/**
 * Liste d'un objet dans l'état porté par son URL (D18) : filtres, tri, colonnes visibles et
 * bascule « archivées ». Route générique : elle ne connaît que la clé d'objet du registre (D4), et
 * lit l'état avec le même module que l'écran, vue sauvegardée comprise (2.5b) — une adresse
 * partagée et un appel rendent la même liste. Un filtre inapplicable est rendu dans `inactive`, et
 * une vue disparue est ignorée, jamais en erreur. 404 si le type est inconnu (D24).
 */
export const GET = withApi(async (request: Request, { params }: Context) => {
  await requireSession(request);
  const { type } = await params;
  /* Le registre serveur d'abord : une clé inconnue est une ressource inexistante (404), pas une panne. */
  getServerObject(type);
  const state = await listStateWithView(type, new URL(request.url).searchParams);
  const [records, users] = await Promise.all([listObjectRecords(type, { includeArchived: state.includeArchived }), listUserOptions()]);
  const shown = listForState(type, records, state, users);
  return NextResponse.json({ records: shown.map(serializeRecord), count: shown.length, columns: state.columns, sort: state.sort, view: state.view, filters: state.filters, inactive: state.inactive });
});
