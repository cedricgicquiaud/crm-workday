import Link from "next/link";
import "@/features/objects/manifest.server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fieldsOf } from "@/features/objects/fields";
import { displayValue, formatDate } from "@/features/objects/labels";
import { getObject } from "@/features/objects/registry";
import { listObjectRecords, listUserOptions } from "@/features/objects/service";
import { QuickCreateDialog } from "@/features/objects/quick-create-dialog";
import { requireSession } from "@/lib/auth/session";

/**
 * Liste dense d'un objet (D6, 2.1a : minimale) : titre `<h1>`, un seul bouton plein (la création),
 * tableau à largeur fixe trié par dernière modification, pied avec compteur. À 375 px les colonnes
 * secondaires disparaissent ; la mise en cartes complète est la livraison 2.5a.
 */
export async function ObjectList({ type }: { type: string }) {
  const [{ user }, records, users] = await Promise.all([requireSession(), listObjectRecords(type), listUserOptions()]);
  const definition = getObject(type);
  const fields = fieldsOf(type);
  const title = fields.find((f) => f.key === definition.titleField)!;
  const columns = (definition.listColumns ?? []).map((key) => fields.find((f) => f.key === key)!);
  const count = records.length;
  return (
    <div className="grid gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{definition.labels.plural}</h1>
        <QuickCreateDialog type={type} users={users} currentUserId={user.id} />
      </header>
      {count === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{`Aucune fiche pour l'instant. Créez la première avec « ${definition.labels.singular} ».`}</p>
      ) : (
        <Table aria-label={definition.labels.plural} className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-7">{title.label}</TableHead>
              {columns.map((column) => (
                <TableHead key={column.key} className="hidden h-7 w-[18%] md:table-cell">
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="h-7 w-28 text-right">Modifiée le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => {
              const label = displayValue(title, record[title.key], users);
              return (
                <TableRow key={record.id} className="h-8">
                  <TableCell className="truncate py-1 font-medium" title={label}>
                    <Link href={definition.href(record.id)} className="hover:underline focus-visible:rounded-sm">
                      {label}
                    </Link>
                  </TableCell>
                  {columns.map((column) => {
                    const value = displayValue(column, record[column.key], users);
                    return (
                      <TableCell key={column.key} className="hidden truncate py-1 text-muted-foreground md:table-cell" title={value}>
                        {value}
                      </TableCell>
                    );
                  })}
                  <TableCell className="py-1 text-right tabular-nums text-muted-foreground">{formatDate(record.updatedAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="text-sm text-muted-foreground">{count === 1 ? `1 ${definition.labels.singular.toLowerCase()}` : `${count} ${definition.labels.plural.toLowerCase()}`}</p>
    </div>
  );
}
