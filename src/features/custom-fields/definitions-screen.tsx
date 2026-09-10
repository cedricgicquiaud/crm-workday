"use client";

import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOM_FIELD_LABEL_MAX, type CustomFieldDefinition, type CustomFieldType } from "@/features/custom-fields/fields-source";

/** Un objet du registre tel que l'écran le propose : sa clé et son libellé au pluriel. */
export type FieldObject = { key: string; label: string };

type Props = { objects: readonly FieldObject[]; fields: readonly CustomFieldDefinition[] };

/** Les quatre types, dans l'ordre où ils se choisissent ; le libellé est celui que lit un administrateur. */
const TYPE_LABELS: Record<CustomFieldType, string> = { text: "Texte", list: "Liste à choix unique", date: "Date", number: "Nombre" };

const FAILED = "La modification n'a pas pu être enregistrée.";

/** Refus du serveur : message global et erreurs par champ (400, 409). */
type Failure = { message: string; fields?: Record<string, string> };

/** Envoie une écriture et rend le refus, ou rien : aucun échec n'est avalé (fondations « Signalement »). */
async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<Failure | null> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { message: FAILED };
  }
  if (res.ok) return null;
  const refusal = (await res.json().catch(() => null)) as (Failure & { fields?: Record<string, string> }) | null;
  return { message: refusal?.message ?? FAILED, fields: refusal?.fields };
}

/**
 * Écran Paramètres → Champs (CRM-54) : un administrateur définit par objet les champs que le code ne
 * connaît pas — libellé, type, valeurs, obligation, rang — puis les modifie, les réordonne et les
 * archive. Un champ ne se supprime jamais : les fiches qui portent une valeur la gardent lisible.
 * Rien n'est en tableau : à 375 px chaque champ s'empile, sans défilement horizontal.
 */
export function DefinitionsScreen({ objects, fields }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /** Après chaque écriture acceptée, la liste est relue côté serveur : l'écran suit la base, jamais l'inverse. */
  async function write(url: string, method: "POST" | "PATCH", body: unknown): Promise<boolean> {
    const refusal = await send(url, method, body);
    setFailure(refusal?.message ?? null);
    if (refusal) return false;
    router.refresh();
    return true;
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-medium">Champs personnalisés</h2>
          <p className="text-sm text-muted-foreground">{fields.length === 1 ? "1 champ" : `${fields.length} champs`}</p>
        </div>
        <Button onClick={() => setCreating(true)}>Nouveau champ</Button>
      </div>
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}

      {objects.map((object) => (
        <section key={object.key} aria-label={object.label} className="grid gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{object.label}</h3>
          <FieldsList object={object} fields={fields.filter((field) => field.objectType === object.key)} onWrite={write} />
        </section>
      ))}

      <NewFieldDialog objects={objects} open={creating} onOpenChange={setCreating} onCreated={() => router.refresh()} />
    </div>
  );
}

type ListProps = { object: FieldObject; fields: readonly CustomFieldDefinition[]; onWrite: (url: string, method: "PATCH", body: unknown) => Promise<boolean> };

/** Les champs d'un objet, dans l'ordre choisi ; chaque champ tient dans une carte plutôt qu'une ligne de tableau. */
function FieldsList({ object, fields, onWrite }: ListProps) {
  if (fields.length === 0) return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{`Aucun champ personnalisé sur ${object.label.toLowerCase()}.`}</p>;
  return (
    <ul data-slot="fields-list" aria-label={`Champs — ${object.label}`} className="grid gap-2">
      {fields.map((field, index) => (
        <FieldRow key={field.id} field={field} first={index === 0} last={index === fields.length - 1} onWrite={onWrite} />
      ))}
    </ul>
  );
}

type RowProps = { field: CustomFieldDefinition; first: boolean; last: boolean; onWrite: (url: string, method: "PATCH", body: unknown) => Promise<boolean> };

