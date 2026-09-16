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
      /* La clé « zzz » porte le libellé « Alerte » : le tri sur la valeur affichée se distingue du tri sur la clé enregistrée. */
      { key: "kind", label: "Genre", type: "list", values: [{ value: "client", label: "Client" }, { value: "prospect", label: "Prospect" }, { value: "zzz", label: "Alerte" }], sortable: true, order: 20 },
      { key: "city", label: "Ville", type: "text", sortable: true, order: 30 },
      { key: "signedOn", label: "Signée le", type: "date", order: 40 },
      { key: "amount", label: "Montant", type: "number", order: 50 },
      { key: "ownerId", label: "Responsable", type: "user", sortable: true, order: 60 },
      /* Champ à plusieurs valeurs (D19) : « Alerte » porte la clé « zzz » ici aussi, et « Ancien » est une valeur retirée. */
      {
        key: "tags",
        label: "Étiquettes",
        type: "multilist",
        values: [{ value: "client", label: "Client" }, { value: "client_final", label: "Client final" }, { value: "vip", label: "VIP" }, { value: "zzz", label: "Alerte" }],
        retiredValues: [{ value: "ancien", label: "Ancien" }],
        emptyLabel: "Aucune",
        sortable: true,
        order: 70,
      },
      /*
       * Champ dérivé (D19) : jamais saisi, rendu depuis la fiche entière et trié sur un rang. « Zèbre » se
       * range avant « Abeille » : un tri sur le libellé se distingue d'un tri sur le rang déclaré.
       */
      {
        key: "phase",
        label: "Phase",
        type: "list",
        values: [{ value: "ouverte", label: "Zèbre" }, { value: "close", label: "Abeille" }],
        editable: false,
        sortable: true,
        display: (record) => `${record.phase === "ouverte" ? "Zèbre" : "Abeille"} · ${String(record.city ?? "")}`,
        sortKey: (record) => (record.phase === "ouverte" ? "0" : record.phase === "close" ? "1" : null),
        order: 80,
      },
      /* Un rang déclaré sans `sortable` : la liste ne trie pas dessus (CRM-86). */
      { key: "rank", label: "Rang", type: "text", editable: false, sortKey: (record) => String(record.rank ?? ""), order: 90 },
    ],
    relations: [],
    listColumns: ["kind", "city"],
  });
}
