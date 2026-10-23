"use client";

import { useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import type { Citation, DetailSource } from "@/lib/api";
import { copyAnswer } from "@/lib/copy";
import { useUi } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** « Relancer » : obtenir une nouvelle reponse a la meme question (icone a
 * cote de la bulle de la question). */
export function RegenerateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
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
export function CopyButton({
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
