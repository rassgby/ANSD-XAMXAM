"use client";

import { UiLangProvider, setUiLanguage, uiText, useUi, type UiKey } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Check, Copy, Info, Loader2, Pause, RotateCcw, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { LanguagePicker } from "@/components/chat/LanguagePicker";
import { Composer } from "@/components/chat/Composer";
import { SourceLinks } from "@/components/chat/SourceLinks";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { HeroTitle } from "@/components/chat/HeroTitle";
import { RichText } from "@/components/chat/RichText";
import { cn } from "@/lib/utils";
import { copyAnswer } from "@/lib/copy";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import { VoiceButton } from "@/components/chat/VoiceButton";
import { LANG_TO_API, loadPreferredLang, newChatPrompt, savePreferredLang, welcome, type Lang } from "@/lib/languages";
import {
  ApiError,
  askQuestionStream,
  stripStreamMarkers,
  explainAnswer,
  trackEvent,
  sourcesOf,
  suggestTitle,
  type DetailSource,
  type HistoryTurn,
  GENERIC_ERROR_MESSAGE,
  type Citation,
  type Language,
  type QueryResponse,
} from "@/lib/api";
import {
  captureVoice,
  isVoiceInputAvailable,
  speakText,
  voiceInputUnavailableMessage,
  type CaptureController,
  type SpeechController,
  type VoiceLanguage,
} from "@/lib/voice";
import { loadSessions, quickTitle, saveSessions, type ChatMode, type ChatSession, type Turn } from "@/lib/sessions";

/** Titre provisoire d'une discussion lancee au micro, remplace par la
 * transcription des qu'elle arrive. */

