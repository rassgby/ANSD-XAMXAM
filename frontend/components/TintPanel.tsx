import styles from "./TintPanel.module.css";

/**
 * Encadré teinté réutilisé pour la définition du concept, la granularité
 * disponible et le glossaire — fond #F2F6F4, jamais de couleur d'alerte.
 */
export default function TintPanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}

export function TintPanelBody({ children }: { children: React.ReactNode }) {
  return <p className={styles.body}>{children}</p>;
}
