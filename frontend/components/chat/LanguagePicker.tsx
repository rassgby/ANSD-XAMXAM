"use client";

import { motion } from "motion/react";
import { Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGS, LANG_LABELS, welcome, type Lang } from "@/lib/languages";

/**
 * Choix de la langue au centre de l'ecran d'accueil : toutes les langues sont
 * visibles d'un coup (pas de menu a ouvrir), la langue active est pleine.
 * Une fois la conversation commencee, le menu deroulant de l'en-tete prend le relais.
 */
export function LanguagePicker({
  value,
  onChange,
  delay = 0,
}: {
  value: Lang;
  onChange: (lang: Lang) => void;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex w-full flex-col items-center gap-3"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-800">
        <Globe2 size={17} className="text-brand-500" />
        {welcome(value).pickLanguage}
      </p>
      <div role="radiogroup" aria-label="Langue" className="flex flex-wrap justify-center gap-2.5">
        {LANGS.map((code) => {
          const selected = code === value;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(code)}
              className={cn(
                "h-11 rounded-full border px-5 text-[15px] font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
                selected
                  ? "border-brand-600 bg-brand-600 text-white shadow-md"
                  : "border-slate-200 bg-white text-brand-800 hover:border-brand-300 hover:bg-brand-50"
              )}
            >
              {LANG_LABELS[code]}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
