import { ObjectSheet } from "@/features/objects/object-sheet";

export const dynamic = "force-dynamic";

/** Fiche d'une entreprise : tout vient du registre d'objets (D4). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ObjectSheet type="company" id={id} />;
}
