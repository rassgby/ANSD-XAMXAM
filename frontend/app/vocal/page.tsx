"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import QuestionBar from "@/components/QuestionBar";
import Citation from "@/components/Citation";
import { MicIcon, PauseBarsIcon, PlayIcon } from "@/components/icons";
import {
  ApiError,
  askQuestion,
  fetchSources,
  GENERIC_ERROR_MESSAGE,
  publicationUrl,
  type Citation as CitationData,
  type QueryResponse,
  type SourceDocument,
} from "@/lib/api";
import { captureVoice, speakText, type CaptureController, type SpeechController } from "@/lib/voice";
import styles from "./page.module.css";

const EQUALIZER_HEIGHTS = [8, 14, 20, 12, 16, 9, 13, 7];

type Phase = "idle" | "recording" | "transcribing" | "asking" | "done" | "error";
type PlaybackState = "idle" | "loading" | "playing" | "paused";
type QuestionSource = "voice" | "text";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Mode vocal wolof — live now: mic recording goes to Soynade speech-to-text
 * (`/api/voice/transcribe`), the transcript is asked against the existing
 * RAG pipeline in wolof (`POST /api/query`, same endpoint /accueil uses),
 * and the answer is read back via Soynade text-to-speech
 * (`/api/voice/speak`). See backend/README.md for both services, and
 * lib/voice.ts for the capture/speak plumbing shared with /accueil's mic.
 *
 * Two fields from the original mockup are dropped rather than faked: the
 * big "figure" callout and the bilingual glossary panel assumed a
 * structured-data layer this PDF-citation backend doesn't have (same reason
 * /tracabilite's live version on /accueil drops its "valeur brute avant
 * arrondi" field — see backend/README.md). The answer is shown as prose
 * plus real citations instead, exactly like /accueil.
 */
