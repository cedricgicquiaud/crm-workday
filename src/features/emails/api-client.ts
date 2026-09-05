"use client";

/** Appels des API d'emails et du cabinet depuis les écrans : une réponse en erreur devient un message lisible. */
export type ApiFailure = { error?: string; message: string; variable?: string };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

export async function callApi<T = unknown>(path: string, init: { method: string; body?: unknown } = { method: "GET" }): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: init.method,
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiFailure>) | null;
  if (res.ok) return { ok: true, data: body as T };
  return { ok: false, failure: { error: body?.error, message: body?.message ?? "L'action a échoué. Réessayez.", variable: body?.variable } };
}
