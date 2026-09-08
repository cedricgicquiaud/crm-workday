"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import "@/features/objects/manifest";
import { displayValue, type SerializedRecord, type UserOption } from "@/features/objects/labels";
import { getObject, type FieldDescriptor } from "@/features/objects/registry";

type Props = { type: string; id: string; field: FieldDescriptor; value: string; users: readonly UserOption[] };

const FAILED = "La modification n'a pas pu être enregistrée.";

/** Contrôle ouvert dans une ligne de 32 px : il occupe la cellule sans la faire grandir. */
const CONTROL = "h-6 w-full min-w-0 rounded-sm border border-input bg-background px-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Seuls le texte et les listes s'éditent dans la liste (D6) ; les dates et les nombres se modifient sur la fiche. */
const isInlineEditable = (field: FieldDescriptor): boolean => field.editable !== false && (field.type === "text" || field.type === "list");

/** Cellules éditables de la page, dans l'ordre du tableau : Tab passe de l'une à la suivante. */
function nextCell(current: string): HTMLElement | undefined {
  const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-cell]"));
  return cells[cells.findIndex((cell) => cell.dataset.cell === current) + 1];
}

/**
 * Cellule de la liste. Un champ texte ou de liste s'y édite en place (D6) : double-clic ou Entrée
 * ouvre la cellule, Tab enregistre et porte le curseur sur la cellule suivante, Échap annule sans
 * rien envoyer. La valeur affichée ne change qu'après la réponse 2xx du serveur ; un refus s'affiche
 * sous la cellule et la valeur enregistrée revient. Modifications concurrentes : le dernier écrit
 * gagne, sans verrou (D6). Les autres champs se lisent ici et se modifient sur la fiche.
 */
export function ListCell({ type, id, field, value: initial, users }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Échap ferme la cellule : la sortie de champ qui suit ne doit rien enregistrer. */
  const cancelled = useRef(false);
  const key = `${id}:${field.key}`;
  const text = displayValue(field, saved, users);

  async function save(value: string): Promise<boolean> {
    if (value === saved) return true;
    let response: Response;
    try {
      response = await fetch(`${getObject(type).apiBase}/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field.key]: value }) });
    } catch {
      setError(FAILED);
      return false;
    }
    const body = (await response.json().catch(() => null)) as (SerializedRecord & { message?: string; fields?: Record<string, string> }) | null;
    if (!response.ok) {
      setError(body?.fields?.[field.key] ?? body?.message ?? FAILED);
      return false;
    }
    setError(null);
    setSaved(body ? String(body[field.key] ?? "") : value);
    router.refresh();
    return true;
  }

  /** Ferme la cellule sur la valeur enregistrée, sans rien envoyer. */
  function cancel() {
    cancelled.current = true;
    setEditing(false);
  }

  async function commit(value: string, advance: boolean) {
    const following = advance ? nextCell(key) : undefined;
    const accepted = await save(value);
    /* La sortie de champ qui suit la fermeture ne doit pas renvoyer la même valeur. */
    cancelled.current = true;
    /* Refusée, la modification referme la cellule sur la valeur enregistrée, avec son message : rien n'est avalé. */
    setEditing(false);
    if (accepted) following?.focus();
  }

  if (!isInlineEditable(field)) {
    return (
      <span className="block truncate" title={text}>
        {text}
      </span>
    );
  }

  if (!editing) {
    return (
      <>
        <button
          type="button"
          data-cell={key}
          className="w-full truncate rounded-sm px-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          title={text}
          aria-label={`${field.label} : ${text}`}
          onDoubleClick={() => {
            cancelled.current = false;
            setEditing(true);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            cancelled.current = false;
            setEditing(true);
          }}
        >
          {text}
        </button>
        {error && (
          <p role="alert" className="px-1 text-xs text-danger">
            {error}
          </p>
        )}
      </>
    );
  }

  if (field.type === "list") {
    return (
      <select
        autoFocus
        data-cell={key}
        aria-label={field.label}
        className={CONTROL}
        defaultValue={saved}
        onChange={(event) => void commit(event.target.value, false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancel();
        }}
        onBlur={() => setEditing(false)}
      >
        <option value="">—</option>
        {(field.values ?? []).map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    );
  }

  return <InlineTextInput cellKey={key} field={field} saved={saved} cancelled={cancelled} onCommit={commit} onCancel={cancel} />;
}

type TextProps = {
  cellKey: string;
  field: FieldDescriptor;
  saved: string;
  cancelled: { current: boolean };
  onCommit: (value: string, advance: boolean) => Promise<void>;
  onCancel: () => void;
};

/** Champ d'une cellule texte : Entrée enregistre et referme, Tab enregistre et avance, Échap annule. */
function InlineTextInput({ cellKey, field, saved, cancelled, onCommit, onCancel }: TextProps) {
  const [draft, setDraft] = useState(saved);
  return (
    <input
      autoFocus
      data-cell={cellKey}
      aria-label={field.label}
      className={CONTROL}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
        else if (event.key === "Enter") {
          event.preventDefault();
          void onCommit(draft.trim(), false);
        } else if (event.key === "Tab" && !event.shiftKey) {
          event.preventDefault();
          void onCommit(draft.trim(), true);
        }
      }}
      onBlur={() => {
        if (!cancelled.current) void onCommit(draft.trim(), false);
      }}
    />
  );
}
