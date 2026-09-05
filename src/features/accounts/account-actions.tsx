"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AccountRow } from "./accounts-screen";
import { callApi } from "./api-client";
import { fullName } from "./labels";

export type Outcome = { kind: "status" | "alert"; text: string };

type Props = { account: AccountRow; onDone: (outcome: Outcome) => void };

/** Actions d'une ligne, groupées dans un menu (liste dense). */
export function AccountActions({ account, onDone }: Props) {
  /** Lance l'appel et annonce le résultat : la phrase de succès, ou le message d'erreur du serveur. */
  async function run(call: Promise<Awaited<ReturnType<typeof callApi>>>, success: string) {
    const result = await call;
    onDone(result.ok ? { kind: "status", text: success } : { kind: "alert", text: result.failure.message });
  }

  const accountPath = `/api/accounts/${encodeURIComponent(account.id)}`;
  const name = fullName(account);
  const resend = () => run(callApi("/api/invitations/renvoyer", { method: "POST", body: { email: account.email } }), `Invitation renvoyée à ${account.email}.`);
  const deactivate = () => run(callApi(accountPath, { method: "PATCH", body: { status: "desactive" } }), `Compte de ${name} désactivé.`);
  const reactivate = () => run(callApi(accountPath, { method: "PATCH", body: { status: "actif" } }), `Compte de ${name} réactivé.`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {account.status === "invite" && <DropdownMenuItem onClick={resend}>Renvoyer l&apos;invitation</DropdownMenuItem>}
        {account.status === "desactive" ? (
          <DropdownMenuItem onClick={reactivate}>Réactiver</DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onClick={deactivate}>
            Désactiver
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
