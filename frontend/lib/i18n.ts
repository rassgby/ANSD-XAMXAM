"use client";

/**
 * Langue de l'interface : la langue choisie par l'utilisateur s'applique a tous les textes
 * (en-tete, historique, boutons, messages). Composants : `useUi()` ; modules hors React
 * (micro, lecture audio) : `uiText()`, qui suit la derniere langue fixee par `setUiLanguage()`.
 */
import { createContext, useCallback, useContext } from "react";
import type { Lang } from "./languages";
import { UI_TEXTS, type UiKey } from "./ui-texts";

export type { UiKey };
type Vars = Record<string, string | number>;

const HTML_LANG: Record<Lang, string> = { FR: "fr", EN: "en", WO: "wo", FF: "ff", SRR: "srr", DYO: "dyo" };
let currentLang: Lang = "FR";

/** Langue courante pour `uiText()`, et attribut `lang` de la page (lecteurs d'ecran, traduction). */
export function setUiLanguage(lang: Lang): void {
  currentLang = lang;
  if (typeof document !== "undefined") document.documentElement.lang = HTML_LANG[lang] ?? "fr";
}

export function uiText(key: UiKey, vars?: Vars, lang: Lang = currentLang): string {
  let text = UI_TEXTS[lang]?.[key] ?? UI_TEXTS.FR[key];
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  return text;
}

const UiLangContext = createContext<Lang>("FR");
export const UiLangProvider = UiLangContext.Provider;

/** Traduction dans la langue choisie : `const t = useUi(); t("newChat")`. */
export function useUi(): (key: UiKey, vars?: Vars) => string {
  const lang = useContext(UiLangContext);
  return useCallback((key: UiKey, vars?: Vars) => uiText(key, vars, lang), [lang]);
}
