/**
 * Client du tableau de bord admin (/admin) : routes /api/admin/* du backend,
 * protegees par le mot de passe ADMIN_TOKEN (backend/.env).
 */

import { API_BASE_URL, ApiError, GENERIC_ERROR_MESSAGE } from "./api";

export interface AdminKpis {
  questions: number;
  users: number;
  sessions: number;
  answer_rate: number;
  no_data: number;
  voice_share: number;
  avg_latency_ms: number | null;
  p90_latency_ms: number | null;
  /** Part des reponses servies depuis le cache (sans appel au modele). */
  cache_rate: number;
  details_opened: number;
  details_rate: number;
  /** Clics sur « Réponse audio » (hors lecture automatique des questions vocales). */
  listens: number;
  errors: number;
  error_rate: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface CountedQuestion {
  question: string;
  count: number;
  last_ts: number;
}

export interface AdminStats {
  period_days: number | null;
  generated_at: number;
  kpis: AdminKpis;
  per_day: { date: string; total: number; answered: number; no_data: number }[];
  per_hour: { hour: number; total: number }[];
  languages: { language: string; total: number }[];
  modes: { mode: string; total: number }[];
  topics: { topic: string; total: number }[];
  top_questions: CountedQuestion[];
  unanswered: CountedQuestion[];
  top_sources: { title: string; total: number }[];
}

export type QuestionStatus = "all" | "answered" | "no_data" | "error";

export interface LoggedQuestion {
  ts: number;
  question: string;
  language: string;
  mode: string | null;
  answered: number | null;
  error: number;
  latency_ms: number | null;
}

const TOKEN_KEY = "ansd-rag:admin-token";

export function loadAdminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveAdminToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // stockage indisponible : il faudra se reconnecter a chaque visite
  }
}

async function adminGet<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (!res.ok) {
    let detail = GENERIC_ERROR_MESSAGE;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // reponse non JSON
    }
    throw new ApiError(detail, res.status);
  }
  return res.json();
}

/** `days` = 0 pour toute la periode. */
export function fetchAdminStats(token: string, days: number): Promise<AdminStats> {
  return adminGet(`/api/admin/stats?days=${days}`, token);
}

export function fetchAdminQuestions(
  token: string,
  days: number,
  status: QuestionStatus,
  offset: number,
  limit = 20
): Promise<{ total: number; items: LoggedQuestion[] }> {
  return adminGet(`/api/admin/questions?days=${days}&status=${status}&offset=${offset}&limit=${limit}`, token);
}
