/**
 * Gestion des comptes par un administrateur (D11, D12) : liste avec état invité / actif /
 * désactivé. Un compte se désactive, ne se supprime jamais.
 */
import { asc } from "drizzle-orm";
import { user } from "@/db/schema";
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
