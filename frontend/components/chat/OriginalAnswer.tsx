"use client";

import type { QueryResponse } from "@/lib/api";
import { useUi } from "@/lib/i18n";
import { RichText } from "./RichText";

/** Reponse traduite automatiquement en wolof : le texte francais d'origine, a deplier.
 * Pas pour le pulaar : la reponse s'affiche seule (choix de presentation). */
export function OriginalAnswer({ response }: { response: QueryResponse }) {
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
