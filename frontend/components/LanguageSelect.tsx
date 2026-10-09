"use client";

import { useUi } from "@/lib/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGS, LANG_LABELS, type Lang } from "@/lib/languages";

/**
 * Selecteur de langue en menu deroulant, partage par les deux en-tetes
 * (ChatHeader sur /accueil, Header sur /vocal et les ecrans de reference).
 * Un menu plutot que des boutons cote a cote : six langues ne tiennent pas
 * sur un ecran de telephone. `onChange` est optionnel — sans lui (ecrans
 * statiques) le choix reste purement local.
 */
export function LanguageSelect({ value, onChange }: { value: Lang; onChange?: (lang: Lang) => void }) {
  const t = useUi();
  const [localValue, setLocalValue] = useState(value);
  const current = onChange ? value : localValue;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(LANGS.indexOf(current));
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    setActive(LANGS.indexOf(current));
    listRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, current]);

  function select(lang: Lang) {
    if (onChange) onChange(lang);
    else setLocalValue(lang);
    setOpen(false);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % LANGS.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + LANGS.length) % LANGS.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(LANGS[active]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t("language")} : ${LANG_LABELS[current]}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-2.5 pr-2 text-xs font-semibold text-brand-800 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 sm:h-10 sm:gap-2 sm:pl-3.5 sm:pr-3 sm:text-sm"
      >
        <Globe2 size={15} className="shrink-0 text-brand-500" />
        <span>{LANG_LABELS[current]}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={t("chooseLanguage")}
            aria-activedescendant={`${listId}-${LANGS[active]}`}
            onKeyDown={onListKeyDown}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-50 mt-2 w-44 origin-top-right rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg outline-none"
          >
            {LANGS.map((code, i) => (
              <li
                key={code}
                id={`${listId}-${code}`}
                role="option"
                aria-selected={code === current}
                onClick={() => select(code)}
                onPointerMove={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-sm",
                  i === active && "bg-brand-50",
                  code === current ? "font-semibold text-brand-800" : "text-slate-600"
                )}
              >
                {LANG_LABELS[code]}
                {code === current && <Check size={15} className="text-brand-600" />}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
