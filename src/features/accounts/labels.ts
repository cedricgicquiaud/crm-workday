/** Libellés d'interface des comptes (D2 : une seule langue, en français). */
import type { Role } from "@/features/auth/accounts";
import type { AccountStatus } from "./accounts";

export const ROLE_LABELS: Record<Role, string> = { administrateur: "Administrateur", membre: "Membre" };

export const STATUS_LABELS: Record<AccountStatus, string> = { invite: "Invité", actif: "Actif", desactive: "Désactivé" };

export function fullName(account: { firstName: string; lastName: string }): string {
  return `${account.firstName} ${account.lastName}`.trim();
}
