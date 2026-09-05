"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EmailTemplate } from "@/lib/mail/templates";
import { callApi } from "./api-client";
import { templateLabel, VARIABLE_HELP } from "./labels";
import { FieldError, OutcomeMessage, type Outcome } from "./outcome";

type Props = { templates: EmailTemplate[] };
type Text = { subject: string; body: string };
type Preview = { subject: string; html: string };
type TextField = keyof Text;

const PREVIEW_DELAY_MS = 300;

/**
 * Paramètres → Modèles d'emails (D22) : la liste, puis l'éditeur du modèle choisi sur la même page
 * (édition longue en page, fondations « Formulaires ») : sujet et corps à gauche, variables et aperçu à droite.
 */
export function TemplatesScreen({ templates }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = templates.find((t) => t.key === selectedKey) ?? null;
  return (
    <div className="grid gap-6">
      <ul aria-label="Modèles d'emails" className="grid">
        {templates.map((template) => (
          <li key={template.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b py-2">
            <div className="grid min-w-0 gap-0.5">
              <div className="flex items-center gap-2">
                <p className="font-medium">{templateLabel(template.key)}</p>
                {template.isSystem && (
                  <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                    Système
                  </Badge>
                )}
              </div>
              <p className="truncate text-sm text-muted-foreground">{template.subject}</p>
            </div>
            <Button variant="outline" size="sm" aria-label={`Modifier ${templateLabel(template.key)}`} aria-pressed={template.key === selectedKey} onClick={() => setSelectedKey(template.key)}>
              Modifier
            </Button>
          </li>
        ))}
      </ul>
      {selected && <TemplateEditor key={selected.key} template={selected} />}
    </div>
  );
}

/** Aperçu du texte saisi, recalculé côté serveur après une courte pause de frappe. */
function usePreview(text: Text): Preview | null {
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await callApi<Preview>("/api/emails/apercu", { method: "POST", body: text });
      if (!cancelled && result.ok) setPreview(result.data);
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);
  return preview;
}

function TemplateEditor({ template }: { template: EmailTemplate }) {
  const router = useRouter();
  const label = templateLabel(template.key);
  const [text, setText] = useState<Text>({ subject: template.subject, body: template.body });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TextField, string>>>({});
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, setPending] = useState(false);
  const preview = usePreview(text);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOutcome(null);
    setFieldErrors({});
    setPending(true);
    const result = await callApi(`/api/emails/modeles/${encodeURIComponent(template.key)}`, { method: "PUT", body: text });
    setPending(false);
    if (result.ok) {
      setOutcome({ kind: "status", text: `Modèle « ${label} » enregistré.` });
      return router.refresh();
    }
    /* Une variable refusée se signale sous le champ qui la porte ; par défaut sous le corps. */
    const { variable, message } = result.failure;
    const field: TextField = variable && text.subject.includes(`{{${variable}}}`) && !text.body.includes(`{{${variable}}}`) ? "subject" : "body";
    if (result.failure.error === "variable_inconnue" || result.failure.error === "variable_obligatoire_absente") setFieldErrors({ [field]: message });
    else setOutcome({ kind: "alert", text: message });
  }

  return (
    <form className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label={`Modèle ${label}`} onSubmit={onSubmit} noValidate>
      <div className="grid content-start gap-4">
        <h3 className="text-base font-medium">{label}</h3>
        <div className="grid gap-2">
          <Label htmlFor="template-subject">Sujet</Label>
          <Input
            id="template-subject"
            name="subject"
            value={text.subject}
            onChange={(e) => setText({ ...text, subject: e.target.value })}
            required
            aria-invalid={fieldErrors.subject ? true : undefined}
            aria-describedby={fieldErrors.subject ? "template-subject-error" : undefined}
          />
          <FieldError id="template-subject-error" text={fieldErrors.subject} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="template-body">Corps</Label>
          <Textarea
            id="template-body"
            name="body"
            rows={12}
            value={text.body}
            onChange={(e) => setText({ ...text, body: e.target.value })}
            required
            aria-invalid={fieldErrors.body ? true : undefined}
            aria-describedby={fieldErrors.body ? "template-body-error" : "template-body-help"}
          />
          <FieldError id="template-body-error" text={fieldErrors.body} />
          {!fieldErrors.body && (
            <p id="template-body-help" className="text-xs text-muted-foreground">
              Une ligne vide sépare les paragraphes ; le premier est le titre. Un paragraphe <code>[Libellé]({"{{lien}}"})</code> devient un bouton.
            </p>
          )}
        </div>
        <OutcomeMessage outcome={outcome} />
        <div>
          <Button type="submit" disabled={pending}>
            Enregistrer
          </Button>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="grid gap-2">
          <h4 className="text-sm font-medium">Variables disponibles</h4>
          <ul aria-label="Variables disponibles" className="grid gap-1 text-sm">
            {VARIABLE_HELP.map((v) => (
              <li key={v.name} className="flex flex-wrap items-baseline gap-x-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{`{{${v.name}}}`}</code>
                <span className="text-muted-foreground">
                  {v.help}
                  {template.requiredVariables.includes(v.name) ? " — obligatoire" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2">
          <h4 className="text-sm font-medium">Aperçu</h4>
          <p className="text-sm">
            <span className="text-muted-foreground">Sujet : </span>
            {preview?.subject ?? "…"}
          </p>
          <iframe
            title="Aperçu du modèle"
            sandbox=""
            srcDoc={preview?.html ?? ""}
            className="h-96 w-full rounded-lg border bg-white"
          />
          <p className="text-xs text-muted-foreground">Rendu avec des valeurs d&apos;exemple.</p>
        </div>
      </div>
    </form>
  );
}
