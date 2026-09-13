// API client. Reads the JWT from secure storage and attaches it to every call.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
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

export function exportUrl(path: string): string {
  return `${BASE}/api${path}`;
}

export async function loginRequest(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  await handle(res);
  return res.json();
}

// ---- Types ----
export type Giro = { id: string; name: string; localities: string[]; order: number; active: boolean };
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
  snoozed_until: string | null;
  extra: ClientExtra;
  status?: "da_visitare" | "gestito";
  handled_today?: boolean;
};
export type VisitEvent = {
  id: string;
  client_id: string;
  type: "visit" | "order" | "reschedule" | "collection" | "note";
  company_id: string | null;
  company_name: string | null;
  note_text: string | null;
  reschedule_until: string | null;
  agent: string | null;
  created_at: string;
};
