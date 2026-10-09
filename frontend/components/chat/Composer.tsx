"use client";

import { useUi } from "@/lib/i18n";
import { useLayoutEffect, useRef } from "react";
import { motion } from "motion/react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Purely presentational — mic capture itself is owned by the parent page
 * (see app/accueil/page.tsx's handleMicClick) rather than by this
 * component, because pressing the mic must survive the hero → conversation
 * layout swap: the hero instance of Composer unmounts the moment the first
 * turn appears (mid-recording, by design — see the page for why), and a
 * capture state living inside Composer would be lost at exactly that
 * moment. The footer instance that mounts right after reflects the same
 * `listening` prop from the parent, so the mic button stays in sync.
 */
export function Composer({
  variant,
  placeholder,
  value,
  onChange,
  onSubmit,
  onCancel,
  listening,
  onMicClick,
  disabled = false,
  autoFocus = false,
  inputRef,
}: {
  variant: "hero" | "footer";
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Echap : abandonne la saisie en cours (question relancee). */
  onCancel?: () => void;
  listening: boolean;
  onMicClick: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}) {
  const t = useUi();
  const isHero = variant === "hero";
  const localRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? localRef;

  // La zone grandit avec le texte (Maj + Entree = nouvelle ligne), jusqu'a
  // environ 6 lignes, puis defile.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    el.style.overflowY = el.scrollHeight > 160 ? "auto" : "hidden";
  }, [value, textareaRef]);

  function submit() {
    if (!disabled && value.trim()) onSubmit();
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      {/* Mic errors (permission denied, transcription failure…) surface as
          the affected chat turn's own error bubble instead of a banner
          here — see handleMicClick in app/accueil/page.tsx. */}
      <div
        className={cn(
          "flex w-full items-end gap-2 rounded-2xl border border-slate-200/80 bg-white/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-shadow focus-within:border-brand-300 focus-within:shadow-glow",
          isHero ? "p-2 pl-4 sm:p-2.5 sm:pl-5" : "p-1.5 pl-4"
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onCancel) {
              e.preventDefault();
              onCancel();
              return;
            }
            // Entree envoie ; Maj + Entree passe a la ligne.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={listening ? t("listening") : placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          className={cn(
            "min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 font-medium leading-6 text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:opacity-60",
            isHero ? "text-base" : "text-sm"
          )}
        />

        <button
          type="button"
          aria-label={listening ? t("stopDictation") : t("dictate")}
          aria-pressed={listening}
          onClick={onMicClick}
          disabled={disabled && !listening}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40",
            isHero ? "h-11 w-11" : "h-9 w-9",
            listening
              ? "animate-pulse border-red-300 bg-red-50 text-red-600"
              : "border-slate-200 bg-white text-slate-500 hover:border-brand-300 hover:text-brand-600"
          )}
        >
          {listening ? <Square size={15} /> : <Mic size={17} />}
        </button>

        <motion.button
          type="button"
          aria-label={t("send")}
          disabled={disabled || !value.trim()}
          whileHover={disabled || !value.trim() ? undefined : { scale: 1.05 }}
          whileTap={disabled || !value.trim() ? undefined : { scale: 0.95 }}
          onClick={submit}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow transition-opacity disabled:opacity-40 disabled:shadow-none",
            isHero ? "h-11 w-11 gap-1.5 text-sm font-semibold sm:w-auto sm:px-4" : "h-9 w-9"
          )}
        >
          {isHero && <span className="hidden sm:inline">Interroger</span>}
          <ArrowUp size={isHero ? 16 : 17} strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  );
}