/** Un champ défini : son libellé se renomme sur place, ses valeurs se retirent une à une, son rang se déplace d'un cran. */
function FieldRow({ field, first, last, onWrite }: RowProps) {
  const [label, setLabel] = useState(field.label);
  const [added, setAdded] = useState("");
  const patch = (body: unknown) => onWrite(`/api/champs/${field.id}`, "PATCH", body);
  const labelId = `champ-${field.id}-libelle`;

  async function rename() {
    if (label.trim() === field.label) return;
    if (!(await patch({ label: label.trim() }))) setLabel(field.label);
  }

  return (
    <li className="grid min-w-0 gap-2 rounded-lg border p-2.5">
      {/* Le nom ne descend pas sous 12 rem : à 375 px, il garde sa ligne et le badge, les flèches et
          « Archiver » passent dessous — sans plancher, il tombait à quelques pixels (« S… »). */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {field.archived ? (
          <p id={labelId} className="min-w-48 flex-1 truncate text-sm font-medium" title={field.label}>
            {field.label}
          </p>
        ) : (
          <Input
            id={labelId}
            aria-label={`Libellé du champ ${field.label}`}
            className="h-7 min-w-48 flex-1 truncate"
            value={label}
            maxLength={CUSTOM_FIELD_LABEL_MAX}
            title={label}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          />
        )}
        <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
          {TYPE_LABELS[field.type]}
        </Badge>
        {field.archived && <Badge variant="outline" className="border-border">Archivé</Badge>}
        <Button variant="ghost" size="icon-xs" aria-label={`Monter le champ ${field.label}`} disabled={first} onClick={() => void patch({ move: "up" })}>
          <ArrowUpIcon aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label={`Descendre le champ ${field.label}`} disabled={last} onClick={() => void patch({ move: "down" })}>
          <ArrowDownIcon aria-hidden />
        </Button>
        {/* Le libellé du champ est de longueur libre : il nomme le bouton pour un lecteur d'écran, il n'y est pas écrit. */}
        <Button variant="outline" size="sm" aria-label={`${field.archived ? "Restaurer" : "Archiver"} le champ ${field.label}`} onClick={() => void patch({ archived: !field.archived })}>
          {field.archived ? "Restaurer" : "Archiver"}
        </Button>
      </div>

      {!field.archived && (
        <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={field.required} aria-label={`Obligatoire — ${field.label}`} onCheckedChange={(checked) => void patch({ required: checked === true })} />
          Obligatoire à la création d&apos;une fiche
        </label>
      )}

      {field.type === "list" && (
        <div className="grid gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {field.values.map((value) => (
              <span key={value} className="inline-flex h-6 max-w-[18rem] items-center gap-1 rounded-full border bg-muted/40 pr-0.5 pl-2.5 text-xs">
                <span className="truncate" title={value}>
                  {value}
                </span>
                {!field.archived && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="relative size-5 rounded-full after:absolute after:-inset-1 after:content-['']"
                    aria-label={`Retirer la valeur ${value} du champ ${field.label}`}
                    onClick={() => void patch({ values: field.values.filter((entry) => entry !== value) })}
                  >
                    <XIcon aria-hidden />
                  </Button>
                )}
              </span>
            ))}
            {field.retiredValues.map((value) => (
              <span key={value} className="inline-flex h-6 max-w-[18rem] items-center rounded-full border border-dashed px-2.5 text-xs text-muted-foreground" title={`${value} (retirée)`}>
                <span className="truncate">{`${value} (retirée)`}</span>
              </span>
            ))}
          </div>
          {!field.archived && (
            <form
              className="flex items-center gap-1.5"
              onSubmit={async (event) => {
                event.preventDefault();
                if (added.trim() === "") return;
                if (await patch({ values: [...field.values, added.trim()] })) setAdded("");
              }}
            >
              <Input aria-label={`Nouvelle valeur du champ ${field.label}`} className="h-7 max-w-64" value={added} onChange={(event) => setAdded(event.target.value)} />
              <Button type="submit" variant="secondary" size="sm" aria-label={`Ajouter une valeur au champ ${field.label}`} disabled={added.trim() === ""}>
                Ajouter la valeur
              </Button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

type DialogProps = { objects: readonly FieldObject[]; open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void };

/** Contrôle de 32 px des fondations, pour les listes déroulantes natives du formulaire. */
const CONTROL = "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Création d'un champ en Dialog (fondations « Formulaires ») : libellé au-dessus, refus sous le champ. */
function NewFieldDialog({ objects, open, onOpenChange, onCreated }: DialogProps) {
  const [objectType, setObjectType] = useState(objects[0]?.key ?? "");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [values, setValues] = useState("");
  const [required, setRequired] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  function reset(next: boolean) {
    onOpenChange(next);
    if (next) return;
    setLabel("");
    setType("text");
    setValues("");
    setRequired(false);
    setErrors({});
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const refusal = await send("/api/champs", "POST", { objectType, label, type, required, values: values.split("\n").map((entry) => entry.trim()).filter((entry) => entry !== "") });
    setPending(false);
    if (refusal) return setErrors(refusal.fields ?? { label: refusal.message });
    reset(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      {/* Pas de croix (elle n'aurait pour nom que « Close ») : « Annuler » et Échap ferment. */}
      <DialogContent showCloseButton={false}>
        <form data-slot="field-form" className="grid gap-4" onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Nouveau champ</DialogTitle>
            <DialogDescription>Le champ s&apos;ajoute à toutes les fiches de l&apos;objet choisi. Échap pour fermer.</DialogDescription>
          </DialogHeader>

          <Field id="champ-objet" label="Objet" error={errors.objectType}>
            <select id="champ-objet" className={CONTROL} value={objectType} onChange={(event) => setObjectType(event.target.value)}>
              {objects.map((object) => (
                <option key={object.key} value={object.key}>
                  {object.label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="champ-libelle" label="Libellé" error={errors.label}>
            <Input id="champ-libelle" value={label} maxLength={CUSTOM_FIELD_LABEL_MAX} autoComplete="off" aria-invalid={errors.label ? true : undefined} aria-describedby={errors.label ? "champ-libelle-error" : undefined} onChange={(event) => setLabel(event.target.value)} />
          </Field>

          <Field id="champ-type" label="Type" error={errors.type}>
            <select id="champ-type" className={CONTROL} value={type} onChange={(event) => setType(event.target.value as CustomFieldType)}>
              {Object.entries(TYPE_LABELS).map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          </Field>

          {type === "list" && (
            <Field id="champ-valeurs" label="Valeurs" error={errors.values}>
              <Textarea id="champ-valeurs" rows={3} value={values} placeholder={"Une valeur par ligne"} onChange={(event) => setValues(event.target.value)} />
            </Field>
          )}

          <label className="flex w-fit items-center gap-2 text-sm">
            <Checkbox checked={required} aria-label="Obligatoire" onCheckedChange={(checked) => setRequired(checked === true)} />
            Obligatoire à la création d&apos;une fiche
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => reset(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Libellé au-dessus (12 px / 500), erreur en dessous (11 px). */
function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
