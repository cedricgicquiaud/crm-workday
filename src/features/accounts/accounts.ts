/**
 * Gestion des comptes par un administrateur (D11, D12) : liste avec état invité / actif /
 * désactivé. Un compte se désactive, ne se supprime jamais.
 */
import { asc, eq } from "drizzle-orm";
import { session, user } from "@/db/schema";
import { createInvitation, type NewInvitation } from "@/features/auth/invitations";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type AccountStatus = "invite" | "actif" | "desactive";

export type Account = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: AccountStatus;
  createdAt: Date;
};

export async function listAccounts(): Promise<Account[]> {
  const rows = await db
    .select({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status, createdAt: user.createdAt })
    .from(user)
    .orderBy(asc(user.lastName), asc(user.firstName), asc(user.email));
  return rows.map((row) => ({ ...row, status: row.status as AccountStatus }));
}

const STATUS_LABELS: Record<AccountStatus, string> = { invite: "invité", actif: "actif", desactive: "désactivé" };

/**
 * Invitation depuis l'écran des comptes. Un email déjà pris est refusé en nommant le compte ;
 * s'il est désactivé, la réponse porte son identifiant pour proposer la réactivation (D12).
 */
export async function inviteAccount(input: NewInvitation): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: user.id, firstName: user.firstName, lastName: user.lastName, status: user.status })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) {
    const status = existing.status as AccountStatus;
    const name = `${existing.firstName} ${existing.lastName}`.trim();
    throw new HttpError(409, "email_deja_utilise", `Un compte existe déjà pour ${email} : ${name} (${STATUS_LABELS[status]}).`, {
      status,
      accountId: existing.id,
    });
  }
  return createInvitation({ ...input, email });
}

async function findAccount(id: string) {
  const [row] = await db.select({ id: user.id, role: user.role, status: user.status }).from(user).where(eq(user.id, id)).limit(1);
  if (!row) throw new HttpError(404, "compte_introuvable", "Ce compte n'existe pas.");
  return row;
}

/** Ferme toutes les sessions d'un compte : il devra se reconnecter sur chacun de ses navigateurs (D10). */
export async function revokeAccountSessions(id: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, id));
}

/** Un compte désactivé ne se connecte plus et ses sessions sont fermées ; ce qu'il a créé reste à son nom (D12). */
export async function deactivateAccount(id: string): Promise<void> {
  await findAccount(id);
  await db.update(user).set({ status: "desactive", updatedAt: new Date() }).where(eq(user.id, id));
  await revokeAccountSessions(id);
}
