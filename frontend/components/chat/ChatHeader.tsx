"use client";

import { useUi } from "@/lib/i18n";
import Image from "next/image";
import { motion } from "motion/react";
import { PanelLeft, ShieldCheck, SquarePen } from "lucide-react";
import { LanguageSelect } from "@/components/LanguageSelect";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/languages";

/**
 * Logo a gauche, titre « Assistant de l'ANSD » au centre, actions a droite.
 * A partir de md le titre est centre en absolu sur toute la largeur ; en
 * dessous il reste dans le flux (entre logo et actions) pour ne jamais
 * chevaucher le selecteur de langue sur un petit ecran.
 */
export function ChatHeader({
  lang,
  onLangChange,
  onNewChat,
  showNewChat,
  onToggleSidebar,
  sidebarOpen = false,
  showLanguage = true,
}: {
  /** Menu de langue de l'en-tete : masque sur l'ecran d'accueil, ou le choix des
   * langues est affiche au centre de la page. */
  showLanguage?: boolean;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onNewChat: () => void;
  showNewChat: boolean;
  /** Present des qu'il existe un historique : affiche le bouton qui ouvre
   * (mobile) ou replie (ordinateur) la barre des discussions. */
  onToggleSidebar?: () => void;
  /** Barre ouverte sur ordinateur : son propre bouton « Nouvelle
   * discussion » suffit, celui de l'en-tete est alors masque a partir de md. */
  sidebarOpen?: boolean;
}) {
  const t = useUi();
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-900/5 bg-white/70 px-4 backdrop-blur-xl sm:gap-3 sm:px-10">
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={t("toggleHistory")}
            title={t("history")}
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-700"
          >
            <PanelLeft size={19} />
          </button>
        )}
        <Image
          src="/ansd-logo.png"
          alt="ANSD — Agence Nationale de la Statistique et de la Démographie"
          width={259}
          height={194}
          priority
          className="h-9 w-auto shrink-0 sm:h-11"
        />
        <div className="hidden h-8 w-px shrink-0 bg-slate-200 md:block" />
        <div className="hidden flex-col leading-tight md:flex">
          <span className="text-base font-extrabold text-brand-900">XAMXAM</span>
          <span className="text-[11px] font-medium text-slate-500">{t("tagline")}</span>
        </div>
      </div>

      {/* Sur telephone, pendant une conversation, le bouton « Nouvelle
          conversation » prend la place : le titre n'apparait alors qu'a
          partir de sm. */}
      <div
        className={cn(
          "min-w-0 flex-1 justify-center md:pointer-events-none md:absolute md:inset-x-0 md:top-1/2 md:-translate-y-1/2",
          showNewChat ? "hidden sm:flex" : "flex"
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex min-w-0 items-center gap-1.5 text-sm font-bold tracking-tight text-brand-700 sm:gap-2 sm:text-lg md:pointer-events-auto"
        >
          <ShieldCheck className="hidden h-5 w-5 shrink-0 text-brand-500 sm:block" />
          <span className="truncate">{t("assistant")}</span>
        </motion.div>
      </div>

      <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
        {showNewChat && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onNewChat}
            aria-label={t("newChat")}
            title={t("newChat")}
            className={cn(
              "flex h-9 w-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-brand-800 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 sm:h-10 sm:w-10 lg:w-auto lg:px-3.5",
              sidebarOpen && "md:hidden"
            )}
          >
            <SquarePen size={15} className="shrink-0" />
            <span className="hidden lg:inline">{t("newChat")}</span>
          </motion.button>
        )}
        {showLanguage && <LanguageSelect value={lang} onChange={onLangChange} />}
      </div>
    </header>
  );
}
