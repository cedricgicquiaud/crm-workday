/**
 * Règle d'échéance des tâches (D13), source unique de l'API, de la bannière et de l'écran : une
 * tâche est **échue à partir du lendemain 00:00, heure de Paris**. Une tâche qui échoit aujourd'hui
 * ne l'est donc pas, et le basculement suit le fuseau de l'équipe, jamais UTC.
 */

import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { activity } from "@/db/schema";
import { db } from "@/lib/db";
import { TASK } from "./schema";

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Jour courant à Paris, en `AAAA-MM-JJ` — la forme même des échéances enregistrées. */
export const parisDay = (at: Date = new Date()): string => PARIS_DAY.format(at);

/** Vrai si l'échéance est passée : elle est antérieure au jour courant à Paris. */
export const isOverdue = (dueDate: string | null, at: Date = new Date()): boolean => dueDate !== null && dueDate < parisDay(at);

export type OverdueTask = { id: string; title: string | null; dueDate: string | null };

/** Tâches d'une fiche encore à faire dont l'échéance est passée, la plus ancienne d'abord (D13). */
export async function overdueTasks(objectType: string, objectId: string, at: Date = new Date()): Promise<OverdueTask[]> {
  return db
    .select({ id: activity.id, title: activity.title, dueDate: activity.dueDate })
    .from(activity)
    .where(and(eq(activity.objectType, objectType), eq(activity.objectId, objectId), eq(activity.type, TASK), isNull(activity.doneAt), lt(activity.dueDate, parisDay(at))))
    .orderBy(asc(activity.dueDate));
}
