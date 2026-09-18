"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SetControl } from "@/features/objects/set-control";
import { OPPORTUNITY_FIELDS } from "@/features/opportunities/schema";
import { DECISION_ROLES, DEFAULT_DECISION_ROLE } from "@/features/persons/schema";
import type { ConversionPreview } from "./conversion";

const FAILED = "La conversion n'a pas pu être menée.";

/** Longueur maximale d'un titre d'opportunité, lue sur son descripteur. */
const TITLE_MAX = OPPORTUNITY_FIELDS.find((field) => field.key === "title")!.maxLength!;

/** Titre pré-rempli de l'opportunité (D50) : « Besoin Workday · <entreprise de la conversion> », coupé à la longueur d'un titre. */
export const defaultOpportunityTitle = (companyName: string): string => `Besoin Workday · ${companyName.trim()}`.slice(0, TITLE_MAX).trimEnd();

/**
 * Ce que la fenêtre envoie : `companyId` quand une entreprise proposée est choisie, sinon le nom à créer.
 * `title` à `null` suit l'entreprise de la conversion ; saisi, il ne la suit plus (D50).
 */
type Draft = {
  firstName: string;
  lastName: string;
  companyName: string;
  companyId: string | null;
  keepCompany: boolean | null;
  jobTitle: string;
  decisionRole: string;
  createsOpportunity: boolean;
  title: string | null;
  modules: string[];
  expectedClose: string;
};

const MODULES_FIELD = OPPORTUNITY_FIELDS.find((field) => field.key === "modules")!;

type Failure = { message: string; fields: Record<string, string> };

const FIELD = "grid min-w-0 gap-1";
const CONTROL_ERROR = "text-xs text-danger";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className={CONTROL_ERROR}>
      {message}
    </p>
  ) : null;
}

/**
 * Fenêtre « Convertir » d'un lead (D15), en une étape : la personne (nouvelle, ou retrouvée par son
 * email, prénom et nom en lecture), l'entreprise (propositions qui suivent la frappe, « même nom que »,
 * « archivée », ou « laquelle garder » quand la personne est déjà contact ailleurs), le poste et le
 * rôle. En-tête et pied fixes, seule la zone centrale défile : « Convertir » reste visible à 375 px.
 * L'écran ne suit qu'après la réponse 2xx ; un refus s'affiche sous son champ, ou en tête de la fenêtre.
 */