export default function VocalPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [questionSource, setQuestionSource] = useState<QuestionSource>("voice");
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [input, setInput] = useState("");
  const [sources, setSources] = useState<SourceDocument[] | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>("idle");
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const captureControllerRef = useRef<CaptureController | null>(null);
  const speechControllerRef = useRef<SpeechController | null>(null);
  // Mirrors `recordingUrl` for the unmount-time cleanup below — a plain
  // effect closure over the state value would only ever see it as it was
  // on the initial render (empty deps array), not the latest clip.
  const recordingUrlRef = useRef<string | null>(null);

  function updateRecordingUrl(url: string | null) {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = url;
    setRecordingUrl(url);
  }

  useEffect(() => {
    fetchSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  useEffect(() => {
    return () => {
      captureControllerRef.current?.stop();
      speechControllerRef.current?.cancel();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  const isBusy = phase === "transcribing" || phase === "asking";
  const sourceById = new Map((sources ?? []).map((s) => [s.id, s]));

  async function playAnswer(text: string) {
    setPlayback("loading");
    speechControllerRef.current = await speakText(text, "wo", audioElRef.current, {
      onStart: () => setPlayback("playing"),
      onEnd: () => setPlayback("idle"),
      // Non-fatal: the answer is still readable as text even if the voice
      // playback failed (e.g. Soynade momentarily unavailable).
      onError: () => setPlayback("idle"),
    });
  }

  function togglePlayback() {
    if (playback === "playing") {
      speechControllerRef.current?.pause();
      setPlayback("paused");
    } else if (playback === "paused") {
      speechControllerRef.current?.resume();
      setPlayback("playing");
    } else if (response) {
      void playAnswer(response.answer);
    }
  }

  async function askAndSpeak(text: string, source: QuestionSource) {
    setPhase("asking");
    setQuestion(text);
    setQuestionSource(source);
    setResponse(null);
    setErrorMessage(null);
    try {
      const res = await askQuestion(text, "wo", { mode: "voice" });
      setResponse(res);
      setPhase("done");
      void playAnswer(res.answer);
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    }
  }

  async function handleMicToggle() {
    if (phase === "recording") {
      captureControllerRef.current?.stop();
      return;
    }
    if (isBusy) return;
    setErrorMessage(null);
    captureControllerRef.current = await captureVoice("wo", {
      onStart: () => {
        setPhase("recording");
        // Clear the previous round's clip up front so it can't linger
        // visible during a fresh recording.
        updateRecordingUrl(null);
      },
      onRecorded: (blob) => updateRecordingUrl(URL.createObjectURL(blob)),
      onResult: (text) => void askAndSpeak(text, "voice"),
      onError: (message) => {
        setPhase("error");
        setErrorMessage(message);
      },
      // Fires after onResult/onError too — only reset to idle if neither of
      // those already moved the phase on (functional update avoids a race
      // where this would otherwise stomp "asking"/"error" back to "idle").
      onEnd: () => setPhase((p) => (p === "recording" ? "idle" : p)),
    });
  }

  function handleTextSubmit() {
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;
    setInput("");
    void askAndSpeak(trimmed, "text");
  }

  const listeningLabel =
    phase === "recording"
      ? "Écoute en cours — wolof"
      : phase === "transcribing"
      ? "Transcription en cours…"
      : phase === "asking"
      ? "Recherche de la réponse…"
      : phase === "error"
      ? "Réessayez quand vous êtes prêt·e"
      : "Appuyez pour parler en wolof";

  const micButtonLabel = phase === "recording" ? "Arrêter l'écoute" : "Parler";

  const progressPct = progress.duration > 0 ? Math.min(100, (progress.current / progress.duration) * 100) : 0;

  return (
    <div className={styles.screen}>
      <Header activeLang="WO" />

      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.listeningCard}>
            <div className={`${styles.micBadge} ${phase === "recording" ? styles.micBadgeActive : ""}`}>
              <MicIcon size={18} stroke={phase === "recording" ? "#B3261E" : "#0B6E4F"} />
            </div>
            <div className={styles.listeningMeta}>
              <span className={styles.listeningLabel}>{listeningLabel}</span>
              {phase === "recording" && (
                <div className={styles.equalizer}>
                  {EQUALIZER_HEIGHTS.map((height, i) => (
                    <span
                      key={i}
                      className={`${styles.eqBar} ${styles.eqBarActive}`}
                      style={{ height, animationDelay: `${i * 90}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.stopButton}
              onClick={handleMicToggle}
              disabled={isBusy}
            >
              {micButtonLabel}
            </button>
          </div>

          {errorMessage && <p className={styles.errorBanner}>{errorMessage}</p>}

          {(recordingUrl || question) && (
            <div className={styles.transcription}>
              {recordingUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- a user's own short voice note, not media content
                <audio controls src={recordingUrl} className={styles.recordingPlayer} aria-label="Votre enregistrement" />
              )}
              {phase === "transcribing" && !question ? (
                <span className={styles.transcriptionNote}>Transcription en cours…</span>
              ) : (
                question && (
                  <>
                    <span className={styles.transcriptionLabel}>
                      {questionSource === "voice" ? "Transcription — wolof" : "Question"}
                    </span>
                    <span className={styles.transcriptionText}>{question}</span>
                  </>
                )
              )}
            </div>
          )}

          {response && (
            <>
              <div className={styles.divider} />

              <div className={styles.answerBlock}>
                <div className={styles.answerHead}>
                  <button
                    type="button"
                    className={styles.playback}
                    onClick={togglePlayback}
                    disabled={playback === "loading"}
                    aria-label={playback === "playing" ? "Mettre en pause la lecture" : "Écouter la réponse"}
                  >
                    {playback === "playing" ? <PauseBarsIcon size={14} /> : <PlayIcon size={14} />}
                    <span className={styles.playbackLabel}>
                      {playback === "loading" ? "Préparation de la voix…" : "Lecture à voix haute"}
                    </span>
                    <span className={styles.playbackTrack}>
                      <span className={styles.playbackFill} style={{ width: `${progressPct}%` }} />
                    </span>
                    <span className={`${styles.playbackTime} tabular`}>
                      {formatTime(progress.current)} / {formatTime(progress.duration)}
                    </span>
                  </button>
                </div>

                <p className={styles.answerText}>{response.answer}</p>

                {!response.answered && (
                  <span className={styles.transcriptionNote}>
                    Aucune donnée ANSD chargée ne permet de répondre précisément à cette question.
                  </span>
                )}

                {response.citations.length > 0 && (
                  <div className={styles.citationsList}>
                    {response.citations.map((citation: CitationData, i: number) => {
                      const source = sourceById.get(citation.document_id);
                      const pages =
                        citation.page_start === citation.page_end || citation.page_end == null
                          ? `page ${citation.page_start ?? "?"}`
                          : `pages ${citation.page_start}–${citation.page_end}`;
                      const meta = [
                        source?.publisher ?? "ANSD",
                        source ? `publié en ${source.publication_date.slice(0, 4)}` : null,
                        pages,
                        citation.verified ? null : "citation non vérifiée",
                      ]
                        .filter(Boolean)
                        .join(" — ");
                      return (
                        <Citation
                          key={`${citation.document_id}-${i}`}
                          title={citation.document_title}
                          meta={meta}
                          href={source ? publicationUrl(source.filename, citation.page_start) : "#"}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          <audio
            ref={audioElRef}
            hidden
            onTimeUpdate={(e) => setProgress((p) => ({ ...p, current: e.currentTarget.currentTime }))}
            onLoadedMetadata={(e) => setProgress({ current: 0, duration: e.currentTarget.duration })}
          />
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBar}>
          <QuestionBar
            variant="footer"
            placeholder="Laaj sa laaj ci wolof walla ci farañse"
            micTone="primary"
            value={input}
            onChange={setInput}
            onSubmit={handleTextSubmit}
            onMicClick={handleMicToggle}
            micRecording={phase === "recording"}
            disabled={isBusy}
          />
        </div>
      </footer>
    </div>
  );
}
