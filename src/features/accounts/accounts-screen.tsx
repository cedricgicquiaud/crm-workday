"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Role } from "@/features/auth/accounts";
import type { AccountStatus } from "./accounts";
import { fullName, ROLE_LABELS } from "./labels";
import { StatusBadge } from "./status-badge";

export type AccountRow = { id: string; email: string; firstName: string; lastName: string; role: Role; status: AccountStatus };

type Props = { accounts: AccountRow[] };

/** Écran Paramètres → Comptes : liste dense (ligne 32 px, pas de zébrage), un compte par ligne. */
export function AccountsScreen({ accounts }: Props) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">Comptes</h2>
        <p className="text-sm text-muted-foreground">{accounts.length === 1 ? "1 compte" : `${accounts.length} comptes`}</p>
      </div>
      <Table aria-label="Comptes">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-7">Nom</TableHead>
            <TableHead className="h-7">Email</TableHead>
            <TableHead className="h-7">Rôle</TableHead>
            <TableHead className="h-7">État</TableHead>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
