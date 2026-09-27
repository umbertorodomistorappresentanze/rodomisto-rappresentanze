import { dmyDate } from "@/src/format";

type LastActionDates = {
  last_visit_at?: string | null;
  last_order_at?: string | null;
  last_collection_at?: string | null;
};

/**
 * "Ultima azione" persistente del cliente. Mostra UNA sola dicitura tra:
 *  - "Ordine effettuato il GG/MM/AAAA"
 *  - "Incassato il GG/MM/AAAA"
 *  - "Ultima visita il GG/MM/AAAA"
 *  - "Mai visitato"
 * scegliendo l'azione con data più recente.
 */
export function lastActionLabel(d: LastActionDates): string {
  const ts = (v?: string | null) => (v ? new Date(v).getTime() : null);
  const items = [
    { kind: "order", at: d.last_order_at, ts: ts(d.last_order_at) },
    { kind: "collection", at: d.last_collection_at, ts: ts(d.last_collection_at) },
    { kind: "visit", at: d.last_visit_at, ts: ts(d.last_visit_at) },
  ].filter((i) => i.ts !== null) as { kind: string; at: string; ts: number }[];

  if (items.length === 0) return "Mai visitato";
  items.sort((a, b) => b.ts - a.ts);
  const top = items[0];
  if (top.kind === "order") return `Ordine effettuato il ${dmyDate(top.at)}`;
  if (top.kind === "collection") return `Incassato il ${dmyDate(top.at)}`;
  return `Ultima visita il ${dmyDate(top.at)}`;
}
