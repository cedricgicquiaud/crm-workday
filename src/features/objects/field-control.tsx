"use client";

import { useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** Une valeur proposée par un sélecteur ; `disabled` : une valeur retirée de la liste (2.4), lisible mais plus choisissable. */
export type FieldControlOption = { value: string; label: string; disabled?: boolean };

/**
 * Où le champ est rendu, ce qui règle sa densité et sa façon d'enregistrer :
 * — `sheet` : 28 px, édition en place, la valeur part quand on quitte le champ ou sur Entrée ;
 * — `dialog` : 32 px, valeur tenue par l'appelant, chaque frappe remonte.
 */
export type FieldPlacement = "sheet" | "dialog";

/** Forme du contrôle : texte d'une ligne, texte long, nombre, date, liste fermée, ou fiche liée (relation déclarée). */
export type FieldControlKind = "text" | "multiline" | "number" | "date" | "list" | "record";

export type FieldControlProps = {
  /** identifiant du contrôle ; le refus porte `<id>-error` et le libellé de lecture seule `<id>-label` */
  id: string;
  label: string;
  placement: FieldPlacement;
  kind: FieldControlKind;
  /** valeur enregistrée (fiche) ou valeur saisie (dialogue) */
  value: string;
  /** valeurs proposées par une liste ou par un sélecteur de fiche liée */
  options?: readonly FieldControlOption[];
  placeholder?: string;
  /** refus du serveur ou d'une règle de saisie, affiché sous le champ */
  error?: string;
  /** nom du champ dans le formulaire (dialogue) */
  name?: string;
  /** la valeur se lit, elle ne se modifie plus : champ dérivé, champ non éditable, fiche archivée (D21) */
  readOnly?: boolean;
  /** texte de la valeur en lecture seule (libellé de liste, nom d'utilisateur) ; défaut : la valeur brute */
  display?: string;
  /** fiche : enregistre la valeur ; faux fait revenir la valeur enregistrée */
  onSave?: (value: string) => Promise<boolean>;
  /** dialogue : la valeur saisie, à chaque frappe */
  onChange?: (value: string) => void;
};

/** 28 px sur une fiche, 32 px dans un dialogue : la densité vient des tokens, jamais d'une hauteur écrite à la main. */
const HEIGHT: Record<FieldPlacement, string> = { sheet: "h-(--control-h)", dialog: "h-(--control-h-lg)" };

const SELECTS: readonly FieldControlKind[] = ["list", "record"];

const INPUT_TYPE: Partial<Record<FieldControlKind, string>> = { number: "number", date: "date" };

/**
 * Ce qu'une touche fait dans un champ : enregistrer le brouillon, le remettre à la valeur
 * enregistrée, ou rien — et c'est le cas de tout ce qui est saisi dans un dialogue. Là, la valeur
 * appartient au formulaire : intercepter Entrée lui retirerait la soumission implicite du
 * navigateur, celle qui crée la personne depuis n'importe quel champ (défaut d'audit 3.0). Sur une
 * fiche, le champ s'édite en place et n'a pas de formulaire autour de lui : Entrée enregistre, Échap
 * annule, sauf dans un texte long où Entrée reste un retour à la ligne.
 */
export function fieldKeyAction(placement: FieldPlacement, kind: FieldControlKind, key: string): "commit" | "cancel" | null {
  if (placement !== "sheet") return null;
  if (key === "Escape") return "cancel";
  return key === "Enter" && kind !== "multiline" ? "commit" : null;
}

/**
 * Le champ, rendu une seule fois pour tout le CRM (CRM-78) : libellé au-dessus (12 px / 500),
 * contrôle selon son type, refus en dessous (11 px, `role="alert"`), désigné par le contrôle. La
 * section « Champs » d'une fiche, le dialogue de création rapide et les sections propres à un objet
 * passent tous par ici ; sans lui, le même contrôle sortait à 28 px d'un côté et 32 de l'autre.
 *
 * Sur une fiche, la valeur affichée ne change qu'après la réponse 2xx du serveur : un refus revient
 * sous le champ et la valeur enregistrée reprend sa place. Dans un dialogue, la valeur appartient au
 * formulaire, qui l'envoie à la création.
 */
export function FieldControl({ id, label, placement, kind, value: saved, options, placeholder, error, name, readOnly = false, display, onSave, onChange }: FieldControlProps) {
  const errorId = `${id}-error`;
  const [draft, setDraft] = useState(saved);
  /* La valeur enregistrée a changé ailleurs (réponse du serveur) : le brouillon la suit. */
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setDraft(saved);
  }

  if (readOnly) return <ReadOnlyValue id={id} label={label} value={display ?? saved} />;

  /* Dans un dialogue, la valeur remonte à chaque frappe ; sur une fiche, elle part quand le champ est quitté. */
  const live = placement === "dialog";
  const describedBy = error ? errorId : undefined;

  async function commit() {
    if (draft === saved) return;
    if (!(await onSave?.(draft.trim()))) setDraft(saved);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const action = fieldKeyAction(placement, kind, event.key);
    if (!action) return;
    if (action === "cancel") setDraft(saved);
    /* Entrée sort du champ, ce qui enregistre par `onBlur` ; l'empêcher évite qu'elle soumette au passage. */
    if (action === "commit") event.preventDefault();
    event.currentTarget.blur();
  }

  function choose(next: string) {
    if (live) onChange?.(next);
    else void onSave?.(next);
  }

  return (
    <div className={placement === "sheet" ? "grid gap-1" : "grid gap-2"}>
      <Label htmlFor={id}>{label}</Label>
      {SELECTS.includes(kind) ? (
        <FieldSelect id={id} label={label} placement={placement} kind={kind} value={saved} options={options ?? []} placeholder={placeholder} error={error} describedBy={describedBy} onChoose={choose} />
      ) : kind === "multiline" ? (
        <Textarea id={id} name={name} value={draft} rows={4} aria-invalid={error ? true : undefined} aria-describedby={describedBy} onChange={(e) => (live ? onChange?.(e.target.value) : setDraft(e.target.value))} onBlur={() => !live && void commit()} onKeyDown={onKeyDown} />
      ) : (
        <Input
          id={id}
          name={name}
          type={INPUT_TYPE[kind]}
          className={`${HEIGHT[placement]} truncate`}
          value={live ? saved : draft}
          title={live ? undefined : draft || undefined}
          autoComplete={live ? "off" : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => (live ? onChange?.(e.target.value) : setDraft(e.target.value))}
          onBlur={() => !live && void commit()}
          onKeyDown={onKeyDown}
        />
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type SelectProps = { id: string; label: string; placement: FieldPlacement; kind: FieldControlKind; value: string; options: readonly FieldControlOption[]; placeholder?: string; error?: string; describedBy?: string; onChoose: (value: string) => void };

/**
 * Liste fermée ou fiche liée. Une fiche liée ouvre sa liste alignée sur le champ : alignée sur
 * l'option choisie, elle déborderait de quelques pixels sur sa droite (repasse 2.2). Une valeur
 * choisie avant que les fiches soient chargées reste sélectionnée, sans libellé jusque-là.
 */
function FieldSelect({ id, label, placement, kind, value, options, placeholder, error, describedBy, onChoose }: SelectProps) {
  const record = kind === "record";
  const items = record && value && !options.some((option) => option.value === value) ? [...options, { value, label: "…" }] : options;
  return (
    <Select items={items} value={value || null} onValueChange={(next) => (record ? next && onChoose(next) : onChoose(next ?? ""))}>
      <SelectTrigger id={id} aria-label={label} size={placement === "sheet" ? "sm" : "default"} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className="w-full min-w-0">
        <SelectValue className="min-w-0 truncate" placeholder={placeholder ?? (record || placement === "dialog" ? "Choisir…" : "—")} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={!record}>
        {items.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Valeur en lecture seule : un nom calculé, un champ dérivé, ou n'importe quel champ d'une fiche
 * archivée (D21). Elle se lit comme du texte. Rendue par un contrôle éteint, elle serait à demi
 * transparente — le contraste tomberait sous le seuil lisible alors que c'est une donnée de la
 * fiche (défaut d'audit 2.2).
 */
function ReadOnlyValue({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span id={`${id}-label`} className="flex items-center gap-2 text-sm leading-none font-medium select-none">
        {label}
      </span>
      <p id={id} aria-labelledby={`${id}-label`} className="min-w-0 truncate text-sm" title={value}>
        {value}
      </p>
    </div>
  );
}
