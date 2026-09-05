"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JournalEntry } from "@/lib/mail/journal";
import type { EmailStatus } from "@/lib/mail/send";
import { callApi } from "./api-client";
import { formatDateTime, STATUS_LABELS, templateLabel } from "./labels";
import { OutcomeMessage, type Outcome } from "./outcome";
import { EmailStatusBadge } from "./status-badge";

/** Une entrée telle que l'API la sérialise : la date arrive en chaîne ISO. */
type Entry = Omit<JournalEntry, "createdAt"> & { createdAt: string };

type Filters = { status: EmailStatus | "tous"; from: string; to: string; objectType: string; objectId: string };

const EMPTY_FILTERS: Filters = { status: "tous", from: "", to: "", objectType: "", objectId: "" };
const STATUS_OPTIONS: { value: Filters["status"]; label: string }[] = [{ value: "tous", label: "Tous" }, ...(Object.keys(STATUS_LABELS) as EmailStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))];

/** Les dates du filtre sont des jours locaux (Europe/Paris, D2) : du début du premier au début du lendemain du second. */
function toQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.status !== "tous") params.set("status", filters.status);
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set("to", new Date(new Date(`${filters.to}T00:00:00`).getTime() + 86_400_000).toISOString());
  if (filters.objectType.trim()) params.set("objectType", filters.objectType.trim());
  if (filters.objectId.trim()) params.set("objectId", filters.objectId.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}

const authorLabel = (entry: Entry) => entry.author?.name || "Système";
const objectLabel = (entry: Entry) => (entry.objectType ? `${entry.objectType} ${entry.objectId ?? ""}`.trim() : "—");

type Props = { canResend: boolean };

/**
 * Paramètres → Journal des envois (D23) : lisible par tout membre. Liste dense à partir de `md`
 * (ligne 32 px, pas de zébrage, pied avec compteur) ; empilée en dessous. Puces de filtres au-dessus.
 */
export function JournalScreen({ canResend }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async (current: Filters) => {
    const result = await callApi<{ entries: Entry[] }>(`/api/emails/journal${toQuery(current)}`);
    if (result.ok) setEntries(result.data.entries);
    else setOutcome({ kind: "alert", text: result.failure.message });
  }, []);

  useEffect(() => {
    void load(EMPTY_FILTERS);
  }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(filters);
  }

  async function resend(entry: Entry) {
    setPending(true);
    const result = await callApi(`/api/emails/journal/${encodeURIComponent(entry.id)}/renvoyer`, { method: "POST" });
    setPending(false);
    setOutcome(result.ok ? { kind: "status", text: `Email renvoyé à ${entry.to}.` } : { kind: "alert", text: result.failure.message });
    if (result.ok) void load(filters);
  }

  const resendButton = (entry: Entry) =>
    canResend ? (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => resend(entry)}>
        Renvoyer
      </Button>
    ) : null;

  return (
    <div className="grid gap-4">
      <form className="flex flex-wrap items-end gap-3" aria-label="Filtres du journal" onSubmit={applyFilters}>
        <div className="grid gap-1">
          <Label htmlFor="journal-status">Statut</Label>
          <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: (value ?? "tous") as Filters["status"] })}>
            <SelectTrigger id="journal-status" aria-label="Statut" size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="journal-from">Du</Label>
          <Input id="journal-from" type="date" className="h-7 w-36" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="journal-to">Au</Label>
          <Input id="journal-to" type="date" className="h-7 w-36" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="journal-object-type">Type d&apos;objet</Label>
          <Input id="journal-object-type" className="h-7 w-28" placeholder="user" value={filters.objectType} onChange={(e) => setFilters({ ...filters, objectType: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="journal-object-id">Identifiant</Label>
          <Input id="journal-object-id" className="h-7 w-40" value={filters.objectId} onChange={(e) => setFilters({ ...filters, objectId: e.target.value })} />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Filtrer
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            void load(EMPTY_FILTERS);
          }}
        >
          Effacer les filtres
        </Button>
      </form>

      <OutcomeMessage outcome={outcome} />

      {entries === null ? (
        <div className="grid gap-1" aria-busy>
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun envoi ne correspond aux filtres.</p>
      ) : (
        <>
          <ul aria-label="Journal des envois" className="grid md:hidden">
            {entries.map((entry) => (
              <li key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 border-b py-2">
                <div className="grid min-w-0 gap-0.5">
                  <p className="truncate font-medium">{entry.to}</p>
                  <p className="truncate text-sm text-muted-foreground">{entry.subject}</p>
                  <p className="text-sm text-muted-foreground">
                    {templateLabel(entry.template)} · {formatDateTime(entry.createdAt)} · {authorLabel(entry)}
                  </p>
                </div>
                {entry.status === "echec" && resendButton(entry)}
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <EmailStatusBadge status={entry.status} />
                  {entry.errorReason && <span className="text-sm text-danger">{entry.errorReason}</span>}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table aria-label="Journal des envois">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-7">Date</TableHead>
                  <TableHead className="h-7">Destinataire</TableHead>
                  <TableHead className="h-7">Sujet</TableHead>
                  <TableHead className="h-7">Modèle</TableHead>
                  <TableHead className="h-7">Statut</TableHead>
                  <TableHead className="h-7">Auteur</TableHead>
                  <TableHead className="h-7">Objet</TableHead>
                  <TableHead className="h-7 w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} className="h-8">
                    <TableCell className="py-1 whitespace-nowrap tabular-nums text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell className="py-1 font-medium">{entry.to}</TableCell>
                    <TableCell className="max-w-64 truncate py-1">{entry.subject}</TableCell>
                    <TableCell className="py-1">{templateLabel(entry.template)}</TableCell>
                    <TableCell className="py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <EmailStatusBadge status={entry.status} />
                        {entry.errorReason && <span className="text-sm text-danger">{entry.errorReason}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-1 text-muted-foreground">{authorLabel(entry)}</TableCell>
                    <TableCell className="py-1 text-muted-foreground">{objectLabel(entry)}</TableCell>
                    <TableCell className="py-0 text-right">{entry.status === "echec" && resendButton(entry)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">{entries.length === 1 ? "1 envoi" : `${entries.length} envois`}</p>
        </>
      )}
    </div>
  );
}
