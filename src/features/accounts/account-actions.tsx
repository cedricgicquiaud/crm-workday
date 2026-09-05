"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Account } from "./accounts";
import { accountActions, type AccountAction } from "./actions";
import { callApi } from "./api-client";
import { fullName, ROLE_LABELS } from "./labels";

export type Outcome = { kind: "status" | "alert"; text: string };

type Props = { account: Account; activeAdminCount: number; onDone: (outcome: Outcome) => void };

/** Actions d'une ligne, groupées dans un menu (liste dense) ; la liste vient de `accountActions`. */
export function AccountActions({ account, activeAdminCount, onDone }: Props) {
  const accountPath = `/api/accounts/${encodeURIComponent(account.id)}`;
  const name = fullName(account);

  /** L'appel de chaque action et la phrase annoncée quand il réussit. */
  function perform(action: AccountAction): { call: ReturnType<typeof callApi>; success: string } {
    switch (action.id) {
      case "renvoyer":
        return { call: callApi("/api/invitations/renvoyer", { method: "POST", body: { email: account.email } }), success: `Invitation renvoyée à ${account.email}.` };
      case "changer-role":
        return { call: callApi(accountPath, { method: "PATCH", body: { role: action.role } }), success: `${name} est maintenant ${ROLE_LABELS[action.role].toLowerCase()}.` };
      case "fermer-sessions":
        return { call: callApi(`${accountPath}/sessions`, { method: "DELETE" }), success: `Sessions de ${name} fermées : il devra se reconnecter.` };
      case "desactiver":
        return { call: callApi(accountPath, { method: "PATCH", body: { status: "desactive" } }), success: `Compte de ${name} désactivé.` };
      case "reactiver":
        return { call: callApi(accountPath, { method: "PATCH", body: { status: "actif" } }), success: `Compte de ${name} réactivé.` };
    }
  }

  async function run(action: AccountAction) {
    const { call, success } = perform(action);
    const result = await call;
    onDone(result.ok ? { kind: "status", text: success } : { kind: "alert", text: result.failure.message });
  }

  const actions = accountActions(account, { activeAdminCount });
  const finalIndex = actions.findIndex((a) => a.id === "desactiver" || a.id === "reactiver");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      {/* Assez large pour que « Passer administrateur » et « Fermer toutes les sessions » tiennent sur une ligne. */}
      <DropdownMenuContent align="end" className="min-w-56">
        {actions.map((action, index) => (
          <Fragment key={action.id}>
            {index === finalIndex && index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={action.destructive ? "destructive" : "default"}
              disabled={Boolean(action.disabledReason)}
              onClick={() => run(action)}
              className="flex-col items-start gap-0"
            >
              {action.label}
              {action.disabledReason && <span className="text-xs text-muted-foreground">{action.disabledReason}</span>}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
