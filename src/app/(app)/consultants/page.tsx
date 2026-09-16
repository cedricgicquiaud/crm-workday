import { ObjectList, type ListQuery } from "@/features/objects/object-list";

export const dynamic = "force-dynamic";

/** Liste « Consultants » : une liste déclarée au registre (D10), lue par le mécanisme commun ; son état vient de l'URL (D18). */
export default async function Page({ searchParams }: { searchParams: Promise<ListQuery> }) {
  return <ObjectList type="consultants" query={await searchParams} />;
}
