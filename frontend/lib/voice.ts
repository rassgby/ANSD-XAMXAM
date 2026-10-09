/**
 * Shared voice I/O for both voice surfaces in the product: /accueil's
 * mic (components/chat/Composer.tsx) and /vocal's hands-free voice mode
 * (app/vocal/page.tsx).
 *
 * One code path for all three languages: record from the mic, upload the
 * clip to this backend, which picks the provider server-side (see
 * backend/app/routers/voice.py) — Soynade for wolof, Mistral's Voxtral
 * models for French/English. An earlier version of this file ran French/
 * English through the browser's own Web Speech API instead; that's gone
 * now (robotic voice, Firefox has no SpeechRecognition at all, Safari's
 * support is inconsistent, and it sent audio to Google's servers) in favor
 * of one backend-mediated path that works identically everywhere and lets
 * the UI replay the user's own recording (`onRecorded`) while the
 * transcript/answer are still pending.
 */

import { ApiError, synthesizeSpeech, transcribeAudio, type Language } from "./api";
import { uiText } from "./i18n";

export type VoiceLanguage = Language;

// ---------------------------------------------------------------- capture

export interface CaptureController {
  stop: () => void;
}

export interface CaptureHandlers {
  onStart?: () => void;
  /** Fires as soon as the raw recording stops, before transcription
   * finishes — lets the UI show a playable "your recording" bubble right
   * away instead of waiting on the transcribe round-trip. */
  onRecorded?: (blob: Blob) => void;
  /** Transcription provisoire, au fil de la parole (reconnaissance du
   * navigateur uniquement) — permet d'afficher ce qui est compris en direct. */
  onPartial?: (text: string) => void;
  onResult: (text: string) => void;
  onError: (message: string) => void;
  /** Always fires last, on success or failure — the right place to reset a
   * "listening" UI state back to idle regardless of outcome. */
  onEnd: () => void;
}

export function isVoiceCaptureSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

// Reconnaissance vocale du navigateur (Web Speech API) : Chrome, Edge et
// Safari la proposent, pas Firefox. Le backend n'ayant pas (encore) de
// transcription, c'est le chemin utilise pour le francais et l'anglais ;
// les autres langues n'ont de modele de reconnaissance dans aucun navigateur.
interface BrowserRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const RECOGNITION_LANG: Partial<Record<VoiceLanguage, string>> = { fr: "fr-FR", en: "en-US" };

function recognitionCtor(): (new () => BrowserRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => BrowserRecognition) | null;
}

/** Vrai si l'on peut poser une question a voix haute dans cette langue sur
 * ce navigateur. */
export function isVoiceInputAvailable(language: VoiceLanguage): boolean {
  // Wolof : pas de reconnaissance dans le navigateur ; on enregistre le micro et le
  // backend transcrit (Soynade, /api/voice/transcribe).
  if (BACKEND_ASR_LANGUAGES.includes(language)) {
    return typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }
  return !!recognitionCtor() && !!RECOGNITION_LANG[language];
}

const BACKEND_ASR_LANGUAGES: VoiceLanguage[] = ["wo"];

/** Message affiche quand la question a voix haute n'est pas possible (langue de l'interface). */
export function voiceInputUnavailableMessage(): string {
  return uiText("voiceInputUnavailable");
}

function captureWithBrowser(Ctor: new () => BrowserRecognition, bcp47: string, handlers: CaptureHandlers): CaptureController {
  const rec = new Ctor();
  rec.lang = bcp47;
  rec.interimResults = true;
  rec.continuous = false; // s'arrete tout seul apres un silence
  rec.maxAlternatives = 1;
  let finalText = "";
  let failed = false;

  rec.onstart = () => handlers.onStart?.();
  rec.onresult = (e) => {
    let interim = "";
    finalText = "";
    for (let i = 0; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    handlers.onPartial?.(`${finalText}${interim}`.trim());
  };
  rec.onerror = (e) => {
    if (e.error === "aborted") return;
    failed = true;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      handlers.onError(
        uiText("micDenied")
      );
    } else if (e.error === "no-speech") {
      handlers.onError(uiText("noSpeech"));
    } else if (e.error === "network") {
      handlers.onError(uiText("needInternet"));
    } else {
      handlers.onError(uiText("genericError"));
    }
  };
  rec.onend = () => {
    if (!failed) {
      if (finalText.trim()) handlers.onResult(finalText.trim());
      else handlers.onError(uiText("noSpeech"));
    }
    handlers.onEnd();
  };
  rec.start();
  return { stop: () => rec.stop() };
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
}

/** Starts recording from the mic; resolves once recording has actually
 * started (or failed to — including waiting on the permission prompt). */
