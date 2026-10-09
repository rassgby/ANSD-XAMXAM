import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Sommaire des écrans — XAM-XAM" };

const SCREENS = [
  {
    href: "/accueil",
    name: "1 — Accueil",
    desc: "En direct : interface de chat, questions réelles, réponses sourcées ou refus explicites.",
  },
  {
    href: "/reponse-chiffree",
    name: "2 — Réponse chiffrée sourcée",
    desc: "Référence statique. Chiffre mis en avant, définition du concept, citation ENES.",
  },
  {
    href: "/reponse-graphique",
    name: "3 — Réponse avec graphique",
    desc: "Référence statique. Évolution de la pauvreté, graphique en barres, citation EHCVM.",
  },
  {
    href: "/refus",
    name: "4 — Refus explicite",
    desc: "Référence statique. Donnée hors périmètre, granularité disponible, reformulations proposées.",
  },
  {
    href: "/tracabilite",
    name: "5 — Panneau de traçabilité",
    desc: "Référence statique — voir la version réelle et simplifiée sur /accueil. Détail de provenance d'une valeur.",
  },
  {
    href: "/vocal",
    name: "6 — Mode vocal wolof",
    desc: "En direct : dictée au micro, transcription wolof, réponse sourcée, lecture à voix haute.",
  },
];

/**
 * Sommaire des écrans — pas un écran du produit : sert de point d'entrée
 * pour naviguer entre les six vues implémentées. `/` redirige directement
 * vers `/accueil` (le produit réel) ; ce sommaire reste accessible ici pour
 * parcourir les références de design statiques (`/accueil` et `/vocal` sont
 * les deux écrans réellement branchés sur le backend).
 */
export default function SommairePage() {
  return (
    <div className={styles.page}>
      <span className={styles.eyebrow}>XAM-XAM — Statistiques officielles, ANSD</span>
      <h1 className={styles.title}>Écrans implémentés</h1>
      <p className={styles.lede}>
        Six écrans de l&rsquo;assistant conversationnel des statistiques
        officielles du Sénégal, d&rsquo;après la maquette approuvée.
      </p>

      <nav className={styles.list} aria-label="Liste des écrans">
        {SCREENS.map((screen, i) => (
          <div className={styles.item} key={screen.href}>
            <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
            <div className={styles.itemBody}>
              <span className={styles.itemName}>
                <Link href={screen.href}>{screen.name}</Link>
              </span>
              <span className={styles.itemDesc}>{screen.desc}</span>
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
