/**
 * Gestion des comptes par un administrateur (D11, D12) : liste avec état invité / actif /
 * désactivé. Un compte se désactive, ne se supprime jamais.
 */
import { and, asc, count, eq } from "drizzle-orm";
import { session, user } from "@/db/schema";
import type { Role } from "@/features/auth/accounts";
import { createInvitation, type NewInvitation } from "@/features/auth/invitations";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fullName, STATUS_LABELS } from "./labels";

export type AccountStatus = "invite" | "actif" | "desactive";

export type Account = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: AccountStatus;
};

/** Tous les comptes, par nom : l'écran des comptes les affiche tels quels. */
export async function listAccounts(): Promise<Account[]> {
  const rows = await db
    .select({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status })
    .from(user)
    .orderBy(asc(user.lastName), asc(user.firstName), asc(user.email));
  return rows.map((row) => ({ ...row, role: row.role as Role, status: row.status as AccountStatus }));
}

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
    const name = fullName(existing);
    throw new HttpError(409, "email_deja_utilise", `Un compte existe déjà pour ${email} : ${name} (${STATUS_LABELS[status].toLowerCase()}).`, {
      status,
      accountId: existing.id,
      name,
    });
  }
  return createInvitation({ ...input, email });
}

async function findAccount(id: string) {
  const [row] = await db.select({ id: user.id, role: user.role, status: user.status }).from(user).where(eq(user.id, id)).limit(1);
  if (!row) throw new HttpError(404, "compte_introuvable", "Ce compte n'existe pas.");
  return row;
}

/** Nombre d'administrateurs actifs : le dernier ne peut être ni désactivé ni rétrogradé (D12). */
async function countActiveAdmins(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user).where(and(eq(user.role, "administrateur"), eq(user.status, "actif")));
  return row?.n ?? 0;
}

async function refuseIfLastActiveAdmin(account: { role: string; status: string }) {
  if (account.role === "administrateur" && account.status === "actif" && (await countActiveAdmins()) <= 1) {
    throw new HttpError(409, "dernier_administrateur", "Le dernier administrateur actif ne peut être ni désactivé ni passé membre.");
  }
}

/** Ferme toutes les sessions d'un compte : il devra se reconnecter sur chacun de ses navigateurs (D10). */
export async function revokeAccountSessions(id: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, id));
}

/** Un compte désactivé ne se connecte plus et ses sessions sont fermées ; ce qu'il a créé reste à son nom (D12). */
export async function deactivateAccount(id: string): Promise<void> {
  await refuseIfLastActiveAdmin(await findAccount(id));
  await db.update(user).set({ status: "desactive", updatedAt: new Date() }).where(eq(user.id, id));
  await revokeAccountSessions(id);
}

/** Un administrateur réactive un compte désactivé ; le mot de passe reste le même (D12). */
export async function reactivateAccount(id: string): Promise<void> {
  const account = await findAccount(id);
  if (account.status !== "desactive") throw new HttpError(409, "compte_non_desactive", "Ce compte n'est pas désactivé.");
  await db.update(user).set({ status: "actif", updatedAt: new Date() }).where(eq(user.id, id));
}

/** Deux rôles, tout le monde voit tout : administrateur ou membre (D11). */
export async function setAccountRole(id: string, role: Role): Promise<void> {
  const account = await findAccount(id);
  if (role === "membre") await refuseIfLastActiveAdmin(account);
  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, id));
}
