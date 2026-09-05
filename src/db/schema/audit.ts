/**
 * Historique des changements (D12), commun à tout objet : une ligne par champ modifié, avec
 * l'ancienne et la nouvelle valeur, l'auteur et la date. Création, archivage, restauration et
 * fusion y figurent aussi (`action`). Jamais modifié ni supprimé.
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** clé d'objet du registre (`company`, `person`…) */
    objectType: text("object_type").notNull(),
    objectId: uuid("object_id").notNull(),
    /** creee | modifiee | archivee | restauree | fusionnee */
    action: text("action").notNull(),
    /** clé du champ modifié ; nulle pour une création ou un archivage */
    field: text("field"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    /** utilisateur à l'origine du changement ; nul pour une écriture du système (fusion, D11) */
    authorId: text("author_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_object_idx").on(t.objectType, t.objectId, t.createdAt)],
);
