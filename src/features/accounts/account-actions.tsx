"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AccountRow } from "./accounts-screen";
import { callApi } from "./api-client";

export type Outcome = { kind: "status" | "alert"; text: string };

type Props = { account: AccountRow; onDone: (outcome: Outcome) => void };

/** Actions d'une ligne, groupées dans un menu (liste dense). */
export function AccountActions({ account, onDone }: Props) {
  async function resend() {
    const result = await callApi("/api/invitations/renvoyer", { method: "POST", body: { email: account.email } });
    onDone(result.ok ? { kind: "status", text: `Invitation renvoyée à ${account.email}.` } : { kind: "alert", text: result.failure.message });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {account.status === "invite" && <DropdownMenuItem onClick={resend}>Renvoyer l&apos;invitation</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
