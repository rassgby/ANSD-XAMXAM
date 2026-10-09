import type { Language } from "./api";

/** Langues proposees dans l'interface, dans l'ordre d'affichage du menu. */
export type Lang = "FR" | "WO" | "EN" | "FF" | "SRR" | "DYO";

// Langues proposees : le sereer et le diola ne sont pas offerts (le type `Lang`
// les garde pour ne pas casser les donnees deja enregistrees).
export const LANGS: Lang[] = ["FR", "WO", "FF", "EN"];

/** Nom affiche dans le selecteur. */
export const LANG_LABELS: Record<Lang, string> = {
  FR: "Français",
  WO: "Wolof",
  EN: "English",
  FF: "Pulaar",
  SRR: "Sérère",
  DYO: "Diola",
};

/** Code envoye au backend (ISO 639 : ff = pulaar/peul, srr = sereer, dyo = jola-fonyi). */
export const LANG_TO_API: Record<Lang, Language> = {
  FR: "fr",
  WO: "wo",
  EN: "en",
  FF: "ff",
  SRR: "srr",
  DYO: "dyo",
};

/**
 * Invite de l'ecran « nouvelle discussion », dans la langue choisie.
 * Pulaar, sereer et diola : a completer avec une traduction validee par des
 * locuteurs — en attendant, le texte francais est affiche (une traduction
 * approximative serait pire pour un service officiel).
 */
export const NEW_CHAT_PROMPT: Record<Lang, string | null> = {
  FR: "Que voulez-vous savoir ?",
  EN: "What would you like to know?",
  WO: "Lan nga bëgg xam ?",
  FF: "Ko a yiɗi anndude ?",
  SRR: null,
  DYO: null,
};

export function newChatPrompt(lang: Lang): string {
  return NEW_CHAT_PROMPT[lang] ?? (NEW_CHAT_PROMPT.FR as string);
}

/** Un mot du titre d'accueil ; `highlight` = reflet degrade colore. */
export type HeroWord = { text: string; highlight?: boolean };

/** Textes du grand accueil (premiere visite), dans la langue choisie. */
export type Welcome = {
  /** Titre, une ligne par tableau. */
  hero: HeroWord[][];
  /** Presentation : texte avant, partie mise en valeur (les langues), texte apres. */
  intro: { before: string; languages: string; after: string };
  /** Invite au-dessus des boutons de langue. */
  pickLanguage: string;
  /** Champ de saisie. */
  placeholder: string;
};

const FR_WELCOME: Welcome = {
  hero: [
    [{ text: "Le" }, { text: "Sénégal" }, { text: "en chiffres,", highlight: true }],
    [{ text: "à" }, { text: "portée" }, { text: "de" }, { text: "question." }],
  ],
  intro: {
    before: "Posez votre question en ",
    languages: "français, wolof, pulaar ou anglais",
    after: ". Chaque chiffre vient d’une publication officielle de l’ANSD, citée avec sa page.",
  },
  pickLanguage: "Choisissez votre langue",
  placeholder: "Posez une question…",
};

/**
 * Pulaar, sereer et diola : a completer avec une traduction validee par des
 * locuteurs — en attendant, le texte francais est affiche.
 * Wolof : ecrit a la main, simple (orthographe CLAD) ; a faire valider par un locuteur.
 */
export const WELCOME: Record<Lang, Welcome | null> = {
  FR: FR_WELCOME,
  EN: {
    hero: [
      [{ text: "Senegal" }, { text: "in" }, { text: "figures,", highlight: true }],
      [{ text: "one" }, { text: "question" }, { text: "away." }],
    ],
    intro: {
      before: "Ask your question in ",
      languages: "French, Wolof, Pulaar or English",
      after: ". Every figure comes from an official ANSD publication, cited with its page.",
    },
    pickLanguage: "Choose your language",
    placeholder: "Ask a question…",
  },
  WO: {
    hero: [
      [{ text: "Senegaal" }, { text: "ci" }, { text: "lim yi,", highlight: true }],
      [{ text: "laajal" }, { text: "rekk." }],
    ],
    intro: {
      before: "Laajal sa laaj ci ",
      languages: "farañse, wolof, pulaar walla àngale",
      after: ". Lim yu nekk ci publikaasioŋ bu ANSD la bawoo, te ñu tudd ko ak xët mi.",
    },
    pickLanguage: "Tànnal sa làkk",
    placeholder: "Laajal ab laaj…",
  },
  // Pulaar : premiere version, a faire valider par un locuteur.
  FF: {
    hero: [
      [{ text: "Senegaal" }, { text: "e" }, { text: "limooje,", highlight: true }],
      [{ text: "e" }, { text: "dow" }, { text: "ko" }, { text: "naamndaa." }],
    ],
    intro: {
      before: "Naamndu naamndal maa e ",
      languages: "farayse, wolof, pulaar walla engele",
      after: ". Kala limooru ummorii ko e bayyinaango laawɗungo ANSD, tawi kelle mum ina kolliraa.",
    },
    pickLanguage: "Suɓo ɗemngal maa",
    placeholder: "Naamndu naamndal…",
  },
  SRR: null,
  DYO: null,
};

export function welcome(lang: Lang): Welcome {
  return WELCOME[lang] ?? FR_WELCOME;
}

const PREFERRED_LANG_KEY = "ansd-rag:lang";

/** Derniere langue choisie (premiere visite ou menu de l'en-tete) : une nouvelle
 * discussion s'ouvre dans cette langue, meme apres un rechargement. */
export function loadPreferredLang(): Lang | null {
  try {
    const value = localStorage.getItem(PREFERRED_LANG_KEY);
    return value && (LANGS as string[]).includes(value) ? (value as Lang) : null;
  } catch {
    return null;
  }
}

export function savePreferredLang(lang: Lang): void {
  try {
    localStorage.setItem(PREFERRED_LANG_KEY, lang);
  } catch {
    // stockage indisponible : la langue reste valable pour la visite en cours
  }
}
