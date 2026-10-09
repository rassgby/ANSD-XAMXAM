/**
 * Typed client for the XAM-XAM backend (../../backend). Shapes mirror
 * backend/app/schemas.py exactly.
 *
 * NEXT_PUBLIC_API_URL is inlined into the browser bundle at build time (a
 * Next.js requirement for NEXT_PUBLIC_* vars — see frontend/README.md), so
 * it must be set before `next build` runs, not just at container start.
 */

export type Language = "fr" | "wo" | "en" | "ff" | "srr" | "dyo";

export interface Citation {
  document_id: string;
  document_title: string;
  /** Adresse officielle du PDF sur ansd.sn (absente des reponses plus anciennes). */
  url?: string | null;
  quote: string;
  page_start: number | null;
  page_end: number | null;
  /** Checked by the backend against the real, OCR'd page text — Mistral
   * itself doesn't guarantee a citation is real (unlike Claude's native
   * grounded citations). false means the model claimed a source the backend
   * could not confirm word-for-word. See backend/README.md. */
  verified: boolean;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface QueryResponse {
  question: string;
  /** Question de suite reformulee de maniere autonome par le backend (ex.
   * « et en 2024 ? » → « Quelle est la croissance du PIB en 2024 ? »). */
  standalone_question?: string | null;
  /** answer : reponse tiree des publications ; no_data : rien dans le corpus ;
   * chat : conversation courante (« bonjour », « merci »…) ; guide : conseils et
   * etapes pour mener ses recherches, avec un lien vers chaque publication recommandee. */
  kind?: "answer" | "no_data" | "chat" | "guide";
  language: string;
  answered: boolean;
  answer: string;
  citations: Citation[];
  sources_used: string[];
  model: string;
  usage: Usage;
  /** Reponses « guide » : publications recommandees, referencees [[n]] dans le texte. */
  sources?: DetailSource[];
  /** Langues traduites automatiquement (wolof, pulaar) : la reponse francaise d origine. */
  original_answer?: string | null;
}

export interface SourceDocument {
  id: string;
  title: string;
  publisher: string;
  publication_date: string;
  filename: string;
  description: string;
}

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

/** The only error text ever shown to a user for a failure on our end —
 * network failure, backend down, anything the backend itself couldn't name
 * either (see backend/app/messages.py, which the backend's own `detail`
 * field already carries this same generic text from). Deliberately never
 * mentions a provider, a service name, a status code, or any other
 * implementation detail. */
export const GENERIC_ERROR_MESSAGE = "Un bug est survenu. Veuillez réessayer.";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Identifiant anonyme et aleatoire du navigateur, envoye avec chaque
 * question pour compter les utilisateurs uniques dans le tableau de bord
 * admin. Aucune donnee personnelle : un simple UUID garde en local. */
function clientId(): string | undefined {
  try {
    const KEY = "ansd-rag:client-id";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** Contexte d'usage joint aux appels (statistiques du tableau de bord). */
/** Source d'une reponse (document + page), renvoyee au backend pour que les
 * questions de suite et « Voir plus » cherchent d'abord la. */
/** Source citee dans le texte d'une explication detaillee (marqueur [[n]]). */
export interface DetailSource {
  n: number;
  title: string;
  page: number | null;
  url: string | null;
}

export interface ExplainResult {
  details: string;
  sources: DetailSource[];
}

export interface SourceRef {
  title: string;
  page: number | null;
}

/** Echange precedent de la discussion, envoye avec une question de suite. */
export interface HistoryTurn {
  question: string;
  answer: string;
  sources: SourceRef[];
}

export function sourcesOf(response: QueryResponse): SourceRef[] {
  return response.citations.map((c) => ({ title: c.document_title, page: c.page_start }));
}

export interface UsageContext {
  /** Discussion a laquelle appartient l'appel. */
  sessionId?: string;
  /** Question posee a l'ecrit ou a voix haute. */
  mode?: "text" | "voice";
  /** « Relancer » : nouvelle reponse plutot que celle deja en cache. */
  regenerate?: boolean;
}

function jsonHeaders(ctx?: UsageContext): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const id = clientId();
  if (id) headers["X-Client-Id"] = id;
  if (ctx?.sessionId) headers["X-Session-Id"] = ctx.sessionId;
  return headers;
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // response wasn't JSON — fall through to the generic message
  }
  return GENERIC_ERROR_MESSAGE;
}

export async function askQuestion(
  question: string,
  language: Language,
  ctx?: UsageContext,
  history?: HistoryTurn[]
): Promise<QueryResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/query`, {
      method: "POST",
      headers: jsonHeaders(ctx),
      body: JSON.stringify({
        question,
        language,
        mode: ctx?.mode ?? "text",
        history: history ?? [],
        regenerate: ctx?.regenerate ?? false,
      }),
    });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  return res.json();
}

/** Rappels pendant une reponse en flux : texte recu jusqu'ici (marqueurs [n] compris),
 * puis etape en cours (« search » : recherche dans les publications). */
export interface StreamHandlers {
  onText?: (text: string) => void;
  onStatus?: (status: string) => void;
}

/** Retire les references [n] du texte en cours de reception, y compris une reference
 * coupee en fin de morceau (« [1 »). Les sources s'affichent a part, une fois la reponse finie. */
export function stripStreamMarkers(text: string): string {
  return text
    .replace(/\s*\[(?:Sources?\s*)?\d+(?:\s*[,;]\s*\d+)*\]/gi, "")
    .replace(/\s*\[(?:S[a-z]*\s*)?[\d,; ]*$/i, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1");
}

/** Meme question que `askQuestion`, mais la reponse s'affiche au fil de l'eau (route
 * /api/query/stream, une ligne JSON par evenement). Repli sur `askQuestion` si le flux
 * n'est pas disponible (ancien backend). */
export async function askQuestionStream(
  question: string,
  language: Language,
  ctx: UsageContext | undefined,
  history: HistoryTurn[] | undefined,
  handlers: StreamHandlers = {}
): Promise<QueryResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/query/stream`, {
      method: "POST",
      headers: jsonHeaders(ctx),
      body: JSON.stringify({
        question,
        language,
        mode: ctx?.mode ?? "text",
        history: history ?? [],
        regenerate: ctx?.regenerate ?? false,
      }),
    });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (res.status === 404 || res.status === 405) return askQuestion(question, language, ctx, history);
  if (!res.ok) throw new ApiError(await readErrorDetail(res), res.status);
  if (!res.body) return askQuestion(question, language, ctx, history);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const handle = (line: string): QueryResponse | undefined => {
    if (!line.trim()) return undefined;
    let event: { type: string; text?: string; response?: QueryResponse; detail?: string };
    try {
      event = JSON.parse(line);
    } catch {
      return undefined;
    }
    if (event.type === "delta" && event.text) {
      text += event.text;
      handlers.onText?.(text);
    } else if (event.type === "reset") {
      text = "";
      handlers.onText?.("");
    } else if (event.type === "status" && event.text) {
      handlers.onStatus?.(event.text);
    } else if (event.type === "error") {
      throw new ApiError(event.detail || GENERIC_ERROR_MESSAGE);
    } else if (event.type === "done" && event.response) {
      return event.response;
    }
    return undefined;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const response = handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (response) return response;
      }
      if (done) break;
    }
    const last = handle(buffer);
    if (last) return last;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  throw new ApiError(GENERIC_ERROR_MESSAGE);
}

