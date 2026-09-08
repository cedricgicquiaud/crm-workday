import { ObjectList, type ListQuery } from "@/features/objects/object-list";

export const dynamic = "force-dynamic";

/** Liste des entreprises : tout vient du registre d'objets (D4), son état de l'URL (D18). */
export default async function Page({ searchParams }: { searchParams: Promise<ListQuery> }) {
  return <ObjectList type="company" query={await searchParams} />;
}
