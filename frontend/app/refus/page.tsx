import type { Metadata } from "next";
import Header from "@/components/Header";
import QuestionBar from "@/components/QuestionBar";
import QuestionHeading from "@/components/QuestionHeading";
import TintPanel from "@/components/TintPanel";
import Citation from "@/components/Citation";
import { SendArrowIcon } from "@/components/icons";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Refus explicite — XAM-XAM" };

const GRANULARITY = [
  { level: "Région", value: "EHCVM, RGPH-5, ENES", muted: false },
  {
    level: "Département",
    value: "RGPH-5, Situations économiques et sociales régionales",
    muted: false,
  },
  {
    level: "Commune, quartier",
    value: "aucune publication de revenu à ce niveau",
    muted: true,
  },
];

const REROUTES = [
  "Quelle est la dépense moyenne par personne dans la région de Dakar ?",
  "Comment l'incidence de la pauvreté varie-t-elle entre les départements de Dakar ?",
];

/**
 * Refus explicite — pas de rouge, pas d'icône d'alerte, pas de ton
 * d'excuse : traité avec la même dignité visuelle que les réponses
 * positives, c'est tout l'enjeu de cet écran.
 */
export default function RefusPage() {
  return (
    <div className={styles.screen}>
      <Header activeLang="FR" />

      <main className={styles.main}>
        <div className={styles.content}>
          <QuestionHeading question="Quel est le revenu moyen par quartier à Dakar ?" />

          <div className={styles.body}>
            <p className={styles.answerText}>
              Cette donnée n&rsquo;existe pas dans les publications de
              l&rsquo;ANSD. Aucune opération statistique diffusée ne descend
              au niveau du quartier : l&rsquo;échantillon de l&rsquo;EHCVM
              est représentatif au niveau régional, et le RGPH-5 publie les
              revenus agrégés par département, pas par quartier. Je ne
              produis pas d&rsquo;estimation en l&rsquo;absence de source.
            </p>

            <TintPanel label="Granularité disponible">
              <div className={styles.granularityRows}>
                {GRANULARITY.map((row, i) => (
                  <div key={row.level}>
                    <div className={styles.granularityRow}>
                      <span className={styles.granularityLabel}>{row.level}</span>
                      <span
                        className={
                          row.muted ? styles.granularityValueMuted : styles.granularityValue
                        }
                      >
                        {row.value}
                      </span>
                    </div>
                    {i < GRANULARITY.length - 1 && (
                      <div className={styles.granularityDivider} />
                    )}
                  </div>
                ))}
              </div>
            </TintPanel>

            <div className={styles.reroutes}>
              <span className={styles.reroutesHeading}>
                Deux questions auxquelles je peux répondre
              </span>
              <div className={styles.reroutesList}>
                {REROUTES.map((question) => (
                  <button key={question} type="button" className={styles.reroute}>
                    <span className={styles.rerouteLabel}>{question}</span>
                    <SendArrowIcon stroke="#0B6E4F" />
                  </button>
                ))}
              </div>
            </div>

            <Citation
              title="Note méthodologique EHCVM, plan de sondage et niveaux de représentativité"
              meta="ANSD — publiée en 2023 — section 2.3, page 12"
            />
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBar}>
          <QuestionBar
            variant="footer"
            placeholder="Reformulez votre question"
            showMic={false}
          />
        </div>
      </footer>
    </div>
  );
}
