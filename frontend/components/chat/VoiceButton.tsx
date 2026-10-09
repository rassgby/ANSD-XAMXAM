"use client";

import { useUi } from "@/lib/i18n";
import { motion } from "motion/react";
import { Keyboard, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zone de saisie du mode vocal : un grand bouton micro a toucher pour
 * parler (la reconnaissance s'arrete toute seule apres un silence, ou au
 * second toucher), et un lien discret pour repasser a l'ecrit.
 */
export function VoiceButton({
  listening,
  disabled,
  onClick,
  onSwitchToText,
  notice,
  size = "large",
}: {
  listening: boolean;
  disabled?: boolean;
  onClick: () => void;
  onSwitchToText?: () => void;
  /** Message affiche sous le bouton (ex. langue non prise en charge). */
  notice?: string | null;
  size?: "large" | "compact";
}) {
  const t = useUi();
  const large = size === "large";
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative">
        {listening && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-brand-400/40"
            animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <motion.button
          type="button"
          onClick={onClick}
          disabled={disabled && !listening}
          whileTap={{ scale: 0.94 }}
          aria-label={listening ? t("stopAndSend") : t("speakQuestion")}
          aria-pressed={listening}
          className={cn(
            "relative flex items-center justify-center rounded-full text-white shadow-glow transition-colors disabled:opacity-40",
            large ? "h-20 w-20" : "h-14 w-14",
            listening ? "bg-gradient-to-br from-red-500 to-red-600" : "bg-gradient-to-br from-brand-500 to-brand-700"
          )}
        >
          {listening ? <Square size={large ? 26 : 20} fill="currentColor" /> : <Mic size={large ? 32 : 24} />}
        </motion.button>
      </div>

      <p className="text-sm font-medium text-slate-500" aria-live="polite">
        {listening ? t("listeningTap") : t("tapToSpeak")}
      </p>

      {notice && <p className="max-w-sm text-center text-xs text-red-600">{notice}</p>}

      {onSwitchToText && (
        <button
          type="button"
          onClick={onSwitchToText}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-700"
        >
          <Keyboard size={14} />
          {t("writeInstead")}
        </button>
      )}
    </div>
  );
}
