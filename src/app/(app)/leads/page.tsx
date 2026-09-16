import { ObjectList, type ListQuery } from "@/features/objects/object-list";

export const dynamic = "force-dynamic";

/** Liste des leads : tout vient du registre d'objets (D4), sa vue par défaut « Leads en cours » (D10), son état de l'URL (D18). */
export default async function Page({ searchParams }: { searchParams: Promise<ListQuery> }) {
  return <ObjectList type="lead" query={await searchParams} />;
}
