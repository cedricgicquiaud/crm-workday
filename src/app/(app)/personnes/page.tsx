import { ObjectList, type ListQuery } from "@/features/objects/object-list";

export const dynamic = "force-dynamic";

/** Liste des personnes : tout vient du registre d'objets (D4), son état de l'URL (D18) ; la colonne Profils est le champ dérivé. */
export default async function Page({ searchParams }: { searchParams: Promise<ListQuery> }) {
  return <ObjectList type="person" query={await searchParams} />;
}
