"use client";

import { BookOpen, Info, Loader2, Pause, RotateCcw, Volume2 } from "lucide-react";
import { GENERIC_ERROR_MESSAGE, stripStreamMarkers, type FeedbackRating } from "@/lib/api";
import { useUi } from "@/lib/i18n";
import type { Turn } from "@/lib/sessions";
import { CopyButton } from "./AnswerButtons";
import { FeedbackButtons } from "./FeedbackButtons";
import { OriginalAnswer } from "./OriginalAnswer";
import { RichText } from "./RichText";
import { SourceLinks } from "./SourceLinks";
import { TypingIndicator } from "./TypingIndicator";

/** Reponse d'un echange : en cours de reception, erreur, conversation courante, conseils,
 * sans donnees, ou reponse complete avec ses sources et sa barre d'actions. */
export function TurnAnswer({
  turn,
  isBusy,
  speakingStatus,
  onRetry,
  onOpenDetails,
  onListen,
  onFeedback,
}: {
  turn: Turn;
  isBusy: boolean;
  /** Lecture audio de cette reponse (null : pas en cours). */
  speakingStatus: "loading" | "playing" | "paused" | null;
  onRetry: () => void;
  onOpenDetails: () => void;
  onListen: () => void;
  onFeedback: (rating: FeedbackRating, comment?: string) => Promise<void>;
}) {
  const t = useUi();
  return (
    <>
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
              onClick={onRetry}
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
              onClick={onOpenDetails}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
            >
              <BookOpen size={16} />
              {t("details")}
            </button>

            {/* « Réponse audio » : pour toutes les reponses, question ecrite ou vocale. */}
            <button
              type="button"
              onClick={onListen}
              aria-label={t("listenLabel")}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              {(() => {
                const status = speakingStatus;
                if (status === "loading") return <Loader2 size={16} className="animate-spin" />;
                if (status === "playing") return <Pause size={16} />;
                return <Volume2 size={16} />;
              })()}
              {(() => {
                const status = speakingStatus;
                if (status === "loading") return t("preparing");
                if (status === "playing") return t("pause");
                if (status === "paused") return t("resume");
                return t("listen");
              })()}
            </button>

            <CopyButton answer={turn.response.answer} citations={turn.response.citations} />

            <FeedbackButtons value={turn.feedback} onRate={onFeedback} />
          </div>


        </>
      )}
    </>
  );
}
