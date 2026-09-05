import { ObjectList } from "@/features/objects/object-list";

export const dynamic = "force-dynamic";

/** Liste des entreprises : tout vient du registre d'objets (D4). */
export default function Page() {
  return <ObjectList type="company" />;
}
