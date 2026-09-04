/**
 * Domaine « comptes » : invitations, tentatives de connexion (livraison 1.2a).
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Un échec de connexion par ligne ; cinq en 15 minutes sur une adresse la verrouillent (D14). */
export const loginAttempt = pgTable(
  "login_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** adresse tentée, en minuscules, connue ou non */
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempt_email_created_at_idx").on(t.email, t.createdAt)],
);
