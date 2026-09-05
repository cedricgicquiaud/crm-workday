/**
 * Gestion des comptes par un administrateur (D11, D12) : liste avec état invité / actif /
 * désactivé. Un compte se désactive, ne se supprime jamais.
 */
import { asc, eq } from "drizzle-orm";
import { user } from "@/db/schema";
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
