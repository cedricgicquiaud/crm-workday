/**
 * Actions possibles sur une ligne de compte, calculées hors interface : le menu les affiche,
 * l'API les revérifie. Le dernier administrateur actif ne peut être ni désactivé ni passé
 * membre : le bouton est inactif, et l'appel serveur répondrait 409 (D12, contrat 17).
 */
import type { Role } from "@/features/auth/accounts";
import type { AccountStatus } from "./accounts";
import { ROLE_LABELS } from "./labels";

type ActionBase = {
  label: string;
  /** présent = bouton inactif, avec la raison affichée */
  disabledReason?: string;
  destructive?: boolean;
};

export type AccountAction = ActionBase &
  ({ id: "renvoyer" | "fermer-sessions" | "desactiver" | "reactiver" } | { id: "changer-role"; /** rôle visé */ role: Role });

export const LAST_ADMIN_REASON = "Dernier administrateur actif";

export function accountActions(account: { role: Role; status: AccountStatus }, context: { activeAdminCount: number }): AccountAction[] {
  const isLastActiveAdmin = account.role === "administrateur" && account.status === "actif" && context.activeAdminCount <= 1;
  const protectedReason = isLastActiveAdmin ? LAST_ADMIN_REASON : undefined;
  const otherRole: Role = account.role === "administrateur" ? "membre" : "administrateur";
  const actions: AccountAction[] = [];
  if (account.status === "invite") actions.push({ id: "renvoyer", label: "Renvoyer l'invitation" });
  actions.push({ id: "changer-role", label: `Passer ${ROLE_LABELS[otherRole].toLowerCase()}`, role: otherRole, disabledReason: otherRole === "membre" ? protectedReason : undefined });
  if (account.status !== "desactive") actions.push({ id: "fermer-sessions", label: "Fermer toutes les sessions" });
  if (account.status === "desactive") actions.push({ id: "reactiver", label: "Réactiver" });
  else actions.push({ id: "desactiver", label: "Désactiver", destructive: true, disabledReason: protectedReason });
  return actions;
}
