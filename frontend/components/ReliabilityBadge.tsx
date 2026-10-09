import styles from "./ReliabilityBadge.module.css";
import { CheckIcon } from "./icons";

/**
 * Étiquette de fiabilité — sobre, jamais un badge marketing. Confirms a value
 * was read from the base and passed the deterministic validator.
 */
export default function ReliabilityBadge({ label }: { label: string }) {
  return (
    <div className={styles.badge}>
      <CheckIcon />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
