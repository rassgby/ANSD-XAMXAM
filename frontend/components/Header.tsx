import styles from "./Header.module.css";
import { LanguageSelect } from "./LanguageSelect";
import type { Lang } from "@/lib/languages";

export type { Lang };

/**
 * `onLangChange` is optional: the static-reference screens render the
 * language menu with a fixed `activeLang` and no wiring. `extra` is an
 * optional slot before the language menu.
 */
export default function Header({
  activeLang,
  onLangChange,
  extra,
}: {
  activeLang: Lang;
  onLangChange?: (lang: Lang) => void;
  extra?: React.ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.name}>XAMXAM</span>
        <span className={styles.tagline}>Statistiques — ANSD</span>
      </div>
      <div className={styles.right}>
        {extra}
        <LanguageSelect value={activeLang} onChange={onLangChange} />
      </div>
    </header>
  );
}
