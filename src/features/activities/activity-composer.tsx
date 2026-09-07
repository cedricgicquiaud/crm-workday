"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { UserOption } from "@/features/objects/labels";
import { activityTypes, TASK } from "./schema";

type Props = { type: string; id: string; users: readonly UserOption[]; currentUserId: string };

const PLACEHOLDERS: Record<string, string> = { note: "Écrire une note…", appel: "Résumer l'appel…", reunion: "Résumer la réunion…" };

const FAILED = "L'activité n'a pas pu être enregistrée.";

/**
 * Composeur du fil (fondations « Fil d'activité ») : un type choisi parmi ceux déclarés, puis le
 * texte de la note, de l'appel ou de la réunion, ou le titre, l'échéance et le responsable d'une
 * tâche (responsable pré-rempli avec l'utilisateur connecté). « Enregistrer » reste éteint tant que
 * le champ obligatoire du type choisi est vide : rien d'incomplet ne part au serveur (contrat 16).
 * Aucun échec n'est avalé : le message du serveur s'affiche sous le formulaire (`role="alert"`) et
 * la saisie reste en place. Le fil ne se rafraîchit qu'après la réponse 2xx.
 */
export function ActivityComposer({ type, id, users, currentUserId }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState(activityTypes()[0].key);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isTask = kind === TASK;
  const kindLabel = activityTypes().find((activityType) => activityType.key === kind)!.label;
  const incomplete = isTask ? title.trim() === "" : body.trim() === "";

  async function save() {
    setSaving(true);
    const payload = isTask ? { type: kind, title, dueDate: dueDate || null, assigneeId } : { type: kind, body };
    let res: Response;
    try {
      res = await fetch(`/api/objets/${encodeURIComponent(type)}/${encodeURIComponent(id)}/activites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    } catch {
      setSaving(false);
      setError(FAILED);
      return;
    }
    const answer = (await res.json().catch(() => null)) as { message?: string } | null;
    setSaving(false);
    if (!res.ok) {
      setError(answer?.message ?? FAILED);
      return;
    }
    setError(null);
    setBody("");
    setTitle("");
    setDueDate("");
    router.refresh();
  }

  return (
    <div role="group" aria-label="Nouvelle activité" className="grid gap-2 rounded-lg border border-border bg-card p-2">
      <div className="flex flex-wrap gap-1">
        {activityTypes().map((activityType) => (
          <button
            key={activityType.key}
            type="button"
            aria-pressed={activityType.key === kind}
            onClick={() => setKind(activityType.key)}
            className={`h-6 rounded-md px-2 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${activityType.key === kind ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {activityType.label}
          </button>
        ))}
      </div>
      {isTask ? (
        <div className="grid gap-2">
          <div className="grid gap-1">
            <Label htmlFor="activite-titre">Titre</Label>
            <Input id="activite-titre" className="h-7" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="activite-echeance">Échéance</Label>
            <Input id="activite-echeance" type="date" className="h-7 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="activite-responsable">Responsable</Label>
            <Select items={users.map((option) => ({ value: option.id, label: option.name }))} value={assigneeId} onValueChange={(next) => next && setAssigneeId(next)}>
              <SelectTrigger id="activite-responsable" aria-label="Responsable" size="sm" className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {users.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="grid gap-1">
          <Label htmlFor="activite-texte">{kindLabel}</Label>
          <Textarea id="activite-texte" rows={3} placeholder={PLACEHOLDERS[kind] ?? "Écrire…"} value={body} onChange={(event) => setBody(event.target.value)} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={incomplete || saving} onClick={() => void save()}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