export default function AccueilPage() {
  const [lang, setLang] = useState<Lang>("FR");
  // Langue de l'interface : messages hors composants (micro, lecture audio) et attribut lang de la page.
  useEffect(() => setUiLanguage(lang), [lang]);
  const [input, setInput] = useState("");
  // Discussions (voir lib/sessions.ts) : enregistrees dans le navigateur a
  // chaque changement, rechargees au montage. `activeId === null` = accueil
  // vide (nouvelle discussion), la session n'est creee qu'a la 1re question.
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [speaking, setSpeaking] = useState<{ turnId: string; status: "loading" | "playing" | "paused" } | null>(
    null
  );
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const heroInputRef = useRef<HTMLTextAreaElement>(null);
  const footerInputRef = useRef<HTMLTextAreaElement>(null);
  // « Relancer » : question remise dans le champ de saisie pour etre completee
  // ou modifiee avant d'etre reposee (a la meme place dans la discussion).
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  // « Voir plus » : echanges deplies, en cours de chargement, ou en erreur.
  // Le texte detaille lui-meme est stocke dans l'echange (turn.details).
  // Echange dont l'explication detaillee est ouverte dans la fenetre « Voir plus ».
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());
  const [detailsError, setDetailsError] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const speechControllerRef = useRef<SpeechController | null>(null);
  const captureControllerRef = useRef<CaptureController | null>(null);

  useEffect(() => {
    const stored = loadSessions();
    setSessions(stored.sessions);
    setActiveId(stored.activeId);
    const active = stored.sessions.find((s) => s.id === stored.activeId);
    const preferred = active?.lang ?? loadPreferredLang();
    if (preferred) setLang(preferred);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSessions(sessions, activeId);
  }, [sessions, activeId, hydrated]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const turns = activeSession?.turns ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const editingTurn = editingTurnId ? turns.find((t) => t.id === editingTurnId) : undefined;

  // Changer de discussion abandonne la question en cours de modification.
  const editingRef = useRef(editingTurnId);
  editingRef.current = editingTurnId;
  useEffect(() => {
    if (!editingRef.current) return;
    setEditingTurnId(null);
    setInput("");
  }, [activeId]);

  const isBusy =
    listening ||
    turns.some((t) => t.status === "loading" || t.status === "recording" || t.status === "transcribing" || t.status === "review");

  /** Met a jour un echange d'une session donnee — pas forcement la session
   * affichee : une reponse qui arrive apres un changement de discussion
   * atterrit bien dans celle ou la question a ete posee. */
  function patchTurn(sessionId: string, turnId: string, patch: Partial<Turn>) {
    setSessions((all) =>
      all.map((s) =>
        s.id !== sessionId
          ? s
          : { ...s, updatedAt: Date.now(), turns: s.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) }
      )
    );
  }

  /** Remplace le titre provisoire d'une discussion par le titre court du
   * backend (1 a 3 mots). En cas d'echec, le titre provisoire reste. */
  function refineTitle(sessionId: string, question: string) {
    suggestTitle(question, { sessionId }, LANG_TO_API[lang])
      .then((title) =>
        setSessions((all) => all.map((s) => (s.id === sessionId && !s.renamed ? { ...s, title } : s)))
      )
      .catch(() => {});
  }

  /** Ajoute un echange a la discussion affichee, ou cree la discussion si
   * l'on est sur l'accueil vide. Renvoie l'id de la session concernee. */
  function startTurn(turn: Turn): string {
    const now = Date.now();
    if (activeSession) {
      const sessionId = activeSession.id;
      setSessions((all) =>
        all.map((s) => (s.id === sessionId ? { ...s, updatedAt: now, turns: [...s.turns, turn] } : s))
      );
      return sessionId;
    }
    const sessionId = crypto.randomUUID();
    const session: ChatSession = {
      id: sessionId,
      title: turn.question ? quickTitle(turn.question) : uiText("voiceChatTitle", undefined, lang),
      createdAt: now,
      updatedAt: now,
      mode: turn.origin ?? "text",
      lang,
      turns: [turn],
    };
    setSessions((all) => [session, ...all]);
    setActiveId(sessionId);
    if (turn.question) refineTitle(sessionId, turn.question);
    return sessionId;
  }

  /** Vrai si tous les echanges precedents de la discussion etaient de la
   * conversation courante (« Bonjour ») — le titre doit alors etre refait. */
  function isFirstRealQuestion(sessionId: string, turnId: string): boolean {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return false;
    const before = session.turns.filter((t) => t.id !== turnId);
    return before.length > 0 && before.every((t) => t.response?.kind === "chat");
  }

  /** Deux derniers echanges de la discussion (avec leurs sources) :
   * permet les questions de suite (« donne-moi les chiffres », « et en 2024 ? »). */
  function historyFor(sessionId: string, turnId: string): HistoryTurn[] {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return [];
    // Echanges qui PRECEDENT celui-ci (une question relancee garde son contexte d'origine).
    const index = session.turns.findIndex((t) => t.id === turnId);
    const before = index >= 0 ? session.turns.slice(0, index) : session.turns;
    // Echanges sans donnees inclus : apres « et pour 2026 ? » (sans donnees), « et 2025 ? »
    // doit garder le meme sujet. La conversation courante (« Bonjour ») est ignoree.
    return before
      .filter((t) => t.status === "done" && t.response && t.response.kind !== "chat")
      .slice(-2)
      // Question telle que comprise par le backend (deja autonome) : une suite de
      // demandes de forme (« en liste » puis « en tableau ») garde le bon sujet.
      .map((t) => ({
        question: t.response!.standalone_question ?? t.question,
        answer: t.response!.answer,
        sources: sourcesOf(t.response!),
      }));
  }

  /** `origin` : une question posee a voix haute recoit une reponse lue
   * automatiquement ; une question ecrite, une reponse ecrite (avec le
   * bouton « Réponse audio »). */
  async function runQuery(
    sessionId: string,
    turnId: string,
    question: string,
    origin: ChatMode = "text",
    regenerate = false
  ) {
    // Texte recu en flux : affiche au plus toutes les 60 ms (chaque mise a jour redessine la page).
    let pendingText: string | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (pendingText !== null) patchTurn(sessionId, turnId, { streamText: pendingText });
    };
    try {
      const response = await askQuestionStream(
        question,
        LANG_TO_API[lang],
        { sessionId, mode: origin, regenerate },
        historyFor(sessionId, turnId),
        {
          onText: (text) => {
            pendingText = text;
            if (!flushTimer) flushTimer = setTimeout(flush, 60);
          },
        }
      );
      if (flushTimer) clearTimeout(flushTimer);
      patchTurn(sessionId, turnId, { status: "done", response, streamText: undefined });
      // Discussion ouverte par « Bonjour » : le titre vient de la premiere vraie question.
      if (response.kind !== "chat" && isFirstRealQuestion(sessionId, turnId)) {
        setSessions((all) =>
          all.map((s) => (s.id === sessionId && !s.renamed ? { ...s, title: quickTitle(question) } : s))
        );
        refineTitle(sessionId, question);
      }
      if (origin === "voice") void handleListen(turnId, response.answer, response.language as VoiceLanguage);
      if (response.answered) void loadDetails(sessionId, turnId, question, response);
    } catch (err) {
      if (flushTimer) clearTimeout(flushTimer);
      patchTurn(sessionId, turnId, {
        status: "error",
        streamText: undefined,
        error: err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE,
      });
    }
  }

  async function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isBusy) return;
    const turnId = crypto.randomUUID();
    const sessionId = startTurn({ id: turnId, question: trimmed, status: "loading", origin: "text" });
    setInput("");
    void runQuery(sessionId, turnId, trimmed, "text");
  }

  /** Prepare l'explication detaillee (« Voir plus ») en arriere-plan, des
   * que la reponse courte est arrivee : au clic, elle est le plus souvent
   * deja la, sans attente. Le resultat est stocke dans l'echange. */
  async function loadDetails(sessionId: string, turnId: string, question: string, response: QueryResponse) {
    setDetailsLoading((set) => new Set(set).add(turnId));
    setDetailsError(({ [turnId]: _old, ...rest }) => rest);
    try {
      // Question reformulee (questions de suite) et sources de la reponse : l'explication
      // porte sur la meme chose et s'appuie sur les memes documents.
      const { details, sources: detailsSources } = await explainAnswer(
        response.standalone_question ?? question,
        response.answer,
        response.language as Language,
        { sessionId },
        sourcesOf(response)
      );
      patchTurn(sessionId, turnId, { details, detailsSources });
    } catch (err) {
      setDetailsError((e) => ({ ...e, [turnId]: err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE }));
    } finally {
      setDetailsLoading((set) => {
        const next = new Set(set);
        next.delete(turnId);
        return next;
      });
    }
  }

  /** « Voir plus » / « Voir moins » : deplie tout de suite (le texte, ou un
   * squelette s'il est encore en preparation) ; relance la preparation si
   * elle n'a pas eu lieu (ancienne discussion) ou a echoue. */
  /** « Voir plus » : ouvre l'explication detaillee dans une fenetre centree
   * (squelette de chargement si elle est encore en preparation). */
  function handleOpenDetails(turn: Turn) {
    if (!activeSession || !turn.response) return;
    setDetailsFor(turn.id);
    trackEvent("details_open", { sessionId: activeSession.id });
    // Absente, ou ancienne (preparee avant les liens dans le texte) : on la (re)genere.
    if ((!turn.details || !turn.detailsSources) && !detailsLoading.has(turn.id)) {
      void loadDetails(activeSession.id, turn.id, turn.question, turn.response);
    }
  }

  /** Repose une question restee sans reponse (erreur, ou page quittee
   * pendant l'attente). */
  function handleRetry(turn: Turn) {
    if (!activeSession || isBusy || !turn.question) return;
    patchTurn(activeSession.id, turn.id, { status: "loading", error: undefined, interrupted: false });
    void runQuery(activeSession.id, turn.id, turn.question, turn.origin ?? "text");
  }

  /** « Relancer » : remet la question dans le champ de saisie, ou l'on peut
   * la completer avant de la reposer (Entree) — ou annuler (Echap). */
  function handleRegenerate(turn: Turn) {
    if (!activeSession || isBusy || !turn.question) return;
    if (activeSession.mode === "voice") setSessionMode("text");
    setEditingTurnId(turn.id);
    setInput(turn.question);
    requestAnimationFrame(() => {
      const el = footerInputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function cancelEdit() {
    setEditingTurnId(null);
    setInput("");
  }

  /** Repose la question relancee (eventuellement modifiee) pour obtenir une
   * nouvelle reponse, au meme endroit de la discussion. Inchangee, le backend
   * ignore son cache pour proposer une autre reponse. */
  function submitEdit() {
    const turn = turns.find((t) => t.id === editingTurnId);
    const question = input.trim();
    setEditingTurnId(null);
    if (!activeSession || isBusy || !turn || !question) return;
    setInput("");
    if (speaking?.turnId === turn.id) {
      speechControllerRef.current?.cancel();
      setSpeaking(null);
    }
    setDetailsFor((id) => (id === turn.id ? null : id));
    patchTurn(activeSession.id, turn.id, {
      question,
      status: "loading",
      response: undefined,
      details: undefined,
      detailsSources: undefined,
      error: undefined,
      interrupted: false,
    });
    void runQuery(activeSession.id, turn.id, question, turn.origin ?? "text", question === turn.question);
  }

  /** Change le mode de la discussion affichee (« Écrire plutôt » / micro). */
  function setSessionMode(mode: ChatMode) {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    setSessions((all) => all.map((s) => (s.id === sessionId ? { ...s, mode } : s)));
  }

  /** Pressing the mic drops straight into the conversation view — a
   * "recording" turn is added immediately (flipping `turns.length` from 0
   * to 1 is exactly what already switches the layout below from the hero
   * to the chat log, so no separate transition logic is needed) — as if a
   * question had already been started, before a word is transcribed. Once
   * recording stops, the user's own clip becomes playable in that same
   * bubble (`onRecorded`). Once the transcript is back the turn waits in
   * « review » : the user can listen to the clip, then send it
   * (handleSendVoice) or delete it (handleDiscardVoice). */
  async function handleMicClick() {
    if (listening) {
      captureControllerRef.current?.stop();
      return;
    }
    if (isBusy) return;
    if (!isVoiceInputAvailable(LANG_TO_API[lang])) {
      setVoiceNotice(voiceInputUnavailableMessage());
      return;
    }
    setVoiceNotice(null);
    // Couper une lecture en cours : sinon le micro capterait la voix de l'assistant.
    speechControllerRef.current?.cancel();
    setSpeaking(null);
    // Commencer a parler fait passer la discussion en mode vocal.
    if (activeSession && activeSession.mode !== "voice") setSessionMode("voice");
    const id = crypto.randomUUID();
    // Discussion creee par cette question vocale : son titre provisoire
    // (« Question vocale ») sera remplace des que la transcription arrive.
    const createsSession = !activeSession;
    const sessionId = startTurn({ id, question: "", status: "recording", origin: "voice" });

    captureControllerRef.current = await captureVoice(LANG_TO_API[lang], {
      onStart: () => setListening(true),
      onRecorded: (blob) => {
        const url = URL.createObjectURL(blob);
        setSessions((all) =>
          all.map((s) =>
            s.id !== sessionId
              ? s
              : {
                  ...s,
                  turns: s.turns.map((turn) =>
                    turn.id === id
                      ? { ...turn, audioUrl: url, status: turn.status === "recording" ? "transcribing" : turn.status }
                      : turn
                  ),
                }
          )
        );
      },
      onPartial: (text) => patchTurn(sessionId, id, { question: text }),
      onResult: (text) => {
        patchTurn(sessionId, id, { question: text, status: "review" });
        if (createsSession) {
          setSessions((all) =>
            all.map((s) => (s.id === sessionId && !s.renamed ? { ...s, title: quickTitle(text) } : s))
          );
          refineTitle(sessionId, text);
        }
      },
      onError: (message) => {
        patchTurn(sessionId, id, { status: "error", error: message });
      },
      onEnd: () => setListening(false),
    });
  }

  /** Question vocale ecoutee et validee : elle part comme une question normale. */
  function handleSendVoice(turn: Turn) {
    if (!activeId || turn.status !== "review" || !turn.question) return;
    patchTurn(activeId, turn.id, { status: "loading" });
    void runQuery(activeId, turn.id, turn.question, "voice");
  }

  /** Question vocale abandonnee : l'echange disparait (et la discussion avec, s'il etait le seul). */
  function handleDiscardVoice(turn: Turn) {
    if (!activeId) return;
    if (turn.audioUrl) URL.revokeObjectURL(turn.audioUrl);
    const sessionId = activeId;
    const session = sessions.find((s) => s.id === sessionId);
    if (session && session.turns.length <= 1) {
      setSessions((all) => all.filter((s) => s.id !== sessionId));
      setActiveId(null);
      return;
    }
    setSessions((all) =>
      all.map((s) => (s.id === sessionId ? { ...s, turns: s.turns.filter((t) => t.id !== turn.id) } : s))
    );
  }

  /** Quitte la discussion affichee (sans la perdre : elle reste dans
   * l'historique, et une reponse encore en attente y arrivera quand meme). */
  function leaveConversation() {
    if (listening) captureControllerRef.current?.stop();
    speechControllerRef.current?.cancel();
    setSpeaking(null);
    setInput("");
    setDetailsFor(null);
  }

  function handleNewChat() {
    leaveConversation();
    setActiveId(null);
    setVoiceNotice(null);
  }

  function handleSelectSession(id: string) {
    if (id === activeId) return;
    leaveConversation();
    setActiveId(id);
    // Rouvrir une discussion rend sa langue : les questions suivantes y restent.
    const session = sessions.find((s) => s.id === id);
    if (session?.lang) setLang(session.lang);
  }

  /** Changement de langue (menu de l'en-tete ou choix de l'accueil) : valable pour la
   * discussion ouverte et pour toutes ses questions suivantes. */
  function changeLang(next: Lang) {
    setLang(next);
    savePreferredLang(next);
    if (activeId) setSessions((all) => all.map((s) => (s.id === activeId ? { ...s, lang: next } : s)));
  }

  /** Renommage depuis la barre laterale : le titre choisi est conserve
   * (le titre automatique ne le remplacera plus). */
  function handleRenameSession(id: string, title: string) {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!clean) return;
    setSessions((all) => all.map((s) => (s.id === id ? { ...s, title: clean, renamed: true } : s)));
  }

  function handleDeleteSession(id: string) {
    setSessions((all) => all.filter((s) => s.id !== id));
    if (id === activeId) handleNewChat();
  }

  function handleToggleSidebar() {
    if (window.matchMedia("(min-width: 768px)").matches) setDesktopSidebarOpen((o) => !o);
    else setMobileSidebarOpen(true);
  }

  const hasHistory = hydrated && sessions.length > 0;
  /** Aucune discussion encore : on presente l'assistant (grand accueil). */
  const firstVisit = sessions.length === 0;

  /** Reads an answer aloud — wolof via Soynade, fr/en via Mistral's Voxtral
   * TTS (see lib/voice.ts and backend/app/mistral_voice.py). Uses the
   * language the answer was actually given in (`turn.response.language`),
   * not whatever the header toggle currently shows, so switching languages
   * mid-conversation doesn't mis-read an earlier turn. Toggles play/pause
   * on the same turn; clicking a different turn cancels whatever was
   * playing and starts the new one. */
  async function handleListen(turnId: string, text: string, language: VoiceLanguage) {
    if (speaking?.turnId === turnId) {
      if (speaking.status === "playing") {
        speechControllerRef.current?.pause();
        setSpeaking({ turnId, status: "paused" });
      } else if (speaking.status === "paused") {
        speechControllerRef.current?.resume();
        setSpeaking({ turnId, status: "playing" });
      }
      return;
    }
    speechControllerRef.current?.cancel();
    setSpeechError(null);
    setSpeaking({ turnId, status: "loading" });
    const controller = await speakText(text, language, audioElRef.current, {
      onStart: () => setSpeaking({ turnId, status: "playing" }),
      onEnd: () => setSpeaking((s) => (s?.turnId === turnId ? null : s)),
      onError: (message) => {
        setSpeechError(message);
        setSpeaking((s) => (s?.turnId === turnId ? null : s));
      },
    });
    speechControllerRef.current = controller;
  }

  useEffect(() => {
    return () => speechControllerRef.current?.cancel();
  }, []);


  const t = (key: UiKey, vars?: Record<string, string | number>) => uiText(key, vars, lang);

  return (
    // `position: fixed` on purpose, not `h-screen`/`h-full`: this shell must
    // fill the whole viewport, header and composer never moving — only the
    // message list (its own `overflow-y-auto` region below) scrolls. An
    // earlier version sized this via a percentage-height chain (`h-full`
    // resolving against an ancestor's flex-computed height) that looked
    // right on first load but silently broke — `height: 100%` stopped
    // resolving — the moment the empty-state hero swapped for the
    // conversation view, leaving a dead gap under the composer with nothing
    // controlling where it sat. `position: fixed` has no such dependency:
    // its box is computed directly from the viewport via `inset`, not
    // from any ancestor's height at all.
    <UiLangProvider value={lang}>
    <div className="accueil-shell fixed inset-0 z-20 flex flex-col overflow-hidden bg-white">
      <ChatHeader
        lang={lang}
        onLangChange={changeLang}
        onNewChat={handleNewChat}
        showNewChat={turns.length > 0}
        // Langue en haut a droite des que le choix initial est fait : pendant une
        // conversation, et sur une nouvelle discussion (ou elle reste modifiable).
        showLanguage={!firstVisit || turns.length > 0}
        onToggleSidebar={hasHistory ? handleToggleSidebar : undefined}
        sidebarOpen={hasHistory && desktopSidebarOpen}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        {hasHistory && (
          <SessionSidebar
            sessions={sessions}
            activeId={activeId}
            onSelect={handleSelectSession}
            onNew={handleNewChat}
            onDelete={handleDeleteSession}
            onRename={handleRenameSession}
            desktopOpen={desktopSidebarOpen}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
          />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!hydrated ? null : turns.length === 0 ? (
            // Defilable (et non `overflow-hidden` + `justify-center`, qui coupait le
            // haut du titre sur petit ecran) ; `my-auto` sur le contenu le garde
            // centre verticalement quand la place suffit.
            <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
              <div className="relative z-10 my-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
                {/* Grand accueil (titre, presentation, choix du mode) : premiere
                    visite uniquement. Ensuite, une nouvelle discussion s'ouvre sur
                    un ecran epure — l'utilisateur connait deja l'assistant. */}
                {firstVisit ? (
                  <>
                  <HeroTitle key={lang} lang={lang} />

                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="max-w-xl font-serif text-base leading-relaxed text-slate-500 sm:text-lg"
                  >
                    {welcome(lang).intro.before}
                    <span className="font-sans font-semibold text-brand-700">
                      {welcome(lang).intro.languages}
                    </span>
                    {welcome(lang).intro.after}
                  </motion.p>

                  </>
                ) : (
                  <motion.h1
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl"
                  >
                    {newChatPrompt(lang)}
                  </motion.h1>
                )}

                {/* Grand choix de la langue : premiere visite seulement. Ensuite, la langue
                    se change depuis le menu en haut a droite. */}
                {firstVisit && <LanguagePicker value={lang} onChange={changeLang} delay={0.7} />}

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: firstVisit ? 0.8 : 0.1 }}
                  className="w-full"
                >
                  <Composer
                    variant="hero"
                    placeholder={welcome(lang).placeholder}
                    value={input}
                    onChange={setInput}
                    onSubmit={() => handleAsk(input)}
                    listening={listening}
                    onMicClick={handleMicClick}
                    disabled={isBusy}
                    inputRef={heroInputRef}
                    autoFocus={!firstVisit}
                  />
                  {voiceNotice && <p className="mt-2 text-xs text-red-600">{voiceNotice}</p>}
                </motion.div>
              </div>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                <div className="flex w-full flex-col gap-8 px-4 py-6 sm:px-12 sm:py-8 lg:px-24 xl:px-36 2xl:px-48">
                  {turns.map((turn) => (
                    <div key={turn.id} className="flex flex-col gap-3">
                      <div className="flex justify-end">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex max-w-[88%] flex-col items-end gap-1.5 sm:max-w-[80%]"
                        >
                          {/* The user's own recording — playable as soon as it stops,
                              typically before the transcript (and always before the
                              answer) are back. Mic-originated turns only. */}
                          {turn.audioUrl && (
                            // eslint-disable-next-line jsx-a11y/media-has-caption -- a user's own short voice note, not media content
                            <audio
                              controls
                              src={turn.audioUrl}
                              className="h-9 w-64 max-w-full rounded-full"
                              aria-label={t("yourRecording")}
                            />
                          )}

                          {turn.status === "recording" ? (
                            <div className="flex items-center gap-2 rounded-2xl rounded-br-md bg-brand-900 px-4 py-2.5 text-sm font-medium text-white shadow-glow">
                              <span className="relative flex h-2 w-2 shrink-0">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                              </span>
                              {turn.question ? <span className="italic">{turn.question}</span> : "Je vous écoute…"}
                            </div>
                          ) : turn.status === "transcribing" ? (
                            <div className="rounded-2xl rounded-br-md bg-brand-900 px-4 py-2.5 text-sm font-medium text-white shadow-glow">
                              {t("transcribing")}
                            </div>
                          ) : (
                            turn.question && (
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "rounded-2xl rounded-br-md bg-brand-900 px-4 py-2.5 whitespace-pre-wrap break-words text-sm font-medium text-white shadow-glow transition-opacity",
                                    editingTurnId === turn.id && "opacity-60 ring-2 ring-brand-300 ring-offset-2"
                                  )}
                                >
                                  {turn.question}
                                </div>
                                {/* « Relancer » a droite de la question (reponse deja recue, hors « Bonjour »…) */}
                                {turn.status === "done" && turn.response?.kind !== "chat" && (
                                  <RegenerateButton onClick={() => handleRegenerate(turn)} disabled={isBusy} />
                                )}
                              </div>
                            )
                          )}

                          {/* Question vocale a verifier : on l'ecoute (lecteur ci-dessus), puis on l'envoie ou la supprime. */}
                          {turn.status === "review" && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDiscardVoice(turn)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-red-300 hover:text-red-600"
                              >
                                <Trash2 size={14} />
                                {t("delete")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSendVoice(turn)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
                              >
                                <Send size={14} />
                                {t("send")}
                              </button>
                            </div>
                          )}
                        </motion.div>
                      </div>

                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 }}
                        className="flex flex-col gap-4"
                      >
                        {turn.status === "loading" &&
                          (turn.streamText && stripStreamMarkers(turn.streamText).trim() ? (
                            // Reponse en cours de reception : le texte s'affiche au fil de l'eau.
                            <RichText
                              text={stripStreamMarkers(turn.streamText)}
                              className="font-serif text-[17px] leading-[1.7] text-slate-800"
                            />
                          ) : (
                            <TypingIndicator />
                          ))}

                        {turn.status === "error" && (
                          <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                            <p>{turn.error === GENERIC_ERROR_MESSAGE ? t("genericError") : turn.error}</p>
                            {turn.question && (
                              <button
                                type="button"
                                onClick={() => handleRetry(turn)}
                                disabled={isBusy}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                              >
                                <RotateCcw size={13} />
                                {t("askAgain")}
                              </button>
                            )}
                          </div>
                        )}

                        {turn.status === "done" && turn.response?.kind === "chat" && (
                          // Conversation courante (« Bonjour ! », « Avec plaisir ! ») : sans sources.
                          <>
                            <RichText text={turn.response.answer} className="font-serif text-[17px] leading-[1.7] text-slate-800" />
                            <OriginalAnswer response={turn.response} />
                          </>
                        )}

                        {turn.status === "done" && turn.response?.kind === "guide" && (
                          // Conseils / etapes : chaque publication recommandee est un lien vers son document.
                          <>
                            <RichText
                              text={turn.response.answer}
                              sources={turn.response.sources}
                              className="font-serif text-[17px] leading-[1.7] text-slate-800"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <CopyButton
                                answer={turn.response.answer}
                                citations={[]}
                                inlineSources={turn.response.sources}
                              />
                            </div>
                          </>
                        )}

                        {turn.status === "done" && turn.response && !turn.response.answered && turn.response.kind !== "chat" && turn.response.kind !== "guide" && (
                          // Donnees non couvertes par les publications indexees : un message simple, rien d'autre.
                          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] leading-relaxed text-slate-600">
                            <Info size={18} className="mt-0.5 shrink-0 text-slate-400" />
                            <p>{turn.response.answer}</p>
                          </div>
                        )}

                        {turn.status === "done" && turn.response?.answered && (
                          <>
                            <RichText
                              text={turn.response.answer}
                              className="font-serif text-[17px] leading-[1.7] text-slate-800"
                            />
                            <OriginalAnswer response={turn.response} />

                            {/* Sources juste apres la reponse : un lien par page citee */}
                            <SourceLinks citations={turn.response.citations} />

                            {/* Barre d'actions, juste sous la reponse */}
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenDetails(turn)}
                                aria-haspopup="dialog"
                                className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
                              >
                                <BookOpen size={16} />
                                {t("details")}
                              </button>

                              {/* « Réponse audio » : pour toutes les reponses, question ecrite ou vocale.
                                  Pas encore de voix pulaar : bouton desactive et mention explicite. */}
                              {turn.response.language === "ff" ? (
                                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                                  <button
                                    type="button"
                                    disabled
                                    aria-label={t("audioUnavailablePulaar")}
                                    title={t("audioUnavailablePulaar")}
                                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400"
                                  >
                                    <VolumeX size={16} />
                                    {t("listen")}
                                  </button>
                                  {t("audioUnavailablePulaar")}
                                </span>
                              ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (speaking?.turnId !== turn.id) trackEvent("listen", { sessionId: activeSession?.id });
                                  void handleListen(turn.id, turn.response!.answer, turn.response!.language as VoiceLanguage);
                                }}
                                aria-label={t("listenLabel")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
                              >
                                {(() => {
                                  const status = speaking?.turnId === turn.id ? speaking.status : null;
                                  if (status === "loading") return <Loader2 size={16} className="animate-spin" />;
                                  if (status === "playing") return <Pause size={16} />;
                                  return <Volume2 size={16} />;
                                })()}
                                {(() => {
                                  const status = speaking?.turnId === turn.id ? speaking.status : null;
                                  if (status === "loading") return t("preparing");
                                  if (status === "playing") return t("pause");
                                  if (status === "paused") return t("resume");
                                  return t("listen");
                                })()}
                              </button>
                              )}

                              <CopyButton answer={turn.response.answer} citations={turn.response.citations} />
                            </div>


                          </>
                        )}
                      </motion.div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white/80 px-4 py-3 backdrop-blur-xl sm:px-12 sm:py-4 lg:px-24 xl:px-36 2xl:px-48">
                <div className="w-full">
                  {activeSession?.mode === "voice" ? (
                    <VoiceButton
                      size="compact"
                      listening={listening}
                      disabled={isBusy}
                      onClick={handleMicClick}
                      onSwitchToText={() => setSessionMode("text")}
                      notice={voiceNotice}
                    />
                  ) : (
                    <>
                      {editingTurn && (
                        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50/70 px-3 py-1.5 text-xs font-medium text-brand-800">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <RotateCcw size={13} className="shrink-0" />
                            <span className="truncate">Complétez ou modifiez la question, puis validez pour relancer</span>
                          </span>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="shrink-0 rounded-md px-2 py-0.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                          >
                            {t("cancel")}
                          </button>
                        </div>
                      )}
                      <Composer
                        variant="footer"
                        placeholder={welcome(lang).placeholder}
                        value={input}
                        onChange={setInput}
                        onSubmit={() => (editingTurn ? submitEdit() : handleAsk(input))}
                        onCancel={editingTurn ? cancelEdit : undefined}
                        inputRef={footerInputRef}
                        listening={listening}
                        onMicClick={handleMicClick}
                        disabled={isBusy}
                      />
                      {voiceNotice && <p className="mt-1.5 px-1 text-xs font-medium text-red-600">{voiceNotice}</p>}
                    </>
                  )}
                  {speechError && <p className="mt-1.5 px-1 text-xs font-medium text-red-600">{speechError}</p>}
                </div>
              </div>
            </>
          )}
        </div>

      </div>

      <AnimatePresence>
        {(() => {
          const turn = detailsFor ? turns.find((t) => t.id === detailsFor) : undefined;
          if (!turn?.response) return null;
          return (
            <DetailsModal
              key="details"
              details={turn.details}
              detailsSources={turn.detailsSources}
              loading={detailsLoading.has(turn.id)}
              error={detailsError[turn.id]}
              citations={turn.response.citations}
              onRetry={() => activeSession && loadDetails(activeSession.id, turn.id, turn.question, turn.response!)}
              onClose={() => setDetailsFor(null)}
            />
          );
        })()}
      </AnimatePresence>

      {/* Shared player for answer read-aloud (handleListen / lib/voice.ts) —
          every turn's own recording bubble above has its own <audio>
          element instead, since several of those can coexist on screen. */}
      <audio ref={audioElRef} hidden />
    </div>
    </UiLangProvider>
  );
}

