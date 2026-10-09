"use client";

import { useUi } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MessageSquare, Pencil, Search, SquarePen, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { groupSessions, sessionMatches, type ChatSession } from "@/lib/sessions";

interface SidebarProps {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

/** Champ de renommage en place : Entree ou clic ailleurs = valider, Echap = annuler. */
function RenameInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const t = useUi();
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function finish(title: string | null) {
    if (done.current) return;
    done.current = true;
    onDone(title);
  }

  return (
    <input
      ref={ref}
      value={value}
      maxLength={60}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(value)}
      aria-label={t("newTitle")}
      className="w-full rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-semibold text-brand-900 shadow-sm outline-none ring-2 ring-brand-100"
    />
  );
}

function SidebarContent({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onClose,
}: SidebarProps & { onClose?: () => void }) {
  const t = useUi();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const groups = groupSessions(sessions.filter((s) => sessionMatches(s, query)), Date.now(), {
    today: t("today"), yesterday: t("yesterday"), last7Days: t("last7Days"), older: t("older"),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-brand-800 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          <SquarePen size={16} className="shrink-0 text-brand-600" />
          {t("newChat")}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeHistory")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="shrink-0 px-3 pb-1">
        <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition-colors focus-within:border-brand-300">
          <Search size={15} className="shrink-0 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder={t("searchChats")}
            aria-label={t("searchChats")}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clearSearch")}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <nav aria-label={t("history")} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-slate-400">
            {t("noMatch", { query: query.trim() })}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mt-3 first:mt-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {group.sessions.map((s) => {
                const active = s.id === activeId;
                if (editingId === s.id) {
                  return (
                    <li key={s.id} className="px-0.5 py-0.5">
                      <RenameInput
                        initial={s.title}
                        onDone={(title) => {
                          setEditingId(null);
                          if (title !== null) onRename(s.id, title);
                        }}
                      />
                    </li>
                  );
                }
                // Toujours visibles sur ecran tactile (pas de survol) et pour la discussion active
                const actionVisibility = active ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100";
                return (
                  <li key={s.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      onDoubleClick={() => setEditingId(s.id)}
                      aria-current={active ? "page" : undefined}
                      title={t("renameHint", { title: s.title })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg py-2 pl-3 pr-16 text-left text-sm transition-colors",
                        active
                          ? "bg-brand-100/70 font-semibold text-brand-900"
                          : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                      )}
                    >
                      <MessageSquare size={14} className={cn("shrink-0", active ? "text-brand-600" : "text-slate-400")} />
                      <span className="truncate">{s.title}</span>
                    </button>
                    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setEditingId(s.id)}
                        aria-label={t("renameChat", { title: s.title })}
                        title={t("rename")}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-brand-700 focus-visible:opacity-100",
                          actionVisibility
                        )}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t("confirmDelete", { title: s.title }))) onDelete(s.id);
                        }}
                        aria-label={t("deleteChat", { title: s.title })}
                        title={t("delete")}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-red-600 focus-visible:opacity-100",
                          actionVisibility
                        )}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

/**
 * Historique des discussions facon ChatGPT. A partir de md : colonne fixe
 * a gauche (repliable via le bouton de l'en-tete). En dessous : tiroir qui
 * glisse depuis la gauche par-dessus la page.
 */
export function SessionSidebar({
  desktopOpen,
  mobileOpen,
  onMobileClose,
  ...props
}: SidebarProps & { desktopOpen: boolean; mobileOpen: boolean; onMobileClose: () => void }) {
  return (
    <>
      <AnimatePresence initial={false}>
        {desktopOpen && (
          <motion.aside
            key="desktop"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="hidden shrink-0 overflow-hidden border-r border-slate-200/80 bg-slate-50/80 md:block"
          >
            <div className="h-full w-[272px]">
              <SidebarContent {...props} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
              className="absolute inset-y-0 left-0 w-[85%] max-w-[300px] bg-slate-50 shadow-2xl"
            >
              <SidebarContent
                {...props}
                onClose={onMobileClose}
                onSelect={(id) => {
                  props.onSelect(id);
                  onMobileClose();
                }}
                onNew={() => {
                  props.onNew();
                  onMobileClose();
                }}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
