import styles from "./Citation.module.css";

/**
 * Ligne de citation — filet bleu à gauche, publication + éditeur + date + page.
 * The blue rule signals "documentary layer" throughout the product, per the
 * palette: le bleu signale la source documentaire.
 */
export default function Citation({
  title,
  meta,
  href = "#",
}: {
  title: string;
  meta: string;
  href?: string;
}) {
  return (
    <div className={styles.citation}>
      <span className={styles.link}>
        <a href={href}>{title}</a>
      </span>
      <span className={`${styles.meta} tabular`}>{meta}</span>
    </div>
  );
}
