import styles from "./QuestionBar.module.css";
import { MicIcon, SendArrowIcon } from "./icons";

/**
 * Champ de question — le composant partagé pour l'état vide (hero) et le fil
 * de conversation (footer). Le micro est un bouton séparé et clairement
 * distinct de l'envoi, comme demandé dans le brief.
 *
 * Two modes:
 * - Uncontrolled (no `value`/`onChange`/`onSubmit` passed): a real, focusable
 *   input with no wiring — used by the four screens that stay static design
 *   references (`/reponse-chiffree`, `/reponse-graphique`, `/refus`,
 *   `/tracabilite`).
 * - Controlled (`value`/`onChange`/`onSubmit` passed): the live query flow on
 *   `/accueil` — Enter or the send button calls `onSubmit`.
 *
 * The mic button is separately optional (`onMicClick`): `/vocal` is the only
 * screen that wires it, to start/stop a recording independently of the text
 * flow above.
 */
export default function QuestionBar({
  variant,
  placeholder,
  showMic = true,
  micTone = "ink",
  sendLabel,
  value,
  onChange,
  onSubmit,
  onMicClick,
  micRecording = false,
  disabled = false,
  autoFocus = false,
}: {
  variant: "hero" | "footer";
  placeholder: string;
  showMic?: boolean;
  micTone?: "ink" | "primary";
  sendLabel?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onMicClick?: () => void;
  micRecording?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const isHero = variant === "hero";
  const isControlled = onSubmit !== undefined;

  function submit() {
    if (!disabled) onSubmit?.();
  }

  return (
    <div className={`${styles.bar} ${isHero ? styles.hero : styles.footer}`}>
      <input
        type="text"
        className={isHero ? styles.placeholderHero : styles.placeholderFooter}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        {...(isControlled
          ? {
              value: value ?? "",
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value),
              onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              },
            }
          : {})}
      />
      {showMic && (
        <button
          type="button"
          aria-label={micRecording ? "Arrêter l'écoute" : "Dicter la question au microphone"}
          aria-pressed={onMicClick ? micRecording : undefined}
          onClick={onMicClick}
          disabled={disabled}
          className={`${styles.iconButton} ${isHero ? styles.micHero : styles.micFooter} ${
            micTone === "primary" ? styles.iconButtonPrimaryOutline : ""
          }`}
        >
          <MicIcon
            size={isHero ? 18 : 17}
            stroke={micRecording ? "#B3261E" : micTone === "primary" ? "#0B6E4F" : "#1B1F23"}
          />
        </button>
      )}
      {isHero ? (
        <button
          type="button"
          className={styles.sendHero}
          aria-label={sendLabel || "Interroger"}
          disabled={disabled}
          onClick={isControlled ? submit : undefined}
        >
          <span className={styles.sendHeroLabel}>{sendLabel}</span>
          <SendArrowIcon />
        </button>
      ) : (
        <button
          type="button"
          className={styles.sendFooter}
          aria-label="Envoyer la question"
          disabled={disabled}
          onClick={isControlled ? submit : undefined}
        >
          <SendArrowIcon />
        </button>
      )}
    </div>
  );
}
