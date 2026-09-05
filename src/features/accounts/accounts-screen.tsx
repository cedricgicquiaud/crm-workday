"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Role } from "@/features/auth/accounts";
import { AccountActions, type Outcome } from "./account-actions";
import type { AccountStatus } from "./accounts";
import { InviteDialog } from "./invite-dialog";
import { fullName, ROLE_LABELS } from "./labels";
import { StatusBadge } from "./status-badge";

export type AccountRow = { id: string; email: string; firstName: string; lastName: string; role: Role; status: AccountStatus };

type Props = { accounts: AccountRow[] };

const isActiveAdmin = (a: AccountRow) => a.role === "administrateur" && a.status === "actif";

/** Écran Paramètres → Comptes : liste dense (ligne 32 px, pas de zébrage), un compte par ligne. */
export function AccountsScreen({ accounts }: Props) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const activeAdminCount = accounts.filter(isActiveAdmin).length;

  /** Après chaque action, la liste est relue côté serveur et le résultat annoncé. */
  function done(next: Outcome) {
    setOutcome(next);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-medium">Comptes</h2>
          <p className="text-sm text-muted-foreground">{accounts.length === 1 ? "1 compte" : `${accounts.length} comptes`}</p>
        </div>
        <InviteDialog
          onInvited={(email) => done({ kind: "status", text: `Invitation envoyée à ${email}.` })}
          onReactivated={(name) => done({ kind: "status", text: `Compte de ${name} réactivé.` })}
        />
      </div>
      {outcome?.kind === "status" && (
        <p role="status" className="text-sm">
          {outcome.text}
        </p>
      )}
      {outcome?.kind === "alert" && (
        <Alert variant="destructive">
          <AlertDescription>{outcome.text}</AlertDescription>
        </Alert>
      )}
      <Table aria-label="Comptes">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-7">Nom</TableHead>
            <TableHead className="h-7">Email</TableHead>
            <TableHead className="h-7">Rôle</TableHead>
            <TableHead className="h-7">État</TableHead>
            <TableHead className="h-7 w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id} className="h-8">
              <TableCell className="py-1 font-medium">{fullName(account)}</TableCell>
              <TableCell className="py-1 text-muted-foreground">{account.email}</TableCell>
              <TableCell className="py-1">{ROLE_LABELS[account.role]}</TableCell>
              <TableCell className="py-1">
                <StatusBadge status={account.status} />
              </TableCell>
              <TableCell className="py-0 text-right">
                <AccountActions account={account} activeAdminCount={activeAdminCount} onDone={done} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