/** Explication detaillee d'une reponse deja donnee (bouton « Voir plus »),
 * generee a la demande par le backend a partir des memes documents. */
export async function explainAnswer(
  question: string,
  answer: string,
  language: Language,
  ctx?: UsageContext,
  sources: SourceRef[] = []
): Promise<ExplainResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/explain`, {
      method: "POST",
      headers: jsonHeaders(ctx),
      body: JSON.stringify({ question, answer, language, sources }),
    });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  const body = await res.json();
  return { details: body.details as string, sources: (body.sources ?? []) as DetailSource[] };
}

/** Signale un clic utile au tableau de bord admin (« Voir plus » deplie,
 * « Réponse audio »). Sans effet visible : un echec est simplement ignore. */
export function trackEvent(event: "details_open" | "listen", ctx?: UsageContext): void {
  void fetch(`${API_BASE_URL}/api/track`, {
    method: "POST",
    headers: jsonHeaders(ctx),
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {});
}

/** Titre court (1 a 3 mots) d'une discussion, genere par le backend pour
 * l'historique — ex. « Espérance de vie ». */
/** Titre court de la discussion, dans la langue de l'interface (historique). */
export async function suggestTitle(question: string, ctx?: UsageContext, language: Language = "fr"): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/title`, {
    method: "POST",
    headers: jsonHeaders(ctx),
    body: JSON.stringify({ question, language }),
  });
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  const body = await res.json();
  return body.title as string;
}

export async function fetchSources(): Promise<SourceDocument[]> {
  const res = await fetch(`${API_BASE_URL}/api/sources`);
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  return res.json();
}

/**
 * Speech-to-text: sends a browser mic recording (whatever container
 * MediaRecorder produced — webm/opus in Chrome/Firefox, mp4/aac in Safari;
 * the backend transcodes it, see backend/app/audio.py) to Soynade via
 * `/api/voice/transcribe` and returns the transcript. Used by /vocal.
 */
export async function transcribeAudio(recording: Blob, language: Language = "wo"): Promise<string> {
  const form = new FormData();
  const extension = recording.type.includes("mp4") ? "mp4" : recording.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", recording, `recording.${extension}`);
  form.append("language", language);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/voice/transcribe`, { method: "POST", body: form });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  const body = await res.json();
  return body.text as string;
}

/**
 * Text-to-speech: asks Soynade (via `/api/voice/speak`) to read `text`
 * aloud in `language` and returns the audio as a playable Blob. Used by
 * /vocal to read the answer back. Soynade caps input at 500 characters —
 * the backend truncates longer text at a sentence boundary rather than
 * rejecting it, see backend/app/routers/voice.py.
 */
export async function synthesizeSpeech(text: string, language: Language = "wo"): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
  } catch {
    throw new ApiError(GENERIC_ERROR_MESSAGE);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorDetail(res), res.status);
  }
  return res.blob();
}

/** Direct link to the source PDF, served by the backend's static mount (see
 * backend/app/main.py) — opens in the browser's own PDF viewer, jumping to
 * the cited page where the viewer supports the #page= fragment. */
export function publicationUrl(filename: string, page?: number | null): string {
  const base = `${API_BASE_URL}/files/${encodeURIComponent(filename)}`;
  return page ? `${base}#page=${page}` : base;
}