/** « Relancer » : obtenir une nouvelle reponse a la meme question (icone a
 * cote de la bulle de la question). */
function RegenerateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useUi();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={t("regenerate")}
      aria-label={t("regenerateLabel")}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
    >
      <RotateCcw size={15} />
    </button>
  );
}

/** « Copier » : copie la reponse (ou l'explication detaillee) dans le format
 * affiche (liste, tableau…), avec le lien vers ses sources. */
function CopyButton({
  answer,
  citations,
  inlineSources,
  label,
  small,
}: {
  answer: string;
  citations: Citation[];
  /** Sources citees dans le texte (references [[n]]) — explication detaillee. */
  inlineSources?: DetailSource[];
  label?: string;
  small?: boolean;
}) {
  const t = useUi();
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await copyAnswer(answer, citations, inlineSources);
      setState("copied");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ?? t("copyAnswer")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold transition-colors",
        small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        state === "copied"
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700"
      )}
    >
      {state === "copied" ? <Check size={small ? 14 : 16} /> : <Copy size={small ? 14 : 16} />}
      <span aria-live="polite">{state === "copied" ? t("copied") : state === "error" ? t("copyFailed") : label ?? t("copy")}</span>
    </button>
  );
}

/** Fenetre « Voir plus » : explication detaillee de la reponse, centree. Fermeture
 * par la croix, Echap ou un clic en dehors. */
