import type { Metadata } from "next";
import Header from "@/components/Header";
import QuestionBar from "@/components/QuestionBar";
import QuestionHeading from "@/components/QuestionHeading";
import ReliabilityBadge from "@/components/ReliabilityBadge";
import Citation from "@/components/Citation";
import ActionButton from "@/components/ActionButton";
import { TableIcon } from "@/components/icons";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Réponse avec graphique — XAM-XAM" };

// Annotation de l'artboard (hors maquette) : valeurs à remplacer par les
// données EHCVM réelles une fois la couche structurée branchée. La mise à
// l'échelle de l'axe (0–50 sur 248px de tracé) doit être conservée.
const CHART_AXIS_MAX = 50;
const CHART_TRACK_PX = 248;
const POVERTY_SERIES = [
  { year: "2018-2019", value: 37.8 },
  { year: "2019-2020", value: 36.5 },
  { year: "2020-2021", value: 35.4 },
  { year: "2021-2022", value: 34.2 },
];
const Y_AXIS_TICKS = [50, 40, 30, 20, 10, 0];

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} %`;
}

export default function ReponseGraphiquePage() {
  const lastIndex = POVERTY_SERIES.length - 1;
  return (
    <div className={styles.screen}>
      <Header activeLang="FR" />

      <main className={styles.main}>
        <div className={styles.content}>
          <QuestionHeading question="Comment la pauvreté a-t-elle évolué depuis 2018 ?" />

          <div className={styles.introRow}>
            <p className={styles.introText}>
              L&rsquo;incidence de la pauvreté monétaire recule sur la
              période : elle passe de <strong className="tabular">37,8 %</strong>{" "}
              de la population en 2018-2019 à{" "}
              <strong className="tabular">34,2 %</strong> en 2021-2022. La
              baisse est plus marquée en milieu urbain qu&rsquo;en milieu
              rural.
            </p>
            <div className={styles.badgeSlot}>
              <ReliabilityBadge label="Valeurs lues en base et vérifiées" />
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitleGroup}>
                <span className={styles.cardTitle}>
                  Incidence de la pauvreté monétaire, Sénégal
                </span>
                <span className={styles.cardSubtitle}>
                  Part de la population vivant sous le seuil de pauvreté, en
                  pour cent
                </span>
              </div>
              <ActionButton icon={<TableIcon />} label="Voir le tableau source" />
            </div>

            <div className={styles.chartArea}>
              <div className={`${styles.yAxis} tabular`}>
                {Y_AXIS_TICKS.map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>
              <div className={styles.plotColumn}>
                <div className={styles.plotArea}>
                  {[0, 20, 40, 60, 80].map((pct) => (
                    <div
                      key={pct}
                      className={styles.gridline}
                      style={{ top: `${pct}%` }}
                    />
                  ))}
                  <div className={styles.bars}>
                    {POVERTY_SERIES.map((point, i) => (
                      <div key={point.year} className={styles.barGroup}>
                        <span className={`${styles.barValue} tabular`}>
                          {formatPercent(point.value)}
                        </span>
                        <div
                          className={
                            i === lastIndex ? `${styles.bar} ${styles.barLatest}` : styles.bar
                          }
                          style={{
                            height: (point.value / CHART_AXIS_MAX) * CHART_TRACK_PX,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`${styles.xAxis} tabular`}>
                  {POVERTY_SERIES.map((point) => (
                    <span key={point.year}>{point.year}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span
                  className={styles.legendSwatch}
                  style={{ width: 12, height: 12, background: "var(--c-primary)" }}
                />
                <span className={styles.legendLabel}>
                  Incidence de la pauvreté, ensemble du pays
                </span>
              </div>
              <div className={styles.legendItem}>
                <span
                  className={styles.legendSwatch}
                  style={{ width: 12, height: 3, background: "var(--c-gold)" }}
                />
                <span className={styles.legendLabel}>Dernière valeur publiée</span>
              </div>
            </div>
          </div>

          <Citation
            title="Enquête harmonisée sur les conditions de vie des ménages (EHCVM), rapport de synthèse"
            meta="ANSD — publiée en 2023 — tableau 5.2, page 61"
          />
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBar}>
          <QuestionBar
            variant="footer"
            placeholder="Posez une autre question"
            showMic={false}
          />
        </div>
      </footer>
    </div>
  );
}
