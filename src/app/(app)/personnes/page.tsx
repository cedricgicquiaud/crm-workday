import { ObjectList } from "@/features/objects/object-list";

export const dynamic = "force-dynamic";

/** Liste des personnes : tout vient du registre d'objets (D4) ; la colonne Profils est le champ dérivé. */
export default function Page() {
  return <ObjectList type="person" />;
}