function DetailsModal({
  details,
  detailsSources,
  loading,
  error,
  citations,
  onRetry,
  onClose,
}: {
  details?: string;
  detailsSources?: DetailSource[];
  loading: boolean;
  error?: string;
  citations: Citation[];
  onRetry: () => void;
  onClose: () => void;
}) {
  const t = useUi();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Les sources sont dans le texte (liens apres chaque passage). Une ancienne
  // explication, sans ces liens, est regeneree a l'ouverture : en attendant on
  // affiche le chargement plutot que l'ancien texte.
  const ready = !!details && (detailsSources !== undefined || (!loading && !!error));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
        className="relative flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5 sm:px-6">
          <h2 id="details-title" className="text-base font-bold text-brand-900">
            {t("details")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 font-serif text-[16px] leading-relaxed text-slate-800 sm:px-6">
          {ready ? (
            <RichText text={details!} sources={detailsSources} />
          ) : error && !loading ? (
            <div className="flex flex-wrap items-center gap-3 font-sans text-sm text-slate-500">
              {error}
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-900"
              >
                <RotateCcw size={13} />
                {t("retry")}
              </button>
            </div>
          ) : (
            <div className="flex animate-pulse flex-col gap-3 py-1" aria-label="Chargement de l'explication">
              <div className="h-3.5 w-11/12 rounded-full bg-brand-100" />
              <div className="h-3.5 w-full rounded-full bg-brand-100" />
              <div className="h-3.5 w-4/5 rounded-full bg-brand-100" />
              <div className="h-3.5 w-2/3 rounded-full bg-brand-100" />
            </div>
          )}
        </div>

        {ready && (
          <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-3 sm:px-6">
            <CopyButton
              answer={details!}
              citations={detailsSources ? [] : citations}
              inlineSources={detailsSources}
              label={t("copyDetails")}
              small
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}

/** Reponse traduite automatiquement en wolof : le texte francais d'origine, a deplier.
 * Pas pour le pulaar : la reponse s'affiche seule (choix de presentation). */
function OriginalAnswer({ response }: { response: QueryResponse }) {
  const t = useUi();
  if (!response.original_answer || response.language === "ff") return null;
  return (
    <details className="group text-sm text-slate-500">
      <summary className="cursor-pointer select-none font-medium text-brand-700 hover:text-brand-900">
        {t("originalFrench")}
      </summary>
      <RichText text={response.original_answer} className="mt-2 font-serif text-[15px] leading-[1.7] text-slate-600" />
    </details>
  );
}