export async function captureVoice(
  language: VoiceLanguage,
  handlers: CaptureHandlers
): Promise<CaptureController | null> {
  const Ctor = recognitionCtor();
  const bcp47 = RECOGNITION_LANG[language];
  if (Ctor && bcp47) {
    try {
      return captureWithBrowser(Ctor, bcp47, handlers);
    } catch {
      // ex. une reconnaissance deja en cours : on tente l'enregistrement classique
    }
  }

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    handlers.onError(uiText("micUnavailable"));
    handlers.onEnd();
    return null;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    handlers.onError(
      uiText("micDenied")
    );
    handlers.onEnd();
    return null;
  }

  const mimeType = pickRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
    if (blob.size === 0) {
      handlers.onError(uiText("noSound"));
      handlers.onEnd();
      return;
    }
    handlers.onRecorded?.(blob);
    void (async () => {
      try {
        const text = await transcribeAudio(blob, language);
        if (!text.trim()) {
          handlers.onError(uiText("noSpeech"));
        } else {
          handlers.onResult(text.trim());
        }
      } catch (err) {
        handlers.onError(err instanceof ApiError ? err.message : uiText("genericError"));
      } finally {
        handlers.onEnd();
      }
    })();
  };
  recorder.start();
  handlers.onStart?.();
  return { stop: () => recorder.stop() };
}

// ------------------------------------------------------------------ speak

export interface SpeechController {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

export interface SpeakHandlers {
  onStart?: () => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

/** Texte lisible a voix haute : sans syntaxe Markdown ni renvois aux sources. */
function plainText(text: string): string {
  return text
    .replace(/\s*[[(]\s*Sources?\s*\d+[^\])]*[\])]/gi, "")
    .replace(/\*\*|__|#{1,6}\s+/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    // Tableaux : ligne de separation supprimee, cellules lues comme une enumeration.
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "")
    .replace(/^\s*\|\s*|\s*\|\s*$/gm, "")
    .replace(/\s*\|\s*/g, ", ")
    .trim();
}

/** Langue BCP 47 des voix du navigateur — seules le francais et l'anglais
 * en ont partout ; aucun navigateur ne propose le wolof, le pulaar, le
 * sereer ou le diola. */
const BROWSER_VOICE_LANG: Partial<Record<VoiceLanguage, string>> = { fr: "fr-FR", en: "en-US" };



/** Lecture par la synthese vocale du navigateur (speechSynthesis), utilisee
 * quand le backend ne fournit pas de voix. Renvoie null si la langue n'a
 * pas de voix disponible. */
function speakWithBrowser(text: string, language: VoiceLanguage, handlers: SpeakHandlers): SpeechController | null {
  const bcp47 = BROWSER_VOICE_LANG[language];
  if (!bcp47 || typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(plainText(text));
  utterance.lang = bcp47;
  const prefix = bcp47.slice(0, 2);
  const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix));
  // Privilegie les voix « naturelles » / premium quand le systeme en propose.
  utterance.voice =
    voices.find((v) => /natural|premium|enhanced|google/i.test(v.name)) ?? voices.find((v) => v.default) ?? voices[0] ?? null;
  utterance.rate = 1;
  utterance.onend = () => handlers.onEnd();
  utterance.onerror = (e) => {
    if (e.error !== "canceled" && e.error !== "interrupted") handlers.onError(uiText("genericError"));
    handlers.onEnd();
  };
  synth.speak(utterance);
  return {
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    cancel: () => synth.cancel(),
  };
}

/**
 * Reads `text` aloud. Tries the backend voice first (`/api/voice/speak`);
 * if the backend has none (501, or any failure), falls back to the
 * browser's own speech synthesis for French/English. `audioEl` is the
 * shared <audio> element the caller owns; this function only drives it.
 */
export async function speakText(
  text: string,
  language: VoiceLanguage,
  audioEl: HTMLAudioElement | null,
  handlers: SpeakHandlers
): Promise<SpeechController | null> {
  try {
    if (!audioEl) throw new ApiError(uiText("genericError"));
    const blob = await synthesizeSpeech(plainText(text), language);
    const url = URL.createObjectURL(blob);
    audioEl.src = url;
    audioEl.onended = () => {
      URL.revokeObjectURL(url);
      handlers.onEnd();
    };
    await audioEl.play();
    handlers.onStart?.();
    return {
      pause: () => audioEl.pause(),
      resume: () => void audioEl.play(),
      cancel: () => {
        audioEl.pause();
        audioEl.removeAttribute("src");
        URL.revokeObjectURL(url);
      },
    };
  } catch (err) {
    const controller = speakWithBrowser(text, language, handlers);
    if (controller) {
      handlers.onStart?.();
      return controller;
    }
    // Langue sans voix (501) : message general ; sinon la vraie raison donnee par le serveur
    // (ex. limite quotidienne du service vocal wolof atteinte).
    const serverMessage = err instanceof ApiError && err.status !== 501 && err.status !== undefined ? err.message : null;
    handlers.onError(serverMessage ?? uiText("playbackUnavailable"));
    handlers.onEnd();
    return null;
  }
}
