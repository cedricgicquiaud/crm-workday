"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

const RATE_LABEL = "TJM de vente proposé";

const resultLabel = (value: string) => PROPOSAL_RESULTS.find((result) => result.value === value)?.label ?? value;

const RESULT_OPTIONS = PROPOSAL_RESULTS.map(({ value, label }) => ({ value, label }));

const CHANGE_FAILED = "La proposition n'a pas pu être modifiée.";

/** Ce qu'une modification envoie : le résultat choisi, ou le TJM saisi (vide : aucun TJM ; illisible : envoyé tel quel, le serveur le refuse sous le champ). */
type Change = { result: string } | { proposedDailyRate: number | string | null };

function rateInput(raw: string): number | string | null {
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}

/**
 * Une proposition de la section : le consultant, son résultat et son TJM de vente proposé, chacun
 * modifiable en place. La valeur affichée ne change qu'après la réponse 2xx ; un refus (second
 * « Retenu », TJM hors bornes) s'affiche sous le champ et la valeur enregistrée reprend sa place.
 */
function ProposalRow({ opportunityId, proposal, readOnly }: { opportunityId: string; proposal: Proposal; readOnly: boolean }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const url = `/api/opportunites/${encodeURIComponent(opportunityId)}/propositions/${encodeURIComponent(proposal.personId)}`;

  /** Enregistre un changement ; rend vrai si le serveur l'a accepté. */
  async function save(change: Change): Promise<boolean> {
    const key = Object.keys(change)[0];
    let res: Response;
    try {
      res = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
    } catch {
      setErrors({ [key]: CHANGE_FAILED });
      return false;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as Failure | null;
      setErrors({ [key]: body?.fields?.[key] ?? body?.message ?? CHANGE_FAILED });
      return false;
    }
    setErrors({});
    router.refresh();
    return true;
  }

  const rate = proposal.proposedDailyRate;
  return (
    <li className="grid min-w-0 gap-2 text-sm">
      <Link href={`/personnes/${proposal.personId}`} title={proposal.name} className="min-w-0 truncate font-medium hover:underline focus-visible:rounded-sm">
        {proposal.name}
      </Link>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <FieldControl
          id={`proposition-${proposal.personId}-result`}
          label="Résultat"
          placement="sheet"
          kind="list"
          value={proposal.result}
          options={RESULT_OPTIONS}
          display={resultLabel(proposal.result)}
          readOnly={readOnly}
          error={errors.result}
          onSave={(result) => save({ result })}
        />
        <FieldControl
          id={`proposition-${proposal.personId}-rate`}
          label={RATE_LABEL}
          placement="sheet"
          kind="number"
          value={rate === null ? "" : String(rate)}
          display={rate === null ? EMPTY : formatNumber(RATE_FIELD, rate)}
          readOnly={readOnly}
          error={errors.proposedDailyRate}
          onSave={(raw) => save({ proposedDailyRate: rateInput(raw) })}
        />
      </div>
    </li>
  );
}

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
        <ul className="grid gap-4">
          {proposals.map((proposal) => (
            <ProposalRow key={proposal.personId} opportunityId={opportunityId} proposal={proposal} readOnly={readOnly} />
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
