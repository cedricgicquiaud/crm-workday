/**
 * Domaine « Doublons et fusion » (D20, livraison 2.6a). Une fusion fait disparaître la fiche
 * absorbée : `object_redirect` garde la trace de l'endroit où elle est passée, pour que son adresse
 * et les références qui la citent encore mènent à la fiche conservée plutôt qu'à un 404.
 * `object_type` est la clé d'objet du registre (`company`, `person`…) : la fiche d'origine
 * n'existant plus, aucune clé étrangère ne peut la désigner.
 */
import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const objectRedirect = pgTable(
  "object_redirect",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** clé d'objet du registre (`company`, `person`…) */
    objectType: text("object_type").notNull(),
    /** fiche absorbée, qui n'existe plus */
    fromId: uuid("from_id").notNull(),
    /** fiche conservée, vers laquelle mènent désormais l'adresse et les références */
    toId: uuid("to_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("object_redirect_from_uq").on(t.objectType, t.fromId), index("object_redirect_to_idx").on(t.objectType, t.toId)],
);
