/**
 * Part serveur de la déclaration du lead : sa table Drizzle, sa recherche, sa clé de doublon et ses
 * gestes d'en-tête (« Écarter », « Rouvrir », D7). Importé par le manifeste serveur.
 */
import { createElement } from "react";
import { lead } from "@/db/schema";
import { registerServerObject } from "@/features/objects/registry.server";
import { LeadStageAction } from "./lead-actions";
import { DISCARDED_STAGE, OPEN_STAGES } from "./schema";

registerServerObject({
  key: "lead",
  table: lead,
  search: async () => [],
  /* Pas de « doublon probable » sur les leads (D8) : deux leads homonymes sont deux pistes. */
  duplicateKey: () => null,
  /* « Écarter » depuis un avancement en cours ; « Rouvrir » seul sur un lead écarté (D7). */
  actions: [
    { key: "ecarter", order: 10, visible: (record) => OPEN_STAGES.includes(String(record.stage)), render: ({ id }) => createElement(LeadStageAction, { id, gesture: "ecarter" }) },
    { key: "rouvrir", order: 20, visible: (record) => record.stage === DISCARDED_STAGE, render: ({ id }) => createElement(LeadStageAction, { id, gesture: "rouvrir" }) },
  ],
});
