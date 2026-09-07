"use client";

import { cn } from "cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { STATUS_LABELS } from "@/features/emails/labels";
import { formatDate, formatDateTime, type UserOption } from "@/features/objects/labels";
import type { EmailStatus } from "@/lib/mail/send";
import { ActivityComposer } from "./activity-composer";
import type { FeedItem } from "./feed";
import { ALL, feedFilters, feedKinds } from "./schema";

type Props = { type: string; id: string; items: readonly FeedItem[]; users: readonly UserOption[]; currentUserId: string };

const FAILED = "La tâche n'a pas pu être enregistrée.";

const kindLabel = (kind: string) => feedKinds().find((declared) => declared.key === kind)?.label ?? kind;

/** Entrées d'un même jour (Europe/Paris), dans l'ordre reçu. */
function byDay(items: readonly FeedItem[]): { day: string; items: FeedItem[] }[] {
  const days = new Map<string, FeedItem[]>();
  for (const item of items) {
    const day = formatDate(item.at);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return Array.from(days, ([day, dayItems]) => ({ day, items: dayItems }));
}

/**
 * Fil d'activité d'une fiche (D11, fondations « Fil d'activité ») : antéchronologique, groupé par
 * jour, filtrable par type en puces qui portent leur compteur. Chaque entrée dit son type, son
 * auteur et sa date ; celles dont l'auteur est le système portent la mention « automatique » en
 * toutes lettres, jamais un simple gris. Une tâche se coche ici même ; l'écran ne change qu'après
 * la réponse 2xx du serveur, et un refus s'affiche sous l'entrée.
 */
export function ActivityFeed({ type, id, items, users, currentUserId }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState(ALL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const shown = filter === ALL ? items : items.filter((item) => item.kind === filter);

  async function toggleTask(item: FeedItem) {
    if (!item.task) return;
    const fail = (message: string) => setErrors((current) => ({ ...current, [item.id]: message }));
    let res: Response;
    try {
      res = await fetch(`/api/activites/${encodeURIComponent(item.task.activityId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ done: !item.task.done }) });
    } catch {
      fail(FAILED);
      return;
    }
    const answer = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) {
      fail(answer?.message ?? FAILED);
      return;
    }
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== item.id)));
    router.refresh();
  }

  return (
    <section aria-label="Fil d'activité" className="grid min-w-0 content-start gap-3">
      <h2 className="text-base font-medium">Fil d&apos;activité</h2>
      <ActivityComposer type={type} id={id} users={users} currentUserId={currentUserId} />
      <div role="group" aria-label="Filtrer le fil" className="flex flex-wrap gap-1">
        {feedFilters(items).map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={chip.key === filter}
            onClick={() => setFilter(chip.key)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              chip.key === filter ? "bg-primary-subtle text-primary-subtle-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {chip.label}
            <span className="tabular">{chip.count}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune entrée pour l&apos;instant.</p>
      ) : (
        <div className="grid gap-4">
          {byDay(shown).map(({ day, items: dayItems }) => (
            <section key={day} aria-label={day} className="grid gap-2">
              <h3 className="tabular text-xs font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">{day}</h3>
              <ol className="grid gap-2">
                {dayItems.map((item) => (
                  <FeedEntry key={item.id} item={item} error={errors[item.id]} onToggle={() => void toggleTask(item)} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

/** Ligne de méta d'une entrée : type, fiche d'origine, état de la tâche, statut d'un email, auteur, date, « automatique ». */
function metaParts(item: FeedItem): ReactNode[] {
  const parts: ReactNode[] = [kindLabel(item.kind)];
  if (item.source) parts.push(<Link key="source" href={item.source.href} className="hover:underline focus-visible:rounded-sm">{item.source.title}</Link>);
  if (item.task) {
    if (item.task.dueDate) parts.push(`échéance ${formatDate(item.task.dueDate)}`);
    if (item.task.assignee) parts.push(item.task.assignee);
    if (item.task.done) parts.push("faite");
    else if (item.task.overdue) parts.push("en retard");
  }
  if (item.status) parts.push(STATUS_LABELS[item.status as EmailStatus] ?? item.status);
  parts.push(item.author?.name ?? "Système");
  parts.push(formatDateTime(item.at));
  /* D11 : la mention est écrite en toutes lettres, elle ne se devine pas à la couleur. */
  if (!item.author) parts.push("automatique");
  return parts;
}

function FeedEntry({ item, error, onToggle }: { item: FeedItem; error?: string; onToggle: () => void }) {
  return (
    <li className={cn("grid gap-0.5 border-l-2 pl-3 text-sm", item.task?.overdue ? "border-warning" : "border-border")}>
      <div className="flex min-w-0 items-start gap-2">
        {item.task && <Checkbox className="mt-0.5" checked={item.task.done} aria-label={item.text ?? "Tâche"} onCheckedChange={onToggle} />}
        <p className={cn("min-w-0 font-medium text-pretty", item.task?.done && "text-muted-foreground line-through")}>{item.text}</p>
      </div>
      <p className="tabular text-xs text-muted-foreground">
        {metaParts(item).map((part, index) => (
          <span key={index}>
            {index > 0 ? " · " : ""}
            {part}
          </span>
        ))}
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Deux volets de la fiche (D5) : au-dessus de 900 px la fiche et son fil s'affichent l'un après
 * l'autre ; en dessous, ils deviennent deux onglets (32 px, soulignement accent, compteur à droite)
 * et un seul volet s'affiche à la fois. Ce composant vit avec le fil parce que c'est lui qui devient
 * l'onglet ; la fiche générique le monte autour de ses colonnes.
 */
export function SheetPanes({ sheet, feed, feedCount }: { sheet: ReactNode; feed: ReactNode; feedCount: number }) {
  const [tab, setTab] = useState<"fiche" | "fil">("fiche");
  const tabs = [
    { key: "fiche" as const, label: "Fiche", count: null as number | null },
    { key: "fil" as const, label: "Fil d'activité", count: feedCount },
  ];
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Sections de la fiche" className="flex gap-4 border-b border-border min-[900px]:hidden">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            id={`onglet-${entry.key}`}
            aria-controls={`volet-${entry.key}`}
            aria-selected={tab === entry.key}
            aria-current={tab === entry.key ? "page" : undefined}
            onClick={() => setTab(entry.key)}
            className={cn(
              "flex h-8 items-center gap-2 border-b-2 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              tab === entry.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
            {entry.count !== null && <span className="tabular text-xs text-muted-foreground">{entry.count}</span>}
          </button>
        ))}
      </div>
      <div id="volet-fiche" role="tabpanel" aria-labelledby="onglet-fiche" className={cn(tab === "fil" && "max-[899px]:hidden")}>
        {sheet}
      </div>
      <div id="volet-fil" role="tabpanel" aria-labelledby="onglet-fil" className={cn(tab === "fiche" && "max-[899px]:hidden")}>
        {feed}
      </div>
    </div>
  );
}
