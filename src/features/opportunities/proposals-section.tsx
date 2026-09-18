"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldControl } from "@/features/objects/field-control";
import { EMPTY, formatNumber } from "@/features/objects/labels";
import type { Proposal, ProposalCandidate } from "./proposals";
import { OPPORTUNITY_FIELDS, PROPOSAL_RESULTS } from "./schema";

/**
 * `moreProposals`, `moreCandidates` : ce que les lectures bornées n'ont pas chargé, annoncé sous la liste et sous le sélecteur.
 * `readOnly` : l'opportunité ne s'écrit plus (fiche archivée, D21) ; les propositions se lisent, aucune ne s'ajoute.
 */
type Props = { opportunityId: string; proposals: readonly Proposal[]; moreProposals: number; candidates: readonly ProposalCandidate[]; moreCandidates: number; readOnly?: boolean };

type Failure = { message?: string; fields?: Record<string, string> };

const FAILED = "Le consultant n'a pas pu être ajouté.";

/* Le TJM de vente proposé a les bornes et l'unité du TJM de vente cible (D45) : il s'écrit comme lui, « 650,00 € ». */
const RATE_FIELD = OPPORTUNITY_FIELDS.find((field) => field.key === "targetDailyRate")!;

const resultLabel = (value: string) => PROPOSAL_RESULTS.find((result) => result.value === value)?.label ?? value;

/** « et 12 autres » sous une lecture bornée ; rien quand elle a tout chargé. */
function More({ count }: { count: number }) {
  if (count <= 0) return null;
  return <p className="text-xs text-muted-foreground">{`et ${count} autre${count > 1 ? "s" : ""}`}</p>;
}

/**
 * Section « Consultants proposés » de la fiche d'une opportunité (D44), sous « Champs » : les
 * consultants présentés au client, avec leur résultat et leur TJM de vente proposé. « Ajouter un
 * consultant » ouvre le choix parmi les consultants actifs pas encore proposés, chacun avec son état ;
 * l'ajout ne s'affiche qu'après la réponse 2xx, un refus s'affiche sous le sélecteur.
 */
export function ProposalsSection({ opportunityId, proposals, moreProposals, candidates, moreCandidates, readOnly = false }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | undefined>();

  /** Ajoute le consultant choisi ; rend vrai si le serveur l'a accepté. */
  async function add(personId: string): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch(`/api/opportunites/${encodeURIComponent(opportunityId)}/propositions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ personId }) });
    } catch {
      setError(FAILED);
      return false;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as Failure | null;
      setError(body?.fields?.personId ?? body?.message ?? FAILED);
      return false;
    }
    setError(undefined);
    setAdding(false);
    router.refresh();
    return true;
  }

  return (
    <section aria-label="Consultants proposés" className="grid min-w-0 gap-3">
      <h2 className="text-base font-medium">Consultants proposés</h2>
      {proposals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun consultant proposé.</p>
      ) : (
        <ul className="grid gap-1">
          {proposals.map((proposal) => (
            <li key={proposal.personId} className="flex min-w-0 items-center gap-2 text-sm">
              <Link href={`/personnes/${proposal.personId}`} title={proposal.name} className="min-w-0 flex-1 truncate hover:underline focus-visible:rounded-sm">
                {proposal.name}
              </Link>
              <Badge variant="outline" className="shrink-0 border-border">
                {resultLabel(proposal.result)}
              </Badge>
              <span className="tabular shrink-0 text-right">{proposal.proposedDailyRate === null ? EMPTY : formatNumber(RATE_FIELD, proposal.proposedDailyRate)}</span>
            </li>
          ))}
        </ul>
      )}
      <More count={moreProposals} />
      {/* Fiche archivée : le bouton disparaît plutôt que de s'éteindre — l'ajout finirait en 409. */}
      {!readOnly && !adding && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            Ajouter un consultant
          </Button>
        </div>
      )}
      {!readOnly && adding && (
        <div className="grid min-w-0 gap-1">
          <FieldControl
            id="propositions-personId"
            label="Consultant"
            placement="sheet"
            kind="record"
            value=""
            options={candidates.map((candidate) => ({ value: candidate.id, label: `${candidate.name} · ${candidate.state}` }))}
            placeholder="Choisir un consultant…"
            error={error}
            onSave={add}
          />
          <More count={moreCandidates} />
        </div>
      )}
    </section>
  );
}
