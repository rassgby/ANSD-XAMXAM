import type { Metadata } from "next";
import Header from "@/components/Header";
import QuestionBar from "@/components/QuestionBar";
import QuestionHeading from "@/components/QuestionHeading";
import ReliabilityBadge from "@/components/ReliabilityBadge";
import TintPanel, { TintPanelBody } from "@/components/TintPanel";
import Citation from "@/components/Citation";
import ActionButton from "@/components/ActionButton";
import { TrendIcon, CopyIcon, InfoIcon } from "@/components/icons";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Réponse chiffrée sourcée — XAM-XAM" };

export default function ReponseChiffreePage() {
  return (
    <div className={styles.screen}>
      <Header activeLang="FR" />

      <main className={styles.main}>
        <div className={styles.content}>
          {/* Continuité de la conversation : question précédente, atténuée. */}
          <div className={styles.priorTurn}>
            <span className={styles.priorQuestion}>
              Quelle est l&rsquo;espérance de vie en 2023 ?
            </span>
            <p className={styles.priorAnswer}>
              L&rsquo;espérance de vie à la naissance est estimée à{" "}
              <strong className="tabular">68,7 ans</strong> en 2023, soit 66,5
              ans pour les hommes et 70,9 ans pour les femmes.
            </p>
          </div>

          <div className={styles.divider} />

          <QuestionHeading question="Quel est le taux de chômage au Sénégal ?" />

          <div className={styles.answerBlock}>
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
              <div className={styles.badgeSlot}>
                <ReliabilityBadge label="Valeur lue en base et vérifiée" />
              </div>
            </div>

            <p className={styles.answerText}>
              Au quatrième trimestre 2025, le taux de chômage s&rsquo;établit
              à <strong className="tabular">5,4 %</strong> selon la
              définition stricte du Bureau international du travail, et à{" "}
              <strong className="tabular">23,3 %</strong> lorsqu&rsquo;on
              retient la définition élargie. Les deux valeurs décrivent la
              même population active mais ne comptent pas les mêmes personnes.
            </p>

            <TintPanel label="Définition du concept">
              <TintPanelBody>
                Le <strong>chômage au sens strict</strong> ne retient que les
                personnes sans emploi, disponibles et ayant effectué une
                démarche de recherche pendant la période de référence. Le{" "}
                <strong>chômage élargi</strong> ajoute la main-d&rsquo;œuvre
                potentielle : les personnes disponibles qui ne cherchent plus
                activement, souvent faute de perspectives locales.
                L&rsquo;écart entre 5,4 % et 23,3 % mesure donc le
                découragement, non une contradiction entre deux sources.
              </TintPanelBody>
            </TintPanel>

            <Citation
              title="Enquête nationale sur l'emploi au Sénégal (ENES), résultats du quatrième trimestre 2025"
              meta="ANSD — publiée en février 2026 — tableau 3.1, page 24"
            />

            <div className={styles.actions}>
              <ActionButton icon={<TrendIcon />} label="Voir l'évolution trimestrielle" />
              <ActionButton icon={<CopyIcon />} label="Copier la citation" />
              <ActionButton icon={<InfoIcon />} label="Traçabilité de la valeur" />
            </div>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBar}>
          <QuestionBar variant="footer" placeholder="Posez une autre question" />
        </div>
      </footer>
    </div>
  );
}
