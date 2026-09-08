"use client";

import { ArrowDownIcon, ArrowUpIcon, Columns3Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import "@/features/objects/manifest";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { columnsOf } from "@/features/lists/columns";
import { listUrl, type ListState } from "@/features/lists/url-state";
import { getObject } from "@/features/objects/registry";

/**
 * Choix des colonnes d'une liste (D6) : celles qu'on voit et leur ordre, « Modifiée le » comprise.
 * La première colonne — le champ titre — n'est pas proposée : elle porte le lien vers la fiche et
 * ne se masque pas ; toute autre colonne affichée se retrouve ici, sans exception muette. Chaque
 * changement pousse une nouvelle URL, comme les filtres : l'état de la liste vit dans l'adresse.
 */
export function ColumnMenu({ type, state }: { type: string; state: ListState }) {
  const router = useRouter();
  const definition = getObject(type);
  const fields = columnsOf(type).filter((field) => field.key !== definition.titleField);
  const visible = state.columns;
  /* Les colonnes visibles dans l'ordre choisi, puis les autres dans l'ordre des descripteurs. */
  const ordered = [...visible.map((key) => fields.find((field) => field.key === key)).filter((field) => field !== undefined), ...fields.filter((field) => !visible.includes(field.key))];
  const go = (columns: string[]) => router.push(listUrl(type, { ...state, columns }));

  function move(key: string, step: number) {
    const from = visible.indexOf(key);
    const columns = visible.filter((column) => column !== key);
    columns.splice(from + step, 0, key);
    go(columns);
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <Columns3Icon aria-hidden />
        Colonnes
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <ul data-slot="column-menu" className="grid gap-1">
          {ordered.map((field) => {
            const position = visible.indexOf(field.key);
            return (
              <li key={field.key} className="flex h-7 items-center gap-1">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <Checkbox checked={position >= 0} onCheckedChange={() => go(position >= 0 ? visible.filter((column) => column !== field.key) : [...visible, field.key])} />
                  <span className="truncate" title={field.label}>
                    {field.label}
                  </span>
                </label>
                {position >= 0 && (
                  <>
                    <Button variant="ghost" size="icon-xs" aria-label={`Monter la colonne ${field.label}`} disabled={position === 0} onClick={() => move(field.key, -1)}>
                      <ArrowUpIcon aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon-xs" aria-label={`Descendre la colonne ${field.label}`} disabled={position === visible.length - 1} onClick={() => move(field.key, 1)}>
                      <ArrowDownIcon aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
