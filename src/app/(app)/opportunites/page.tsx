import { ObjectList, type ListQuery } from "@/features/objects/object-list";

export const dynamic = "force-dynamic";

/** Liste des opportunités : tout vient du registre d'objets (D37), son état de l'URL. */
export default async function Page({ searchParams }: { searchParams: Promise<ListQuery> }) {
  return <ObjectList type="opportunity" query={await searchParams} />;
}
