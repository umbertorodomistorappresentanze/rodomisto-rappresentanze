// API client. Reads the JWT from secure storage and attaches it to every call.
import { storage } from "@/src/utils/storage";

// URL base del backend.
// - Anteprima Emergent: EXPO_PUBLIC_BACKEND_URL è impostata (.env) → la usa.
// - Produzione web (Vercel): se la variabile è vuota, malformata (es. link
//   Markdown "[url](url)"), o punta per errore al dominio frontend (*.vercel.app),
//   si forza/pulisce verso il backend su Render per evitare "Errore di rete",
//   404 o "URL is not valid" causati da valori non puliti.
const RENDER_BACKEND = "https://rodomisto-backend.onrender.com";

// Estrae un URL http(s) pulito da una stringa che potrebbe contenere spazi,
// un link Markdown [testo](https://...), apici o slash finali.
function cleanUrl(raw: string): string {
  let s = (raw || "").trim();
  const md = s.match(/\((https?:\/\/[^)]+)\)/); // [testo](https://...)
  if (md) s = md[1];
  const m = s.match(/https?:\/\/[^\s\])}>'"`]+/); // prima occorrenza di http(s)://...
  if (m) s = m[0];
  return s.replace(/\/+$/, ""); // rimuove gli slash finali
}

function resolveBase(): string {
  const env = cleanUrl(process.env.EXPO_PUBLIC_BACKEND_URL || "");
  if (!env) return RENDER_BACKEND;
  if (/vercel\.app/i.test(env)) return RENDER_BACKEND;
  // Se, dopo la pulizia, non è un URL http(s) valido → fallback su Render.
  if (!/^https?:\/\//i.test(env)) return RENDER_BACKEND;
  return env;
}
const BASE = resolveBase();
export const TOKEN_KEY = "agendavisite_token";

export type ApiError = { status: number; detail: string };

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function handle(res: Response) {
  if (res.status === 401) {
    await storage.secureRemove(TOKEN_KEY);
  }
  if (!res.ok) {
    let detail = "Errore di rete";
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore
    }
    const err: ApiError = { status: res.status, detail };
    throw err;
  }
  return res;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { headers: await authHeaders() });
  await handle(res);
  return res.json();
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  await handle(res);
  return res.json();
}

export async function apiPut<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "PUT",
    headers: await authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  await handle(res);
  return res.json();
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  await handle(res);
  return res.json();
}

export function exportUrl(path: string): string {
  return `${BASE}/api${path}`;
}

export async function loginRequest(username: string, password: string) {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password: password.trim() }),
    });
  } catch (e: any) {
    // fetch lancia (rete/CORS/DNS/mixed-content) PRIMA di ricevere una risposta:
    // esponiamo l'URL di destinazione e il messaggio reale per facilitare la diagnosi.
    const err: ApiError = { status: 0, detail: `Connessione a ${BASE} fallita: ${e?.message || e}` };
    throw err;
  }
  await handle(res);
  return res.json();
}

// ---- Types ----
export type Giro = { id: string; name: string; localities: string[]; order: number; active: boolean; client_count?: number };
export type Company = { id: string; name: string; active: boolean; order: number };
export type ClientExtra = Record<string, string>;
export type Client = {
  id: string;
  ragione_sociale: string;
  provincia: string;
  giro_id: string | null;
  position: number | null;
  citta: string;
  zona: string;
  indirizzo: string;
  cap: string;
  telefono: string;
  email: string;
  agent: string;
  permanent_note: string;
  last_visit_at: string | null;
  last_order_at?: string | null;
  last_collection_at?: string | null;
  snoozed_until: string | null;
  extra: ClientExtra;
  status?: "da_visitare" | "gestito";
  handled_this_month?: boolean;
  suspensions?: string[];
  partita_iva?: string;
  duplicates?: { id: string; ragione_sociale: string; citta: string; agent: string }[];
};
export type PaymentMode = { key: string; label: string; days: number | null };

export type Activity = {
  id: string;
  type: "order" | "collection" | "suspension" | "reschedule";
  type_label: string;
  created_at: string;
  agent: string | null;
  client_ragione_sociale: string;
  context: string;
  giro_name: string | null;
  citta: string;
  company_name: string | null;
};

export type VisitEvent = {
  id: string;
  client_id: string;
  type: "visit" | "order" | "reschedule" | "collection" | "note" | "recurrence_order";
  company_id: string | null;
  company_name: string | null;
  note_text: string | null;
  reschedule_until: string | null;
  agent: string | null;
  created_at: string;
  recurrence_company?: string | null;
  recurrence_period?: string | null;
  payment_mode?: string | null;
  payment_mode_label?: string | null;
  due_at?: string | null;
};

export type Suspension = {
  client_id: string;
  ragione_sociale: string;
  citta: string;
  agent: string;
  giro_name: string | null;
  company_name: string;
  company_id: string | null;
  kind: "overdue" | "due_soon";
  due_at: string | null;
  since: string | null;
  event_id: string;
  event_type: "order" | "suspension";
  payment_mode: string | null;
};

export type PendingSuspension = {
  company_name: string;
  company_id: string | null;
  kind: "overdue" | "pending";
  due_at: string | null;
  since: string | null;
};

export type RecurrencePeriod = { key: string; label: string; start: string; end: string };
export type RecurrenceDef = {
  id: string;
  company: string;
  label: string;
  periods: RecurrencePeriod[];
  groups: string[];
  order: number;
};
export type RecurrenceClient = Client & {
  recurrence_status: "da_gestire" | "ordine_effettuato";
  order_date: string | null;
  member_id: string;
};
export type RecurrenceGroup = { group: string; clients: RecurrenceClient[] };
export type RecurrenceMembers = { company: string; period: string; groups: RecurrenceGroup[] };
