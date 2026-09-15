import { ObjectSheet } from "@/features/objects/object-sheet";

export const dynamic = "force-dynamic";

/** Fiche d'une personne : tout vient du registre d'objets (D4), badge de tête et sections comprises (D20). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ObjectSheet type="person" id={id} />;
}