export function ConvertLeadAction({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ConversionPreview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();

  async function load(query: string | null): Promise<ConversionPreview | null> {
    const suffix = query === null ? "" : `?entreprise=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}/conversion${suffix}`);
      const body = (await res.json().catch(() => null)) as (ConversionPreview & { message?: string }) | null;
      if (!res.ok || !body) {
        setFailure({ message: body?.message ?? FAILED, fields: {} });
        return null;
      }
      return body;
    } catch {
      setFailure({ message: FAILED, fields: {} });
      return null;
    }
  }

  async function openDialog() {
    setOpen(true);
    setFailure(null);
    const loaded = await load(null);
    if (!loaded) return;
    setPreview(loaded);
    const person = loaded.person;
    setDraft({
      firstName: person.firstName ?? "",
      lastName: person.lastName ?? "",
      companyName: loaded.company.query,
      companyId: null,
      keepCompany: null,
      jobTitle: loaded.jobTitle ?? "",
      decisionRole: DEFAULT_DECISION_ROLE,
      createsOpportunity: loaded.createsOpportunity,
      title: null,
      modules: [],
      expectedClose: "",
    });
  }

  /* Les propositions suivent la frappe (D15) : une lecture par pause de saisie, jamais une par touche. */
  const query = draft?.companyName ?? null;
  useEffect(() => {
    if (!open || query === null || preview === null || query === preview.company.query) return;
    const timer = setTimeout(() => {
      void load(query).then((loaded) => loaded && setPreview((current) => (current ? { ...current, company: loaded.company } : loaded)));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  const person = preview?.person;
  const contact = person?.kind === "found" ? person.contact : null;
  const keeps = contact !== null && draft?.keepCompany === true;
  /* L'entreprise de la conversion (D51) : celle que la personne garde, la proposition choisie, ou le nom à créer. */
  const chosenProposal = draft?.companyId ? preview?.company.proposals.find((proposal) => proposal.id === draft.companyId) : undefined;
  const conversionCompany = keeps && contact ? contact.companyName : (chosenProposal?.name ?? draft?.companyName ?? "");
  const opportunityTitle = draft?.title ?? defaultOpportunityTitle(conversionCompany);

  async function confirm() {
    if (!draft || !preview) return;
    setBusy(true);
    setFailure(null);
    const found = preview.person.kind === "found";
    const keeps = found && draft.keepCompany === true;
    const body = {
      ...(found ? {} : { firstName: draft.firstName, lastName: draft.lastName }),
      ...(keeps ? {} : draft.companyId ? { companyId: draft.companyId } : { companyName: draft.companyName }),
      ...(found && preview.person.kind === "found" && preview.person.contact ? { keepCompany: draft.keepCompany ?? undefined } : {}),
      jobTitle: draft.jobTitle,
      decisionRole: draft.decisionRole,
      /* Décochée, la case n'envoie rien : un titre saisi avant de décocher ne crée pas d'opportunité (D52). */
      ...(draft.createsOpportunity ? { opportunity: { title: opportunityTitle, modules: draft.modules, expectedClose: draft.expectedClose } } : {}),
    };
    let res: Response;
    try {
      res = await fetch(`/api/leads/${encodeURIComponent(id)}/conversion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      setBusy(false);
      setFailure({ message: FAILED, fields: {} });
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const refusal = (await res.json().catch(() => null)) as { message?: string; fields?: Record<string, string> } | null;
      setFailure({ message: refusal?.message ?? FAILED, fields: refusal?.fields ?? {} });
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const fieldErrors = failure?.fields ?? {};
  const generalError = failure && Object.keys(fieldErrors).length === 0 ? failure.message : null;

  return (
    <div data-slot="lead-action" className="grid justify-items-end gap-1">
      <Button size="sm" onClick={() => void openDialog()}>
        Convertir
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="grid max-h-[90dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0">
          <DialogHeader className="border-b p-4">
            <DialogTitle>Convertir le lead</DialogTitle>
            <DialogDescription className="min-w-0 truncate" title={preview?.title}>
              {preview ? `« ${preview.title} » devient une personne avec un profil contact, et une entreprise.` : "Chargement de l'aperçu…"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid content-start gap-4 overflow-y-auto p-4">
            {generalError && (
              <p role="alert" className="rounded-md border-l-[3px] border-l-danger bg-danger-subtle/40 p-2 text-sm">
                {generalError}
              </p>
            )}
            {person && draft && (
              <section aria-labelledby={`${ids}-personne`} className="grid gap-2">
                <h3 id={`${ids}-personne`} className="text-sm font-medium">
                  Personne
                </h3>
                {person.kind === "found" ? (
                  <>
                    <p className="text-sm">{`Cet email est celui de « ${person.name} » : la conversion reprend cette personne.`}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className={FIELD}>
                        <span id={`${ids}-prenom`} className="text-xs text-muted-foreground">
                          Prénom
                        </span>
                        <span aria-labelledby={`${ids}-prenom`} className="min-w-0 truncate" title={person.firstName}>
                          {person.firstName}
                        </span>
                      </div>
                      <div className={FIELD}>
                        <span id={`${ids}-nom`} className="text-xs text-muted-foreground">
                          Nom
                        </span>
                        <span aria-labelledby={`${ids}-nom`} className="min-w-0 truncate" title={person.lastName}>
                          {person.lastName}
                        </span>
                      </div>
                    </div>
                    {person.differences.length > 0 && (
                      <ul aria-label="Différences" className="grid gap-0.5 text-sm text-muted-foreground">
                        {person.differences.map((difference) => (
                          <li key={difference}>{difference}</li>
                        ))}
                      </ul>
                    )}
                    {contact && (
                      <fieldset className="grid gap-1">
                        <legend className="text-sm">{`Déjà contact chez « ${contact.companyName} » : quelle entreprise garder ?`}</legend>
                        <label className="flex min-w-0 items-center gap-2 text-sm">
                          <input type="radio" name={`${ids}-garder`} checked={draft.keepCompany === true} onChange={() => update({ keepCompany: true })} className="focus-visible:outline-2" />
                          <span className="min-w-0 truncate">{`Garder « ${contact.companyName} »`}</span>
                        </label>
                        <label className="flex min-w-0 items-center gap-2 text-sm">
                          <input type="radio" name={`${ids}-garder`} checked={draft.keepCompany === false} onChange={() => update({ keepCompany: false })} className="focus-visible:outline-2" />
                          <span className="min-w-0 truncate">Passer à l&apos;entreprise du lead</span>
                        </label>
                        <FieldError id={`${ids}-garder-erreur`} message={fieldErrors.keepCompany} />
                      </fieldset>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm">Une nouvelle personne sera créée.</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className={FIELD}>
                        <span className="text-xs text-muted-foreground">Prénom</span>
                        <Input required value={draft.firstName} aria-invalid={Boolean(fieldErrors.firstName)} onChange={(event) => update({ firstName: event.target.value })} />
                        <FieldError id={`${ids}-prenom-erreur`} message={fieldErrors.firstName} />
                      </label>
                      <label className={FIELD}>
                        <span className="text-xs text-muted-foreground">Nom</span>
                        <Input required value={draft.lastName} aria-invalid={Boolean(fieldErrors.lastName)} onChange={(event) => update({ lastName: event.target.value })} />
                        <FieldError id={`${ids}-nom-erreur`} message={fieldErrors.lastName} />
                      </label>
                    </div>
                  </>
                )}
              </section>
            )}
            {preview && draft && !keeps && (
              <section aria-labelledby={`${ids}-entreprise`} className="grid gap-2">
                <h3 id={`${ids}-entreprise`} className="text-sm font-medium">
                  Entreprise
                </h3>
                <label className={FIELD}>
                  <span className="text-xs text-muted-foreground">Entreprise</span>
                  <Input required value={draft.companyName} aria-invalid={Boolean(fieldErrors.companyName)} onChange={(event) => update({ companyName: event.target.value, companyId: null })} />
                  <FieldError id={`${ids}-entreprise-erreur`} message={fieldErrors.companyName} />
                </label>
                <fieldset className="grid gap-1">
                  <legend className="sr-only">Entreprise de la conversion</legend>
                  {preview.company.proposals.map((proposal) => (
                    <label key={proposal.id} className="flex min-w-0 items-center gap-2 text-sm">
                      <input type="radio" name={`${ids}-choix`} checked={draft.companyId === proposal.id} onChange={() => update({ companyId: proposal.id })} className="focus-visible:outline-2" />
                      <span className="min-w-0 truncate" title={proposal.name}>
                        {proposal.name}
                      </span>
                      {proposal.archived && <span className="shrink-0 text-xs text-muted-foreground">archivée</span>}
                    </label>
                  ))}
                  {preview.company.more > 0 && <p className="text-xs text-muted-foreground">{`et ${preview.company.more} autre${preview.company.more > 1 ? "s" : ""}`}</p>}
                  {draft.companyName.trim() !== "" && (
                    <label className="flex min-w-0 items-center gap-2 text-sm">
                      <input type="radio" name={`${ids}-choix`} checked={draft.companyId === null} onChange={() => update({ companyId: null })} className="focus-visible:outline-2" />
                      <span className="min-w-0 truncate" title={draft.companyName}>{`Créer « ${draft.companyName.trim()} » (prospect)`}</span>
                      {preview.company.sameNameAs && draft.companyId === null && <span className="shrink-0 text-xs text-warning">{`même nom que ${preview.company.sameNameAs}`}</span>}
                    </label>
                  )}
                </fieldset>
              </section>
            )}
            {preview && draft && (
              <section aria-labelledby={`${ids}-profil`} className="grid gap-2">
                <h3 id={`${ids}-profil`} className="text-sm font-medium">
                  Profil contact
                </h3>
                {/* Garder l'entreprise actuelle laisse le profil entier inchangé (D15) : rien à saisir, une phrase le dit. */}
                {keeps && contact ? (
                  <p className="min-w-0 truncate text-sm" title={contact.companyName}>{`Le profil contact chez « ${contact.companyName} » reste inchangé.`}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={FIELD}>
                      <span className="text-xs text-muted-foreground">Poste</span>
                      <Input value={draft.jobTitle} onChange={(event) => update({ jobTitle: event.target.value })} />
                      <FieldError id={`${ids}-poste-erreur`} message={fieldErrors.jobTitle} />
                    </label>
                    <label className={FIELD}>
                      <span className="text-xs text-muted-foreground">Rôle dans la décision</span>
                      <select
                        value={draft.decisionRole}
                        onChange={(event) => update({ decisionRole: event.target.value })}
                        className="h-[var(--control-h)] rounded-md border bg-transparent px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {DECISION_ROLES.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                      <FieldError id={`${ids}-role-erreur`} message={fieldErrors.decisionRole} />
                    </label>
                  </div>
                )}
              </section>
            )}
            {preview && draft && (
              <section aria-labelledby={`${ids}-opportunite`} className="grid gap-2">
                <h3 id={`${ids}-opportunite`} className="text-sm font-medium">
                  Opportunité
                </h3>
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <Checkbox aria-label="Créer une opportunité" checked={draft.createsOpportunity} onCheckedChange={(checked) => update({ createsOpportunity: checked === true })} />
                  <span>Créer une opportunité</span>
                </div>
                <FieldError id={`${ids}-opportunite-erreur`} message={fieldErrors.opportunity} />
                {/* Cochée, la case demande un titre, des modules et une clôture prévue ; le reste vient de la conversion (D50, D51). */}
                {draft.createsOpportunity && (
                  <>
                    <label className={FIELD}>
                      <span className="text-xs text-muted-foreground">Titre</span>
                      <Input required value={opportunityTitle} aria-invalid={Boolean(fieldErrors.title)} onChange={(event) => update({ title: event.target.value })} />
                      <FieldError id={`${ids}-titre-erreur`} message={fieldErrors.title} />
                    </label>
                    <SetControl id={`${ids}-modules`} label={MODULES_FIELD.label} value={draft.modules} values={MODULES_FIELD.values ?? []} error={fieldErrors.modules} onChange={(modules) => update({ modules })} />
                    <label className={FIELD}>
                      <span className="text-xs text-muted-foreground">Clôture prévue</span>
                      <Input
                        required
                        type="date"
                        value={draft.expectedClose}
                        aria-invalid={Boolean(fieldErrors.expectedClose)}
                        onChange={(event) => update({ expectedClose: event.target.value })}
                        className="focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
                      />
                      <FieldError id={`${ids}-cloture-erreur`} message={fieldErrors.expectedClose} />
                    </label>
                  </>
                )}
              </section>
            )}
          </div>
          {/* Le pied de shadcn déborde de `-mx-4 -mb-4` pour un dialogue à `p-4` : celui-ci est à `p-0`, le pied reste dans le cadre. */}
          <DialogFooter className="mx-0 mb-0 border-t p-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="button" size="sm" disabled={busy || !draft} onClick={() => void confirm()}>
              Convertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
