"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { RotateCcw, X } from "lucide-react";
import type { Citation, DetailSource } from "@/lib/api";
import { useUi } from "@/lib/i18n";
import { CopyButton } from "./AnswerButtons";
import { RichText } from "./RichText";

/** Fenetre « Voir plus » : explication detaillee de la reponse, centree. Fermeture
 * par la croix, Echap ou un clic en dehors. */
export function DetailsModal({
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
