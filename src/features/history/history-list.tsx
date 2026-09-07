import { listHistory, type HistoryEntry } from "@/features/history/history";
import { historyFieldsOf } from "@/features/objects/fields";
import { displayValue, formatDate, formatDateTime, type UserOption } from "@/features/objects/labels";
import type { FieldDescriptor } from "@/features/objects/registry";

type Props = { type: string; id: string; users: readonly UserOption[] };

const ACTION_LABELS: Record<HistoryEntry["action"], string> = { creee: "Fiche créée", modifiee: "Champ modifié", archivee: "Fiche archivée", restauree: "Fiche restaurée", fusionnee: "Fiche fusionnée" };

/** Jour (Europe/Paris) d'une date, pour grouper les entrées (fondations « Fil d'activité »). */
const dayOf = (date: Date) => formatDate(date);

/** « Type : Prospect → Client » ; une valeur absente se lit « vide ». */
function changeLabel(fields: readonly FieldDescriptor[], entry: HistoryEntry, users: readonly UserOption[]): string {
  const field = fields.find((f) => f.key === entry.field);
  const label = field?.label ?? entry.field ?? "";
  const show = (value: string | null) => (field && value !== null ? displayValue(field, value, users) : value ?? "vide");
  return `${label} : ${show(entry.oldValue)} → ${show(entry.newValue)}`;
}

/**
 * Historique des changements d'une fiche (D12) : antéchronologique, groupé par jour ; chaque entrée
 * porte le champ, l'ancienne et la nouvelle valeur, l'auteur et l'heure. Rendu côté serveur : il se
 * rafraîchit avec la fiche après chaque enregistrement.
 */
export async function HistoryList({ type, id, users }: Props) {
  const entries = await listHistory(type, id);
  const fields = historyFieldsOf(type);
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Aucun changement pour l&apos;instant.</p>;
  const days = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const day = dayOf(entry.createdAt);
    days.set(day, [...(days.get(day) ?? []), entry]);
  }
  return (
    <div className="grid gap-4">
      {Array.from(days, ([day, dayEntries]) => (
        <section key={day} aria-label={day} className="grid gap-2">
          <h3 className="tabular text-xs font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">{day}</h3>
          <ol className="grid gap-2">
            {dayEntries.map((entry) => (
              <li key={entry.id} className="grid gap-0.5 border-l-2 border-border pl-3 text-sm">
                <p className="font-medium">{entry.action === "modifiee" ? changeLabel(fields, entry, users) : ACTION_LABELS[entry.action]}</p>
                <p className="tabular text-xs text-muted-foreground">{`${entry.author?.name ?? "Système"} · ${formatDateTime(entry.createdAt)}${entry.author ? "" : " · automatique"}`}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
