/**
 * Historique des discussions, conserve dans le navigateur (localStorage) :
 * recharger la page, la quitter puis revenir, ou fermer l'onglet ne fait
 * plus perdre la conversation. Les donnees restent sur l'appareil de
 * l'utilisateur — rien n'est envoye au backend.
 */

import type { DetailSource, QueryResponse } from "./api";
import type { Lang } from "./languages";

export type TurnStatus = "recording" | "transcribing" | "loading" | "done" | "error";

/** Mode de discussion : a l'ecrit, ou a voix haute (la reponse est alors lue
 * automatiquement). */
export type ChatMode = "text" | "voice";

export interface Turn {
  id: string;
  /** Transcript (or typed text) once known — empty while still "recording". */
  question: string;
  status: TurnStatus;
  /** Comment la question a ete posee : une question vocale recoit une
   * reponse lue a voix haute. */
  origin?: ChatMode;
  /** Playable clip of the user's own voice — memoire de l'onglet uniquement
   * (URL blob), jamais enregistre. */
  audioUrl?: string;
  response?: QueryResponse;
  /** Explication detaillee obtenue via « Voir plus » — conservee avec la
   * discussion pour ne pas la regenerer. */
  details?: string;
  /** Sources citees dans le texte de l'explication (references [[n]]). */
  detailsSources?: DetailSource[];
  error?: string;
  /** Texte de la reponse en cours de reception (flux), affiche avant la reponse finale.
   * Vide une fois la reponse arrivee. */
  streamText?: string;
  /** Vrai si la reponse a ete interrompue (page quittee pendant l'attente) :
   * l'interface propose alors de reposer la question. */
  interrupted?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Mode choisi (ou deduit de la 1re question) : en « voice », la zone de
   * saisie est remplacee par un grand bouton micro. */
  mode?: ChatMode;
  /** Langue de la discussion : choisie a la 1re question, elle reste la meme pour les
   * suivantes tant que l'utilisateur n'en change pas, et revient en rouvrant la discussion. */
  lang?: Lang;
  /** Titre choisi par l'utilisateur : plus jamais remplace par le titre automatique. */
  renamed?: boolean;
  turns: Turn[];
}

const SESSIONS_KEY = "ansd-rag:sessions:v1";
const ACTIVE_KEY = "ansd-rag:active-session:v1";
const MAX_SESSIONS = 50;
const TITLE_MAX = 60;

export const INTERRUPTED_MESSAGE = "La réponse a été interrompue car la page a été quittée.";

// Mots vides ecartes du titre provisoire (formulations de question, articles…).
const STOPWORDS = new Set(
  (
    "quel quelle quels quelles qui que quoi qu est sont etait ete a ont le la les l un une des de du d au aux " +
    "en et ou pour par sur dans avec selon comment combien pourquoi quand depuis entre ce cet cette ces " +
    "il elle ils elles on se s y t-il t-elle donne donner moi nous vous mon ma mes notre votre leur leurs " +
    "plus moins tres compte evolue evolution taux niveau senegal what is the of in how many much"
  ).split(" ")
);

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Titre provisoire, calcule instantanement a partir des mots importants de
 * la question (« Quelle est l'espérance de vie en 2023 ? » → « Espérance vie
 * 2023 ») — remplace des que le backend renvoie son titre (voir suggestTitle). */
export function quickTitle(question: string): string {
  const words = question
    .replace(/[?!.,;:«»"()]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[a-zA-Z]['’]/, ""))
    .filter((w) => w && !STOPWORDS.has(normalize(w)));
  const title = words.slice(0, 3).join(" ");
  if (!title) return "Nouvelle discussion";
  return (title[0].toUpperCase() + title.slice(1)).slice(0, TITLE_MAX);
}

/** Vrai si la discussion contient la recherche (titre, questions ou
 * reponses), sans tenir compte des accents ni des majuscules. */
export function sessionMatches(session: ChatSession, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const haystack = [session.title, ...session.turns.flatMap((t) => [t.question, t.response?.answer ?? ""])].join(
    " "
  );
  return normalize(haystack).includes(q);
}

/** Une requete en cours ne survit pas a un rechargement : on la marque
 * interrompue plutot que de laisser un indicateur de chargement eternel. */
function restoreTurn(turn: Turn): Turn {
  const { audioUrl: _audio, ...rest } = turn;
  if (rest.status === "done" || rest.status === "error") return rest;
  return { ...rest, status: "error", error: INTERRUPTED_MESSAGE, interrupted: Boolean(rest.question) };
}

export function loadSessions(): { sessions: ChatSession[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const sessions: ChatSession[] = raw ? JSON.parse(raw) : [];
    const restored = sessions
      .filter((s) => s && typeof s.id === "string" && Array.isArray(s.turns))
      // Les anciennes versions titraient avec la question complete : on la
      // ramene a un titre court.
      .map((s) => ({ ...s, title: s.title.trim().endsWith("?") ? quickTitle(s.title) : s.title, turns: s.turns.map(restoreTurn) }));
    const activeId = localStorage.getItem(ACTIVE_KEY);
    return { sessions: restored, activeId: restored.some((s) => s.id === activeId) ? activeId : null };
  } catch {
    return { sessions: [], activeId: null };
  }
}

export function saveSessions(sessions: ChatSession[], activeId: string | null): void {
  try {
    const trimmed = [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS)
      .map((s) => ({ ...s, turns: s.turns.map(({ audioUrl: _audio, ...t }) => t) }));
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // stockage indisponible (navigation privee, quota plein) : l'historique
    // reste simplement limite a l'onglet en cours
  }
}

export type SessionGroup = { label: string; sessions: ChatSession[] };

export type GroupLabels = { today: string; yesterday: string; last7Days: string; older: string };

/** Regroupement facon ChatGPT : Aujourd'hui / Hier / 7 derniers jours / Plus ancien (libelles
 * dans la langue de l'interface). */
export function groupSessions(
  sessions: ChatSession[],
  now = Date.now(),
  labels: GroupLabels = { today: "Aujourd'hui", yesterday: "Hier", last7Days: "7 derniers jours", older: "Plus ancien" }
): SessionGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const day = 24 * 60 * 60 * 1000;
  const groups: SessionGroup[] = [
    { label: labels.today, sessions: [] },
    { label: labels.yesterday, sessions: [] },
    { label: labels.last7Days, sessions: [] },
    { label: labels.older, sessions: [] },
  ];
  for (const s of [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (s.updatedAt >= today) groups[0].sessions.push(s);
    else if (s.updatedAt >= today - day) groups[1].sessions.push(s);
    else if (s.updatedAt >= today - 7 * day) groups[2].sessions.push(s);
    else groups[3].sessions.push(s);
  }
  return groups.filter((g) => g.sessions.length > 0);
}
