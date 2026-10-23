"use client";

import { useState, type FormEvent } from "react";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import type { FeedbackRating } from "@/lib/api";
import { useUi } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** « Réponse utile / pas utile » sous une reponse. « Pas utile » ouvre un champ de commentaire
 * facultatif. `onRate` envoie l'avis (et le garde avec la discussion) ; il rejette en cas d'echec. */
export function FeedbackButtons({
  value,
  onRate,
}: {
  value?: FeedbackRating;
  onRate: (rating: FeedbackRating, comment?: string) => Promise<void>;
}) {
  const t = useUi();
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function rate(rating: FeedbackRating, text?: string) {
    setState("sending");
    try {
      await onRate(rating, text);
      setState("sent");
      // Le champ reste ouvert apres le seul vote « pas utile » : le commentaire peut suivre.
      if (rating === "up" || text) {
        setCommenting(false);
        setComment("");
      }
    } catch {
      setState("error");
    }
  }

  function chooseDown() {
    setCommenting(true);
    // Le « pas utile » est enregistre tout de suite ; le commentaire, s'il vient, le complete.
    if (value !== "down") void rate("down");
  }

  function submitComment(e: FormEvent) {
    e.preventDefault();
    if (comment.trim()) void rate("down", comment);
    else setCommenting(false);
  }

  const button = (rating: FeedbackRating) => {
    const active = value === rating;
    const Icon = rating === "up" ? ThumbsUp : ThumbsDown;
    return (
      <button
        type="button"
        onClick={() => (rating === "up" ? void rate("up") : chooseDown())}
        disabled={state === "sending"}
        aria-pressed={active}
        aria-label={t(rating === "up" ? "feedbackUp" : "feedbackDown")}
        title={t(rating === "up" ? "feedbackUp" : "feedbackDown")}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
          active
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-slate-200 bg-white text-slate-500 hover:border-brand-300 hover:text-brand-700"
        )}
      >
        <Icon size={16} fill={active ? "currentColor" : "none"} />
      </button>
    );
  };

  return (
    <div className="flex basis-full flex-col gap-2 sm:basis-auto">
      <div className="flex items-center gap-1.5">
        {button("up")}
        {button("down")}
        {state === "sending" && <Loader2 size={14} className="animate-spin text-slate-400" />}
        <span aria-live="polite" className={cn("text-xs", state === "error" ? "text-red-600" : "text-slate-500")}>
          {state === "sent" && !commenting ? t("feedbackThanks") : state === "error" ? t("feedbackError") : ""}
        </span>
      </div>
      {commenting && (
        <form onSubmit={submitComment} className="flex w-full max-w-md gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            autoFocus
            placeholder={t("feedbackCommentPlaceholder")}
            aria-label={t("feedbackCommentPlaceholder")}
            className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {t("feedbackSend")}
          </button>
        </form>
      )}
    </div>
  );
}
