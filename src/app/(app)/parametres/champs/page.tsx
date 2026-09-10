import "@/features/objects/manifest.server";
import { listDefinitions } from "@/features/custom-fields/definitions";
import { DefinitionsScreen } from "@/features/custom-fields/definitions-screen";
import { listObjects } from "@/features/objects/registry";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Champs personnalisés, réservés aux administrateurs : un membre est renvoyé vers Accueil (contrat 20). */
export default async function Page() {
  await requireAdmin();
  const objects = listObjects().map((object) => ({ key: object.key, label: object.labels.plural }));
  return <DefinitionsScreen objects={objects} fields={await listDefinitions()} />;
}
