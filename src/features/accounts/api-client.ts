"use client";

/** Appels des API de comptes depuis l'écran : une réponse en erreur devient un message lisible. */
export type ApiFailure = { message: string; status?: string; accountId?: string; name?: string };

export async function callApi(path: string, init: { method: string; body?: unknown }): Promise<{ ok: true } | { ok: false; failure: ApiFailure }> {
  const res = await fetch(path, {
    method: init.method,
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as Partial<ApiFailure> | null;
  return { ok: false, failure: { message: body?.message ?? "L'action a échoué. Réessayez.", status: body?.status, accountId: body?.accountId, name: body?.name } };
}
