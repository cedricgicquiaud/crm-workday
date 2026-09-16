import { ObjectSheet } from "@/features/objects/object-sheet";

export const dynamic = "force-dynamic";

/** Fiche d'un lead : tout vient du registre d'objets (D4, D9), gestes « Écarter » et « Rouvrir » compris. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ObjectSheet type="lead" id={id} />;
}
