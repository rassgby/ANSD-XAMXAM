import type { Metadata } from "next";
import Header from "@/components/Header";
import QuestionBar from "@/components/QuestionBar";
import QuestionHeading from "@/components/QuestionHeading";
import ReliabilityBadge from "@/components/ReliabilityBadge";
import { CloseIcon, CopyIcon, PublicationIcon } from "@/components/icons";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Panneau de traçabilité — XAM-XAM" };

type TraceRow = { label: string; value: string; variant?: "mono" | "strong" };

const TRACE_ROWS: TraceRow[] = [
  { label: "Indicateur", value: "Taux de chômage, sens strict du BIT" },
  { label: "Zone géographique", value: "Sénégal, ensemble du pays" },
  { label: "Période", value: "Quatrième trimestre 2025" },
  { label: "Valeur brute", value: "5,4213", variant: "mono" },
  { label: "Règle d'arrondi", value: "Une décimale, arrondi au plus proche" },
  { label: "Valeur affichée", value: "5,4 %", variant: "strong" },
  {
    label: "Publication",
    value: "Enquête nationale sur l'emploi au Sénégal (ENES), T4 2025",
  },
  { label: "Éditeur", value: "ANSD, Dakar" },
  { label: "Date de publication", value: "12 février 2026" },
  { label: "Page du tableau", value: "Tableau 3.1, page 24" },
];

/**
 * Panneau de traçabilité — rend le validateur déterministe tangible :
 * indicateur, zone, période, valeur brute, règle d'arrondi, publication,
 * éditeur, date, page, et l'identifiant de cellule en base.
 */
export default function TracabilitePage() {
  return (
    <div className={styles.screen}>
      <Header activeLang="FR" />

      <div className={styles.body}>
        <div className={styles.conversation}>
          <div className={styles.conversationContent}>
            <QuestionHeading question="Quel est le taux de chômage au Sénégal ?" />

            <div className={styles.figures}>
              <div className={styles.figure}>
                <span className={`${styles.figureValue} ${styles.figureValuePrimary} tabular`}>
                  5,4 %
                </span>
                <span className={styles.figureLabel}>au sens strict du BIT</span>
              </div>
              <div className={styles.figureDivider} />
              <div className={styles.figure}>
                <span className={`${styles.figureValue} ${styles.figureValueDeep} tabular`}>
                  23,3 %
                </span>
                <span className={styles.figureLabel}>au sens élargi</span>
              </div>
            </div>

            <p className={styles.answerText}>
              Au quatrième trimestre 2025, le taux de chômage s&rsquo;établit
              à{" "}
              <span className={`${styles.highlight} tabular`}>5,4 %</span>{" "}
              selon la définition stricte du Bureau international du travail,
              et à 23,3 % au sens élargi.
            </p>

            <div
              style={{
                borderLeft: "2px solid var(--c-blue)",
                paddingLeft: 16,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--c-ink)" }}>
                <a
                  href="#"
                  style={{
                    color: "var(--c-blue)",
                    fontWeight: 500,
                    borderBottom: "1px solid #A9C2D1",
                  }}
                >
                  Enquête nationale sur l&rsquo;emploi au Sénégal (ENES),
                  quatrième trimestre 2025
                </a>
              </span>
              <span className="tabular" style={{ fontSize: 12, color: "var(--c-gray)" }}>
                ANSD — publiée en février 2026 — tableau 3.1, page 24
              </span>
            </div>
          </div>

          <div className={styles.conversationFooter}>
            <QuestionBar
              variant="footer"
              placeholder="Posez une autre question"
              showMic={false}
            />
          </div>
        </div>

        <aside className={styles.panel} aria-label="Traçabilité de la valeur">
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>Traçabilité de la valeur</span>
            <button type="button" className={styles.closeButton} aria-label="Fermer le panneau">
              <CloseIcon />
            </button>
          </div>

          <div className={styles.panelBody}>
            <ReliabilityBadge label="Lue en base, contrôlée par le validateur" />

            <div className={styles.rows}>
              {TRACE_ROWS.map((row, i) => (
                <div
                  key={row.label}
                  className={i === TRACE_ROWS.length - 1 ? `${styles.row} ${styles.rowLast}` : styles.row}
                >
                  <span className={styles.rowLabel}>{row.label}</span>
                  <span
                    className={
                      row.variant === "mono"
                        ? `${styles.rowValueMono} tabular`
                        : row.variant === "strong"
                          ? `${styles.rowValueStrong} tabular`
                          : `${styles.rowValue} tabular`
                    }
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.cellIdBox}>
              <span className={styles.cellIdLabel}>Identifiant de la cellule en base</span>
              <span className={styles.cellIdValue}>enes.t4_2025.chomage_bit.sen.total</span>
            </div>
          </div>

          <div className={styles.panelActions}>
            <button type="button" className={styles.actionSolid}>
              <PublicationIcon />
              <span className={styles.actionSolidLabel}>Consulter la publication</span>
            </button>
            <button type="button" className={styles.actionOutline}>
              <CopyIcon />
              <span className={styles.actionOutlineLabel}>Copier la citation formatée</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
