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

type Props = { type: string; id: string; items: readonly FeedItem[]; more: number; users: readonly UserOption[]; currentUserId: string };

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
 * la réponse 2xx du serveur, et un refus s'affiche sous l'entrée. Le fil est borné : quand des
 * entrées plus anciennes n'ont pas été chargées, une ligne dit combien.
 */
export function ActivityFeed({ type, id, items, more, users, currentUserId }: Props) {
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
      {/* Sous 900 px, l'onglet porte déjà le nom du fil : le titre de section le répéterait vingt pixels plus bas. */}
      <h2 className="text-base font-medium max-[899px]:hidden">Fil d&apos;activité</h2>
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
      {more > 0 && <p className="text-xs text-muted-foreground">{`et ${more} entrée${more > 1 ? "s" : ""} plus ancienne${more > 1 ? "s" : ""}`}</p>}
    </section>
  );
}

/**
 * Ligne de méta d'une entrée : type, fiche d'origine, état de la tâche, statut d'un email, auteur,
 * date, « automatique ». L'auteur ferme la ligne : aucune autre part ne redit son nom.
 */
function metaParts(item: FeedItem): ReactNode[] {
  const parts: ReactNode[] = [kindLabel(item.kind)];
  if (item.source) parts.push(<Link key="source" href={item.source.href} className="hover:underline focus-visible:rounded-sm">{item.source.title}</Link>);
  if (item.task) {
    if (item.task.dueDate) parts.push(`échéance ${formatDate(item.task.dueDate)}`);
    /* Le responsable n'est nommé que s'il diffère de l'auteur, déjà nommé en fin de ligne : sinon le même nom s'y lisait deux fois, sans rien pour les distinguer. */
    if (item.task.assignee && item.task.assigneeId !== item.author?.id) parts.push(`pour ${item.task.assignee}`);
    /* Contrat 12 : une tâche faite dit le jour de son cochage, jamais celui de sa création. */
    if (item.task.done) parts.push(item.task.doneAt ? `faite le ${formatDate(item.task.doneAt)}` : "faite");
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

/** Identifiants des volets et des onglets d'une fiche : `aria-controls` et `aria-labelledby` s'y réfèrent, une fiche ne montant qu'un jeu d'onglets. */
const LINKS_PANE = "volet-liens";
const MAIN_PANE = "volet-contenu";
const FEED_PANE = "volet-fil";
const tabId = (key: string) => `onglet-${key}`;

/**
 * Les trois colonnes d'une fiche et leurs deux volets (D5, fondations « Briques de fiche ») : liens
 * à gauche (260 px), contenu au centre, **fil d'activité à droite** (380 px). Sous 1280 px la colonne
 * de gauche se replie ; sous 900 px tout passe en une colonne et la fiche et son fil deviennent deux
 * onglets (32 px, soulignement accent, compteur à droite) dont un seul s'affiche à la fois. Ce
 * composant vit avec le fil parce que c'est lui qui devient l'onglet ; les fiches le montent autour
 * de leurs colonnes.
 *
 * Motif ARIA complet : chaque onglet désigne ses volets (`aria-controls`, une liste d'identifiants
 * — l'onglet « Fiche » en porte deux, les liens et le contenu restant deux colonnes distinctes au
 * large), et chaque volet est un `tabpanel` que son onglet nomme (`aria-labelledby`). L'entrée
 * courante garde `aria-current="page"` à côté d'`aria-selected`, comme l'idiome du projet le demande.
 */
export function SheetPanes({ links, main, feed, feedCount }: { links: ReactNode; main: ReactNode; feed: ReactNode; feedCount: number }) {
  const [tab, setTab] = useState<"fiche" | "fil">("fiche");
  const tabs = [
    { key: "fiche" as const, label: "Fiche", count: null as number | null, panels: [LINKS_PANE, MAIN_PANE] },
    { key: "fil" as const, label: "Fil d'activité", count: feedCount, panels: [FEED_PANE] },
  ];
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Sections de la fiche" className="flex gap-4 border-b border-border min-[900px]:hidden">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            id={tabId(entry.key)}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            aria-controls={entry.panels.join(" ")}
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
      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_var(--pane-right-w)] xl:grid-cols-[var(--pane-left-w)_minmax(0,1fr)_var(--pane-right-w)]">
        <div id={LINKS_PANE} role="tabpanel" aria-labelledby={tabId("fiche")} className={cn("min-w-0 min-[900px]:hidden xl:block", tab === "fil" && "max-[899px]:hidden")}>
          {links}
        </div>
        <div id={MAIN_PANE} role="tabpanel" aria-labelledby={tabId("fiche")} className={cn("min-w-0", tab === "fil" && "max-[899px]:hidden")}>
          {main}
        </div>
        <div id={FEED_PANE} role="tabpanel" aria-labelledby={tabId("fil")} className={cn("min-w-0", tab === "fiche" && "max-[899px]:hidden")}>
          {feed}
        </div>
      </div>
    </div>
  );
}
