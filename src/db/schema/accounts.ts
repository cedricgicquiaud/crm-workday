/**
 * Domaine « comptes » : invitations, tentatives de connexion (livraison 1.2a).
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

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

/** Lien d'invitation : jeton haché, 72 heures, usage unique ; renvoyer en génère un neuf (D7). */
export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** administrateur à l'origine de l'invitation */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitation_user_id_idx").on(t.userId)],
);
