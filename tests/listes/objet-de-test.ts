/**
 * Objet de test des listes (D4) : un champ par type, déclaré auprès du registre comme le ferait
 * n'importe quel objet, sans toucher aux fichiers des mécanismes. Les tests de filtres, de tri et
 * d'URL travaillent sur lui : ils ne dépendent ni de l'entreprise ni de la personne.
 */
import { CircleDashedIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";

export const TEST_TYPE = "test_liste";

export function registerTestObject(): void {
  registerObject({
    key: TEST_TYPE,
    order: 950,
    labels: { singular: "Fiche de test", plural: "Fiches de test", article: "une" },
    icon: CircleDashedIcon,
    href: (id) => `/fiches-de-test/${id}`,
    listHref: "/fiches-de-test",
    apiBase: "/api/fiches-de-test",
    titleField: "name",
    fields: [
      { key: "name", label: "Nom", type: "text", required: true, sortable: true, order: 10 },
      { key: "kind", label: "Genre", type: "list", values: [{ value: "client", label: "Client" }, { value: "prospect", label: "Prospect" }], sortable: true, order: 20 },
      { key: "city", label: "Ville", type: "text", sortable: true, order: 30 },
      { key: "signedOn", label: "Signée le", type: "date", order: 40 },
      { key: "amount", label: "Montant", type: "number", order: 50 },
      { key: "ownerId", label: "Responsable", type: "user", order: 60 },
    ],
    relations: [],
    listColumns: ["kind", "city"],
  });
}
