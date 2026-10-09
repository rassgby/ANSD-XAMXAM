"use client";

import { useState } from "react";
import styles from "./TracePanel.module.css";
import { CheckIcon, CloseIcon, CopyIcon, InfoIcon, PublicationIcon } from "./icons";
import { publicationUrl, type Citation, type SourceDocument } from "@/lib/api";

function pageLabel(citation: Citation): string {
  if (citation.page_start == null) return "—";
  if (citation.page_end == null || citation.page_end === citation.page_start) {
    return `Page ${citation.page_start}`;
  }
  return `Pages ${citation.page_start}–${citation.page_end}`;
}

function formattedCitation(citation: Citation, source: SourceDocument | undefined): string {
  const parts = [`« ${citation.quote} »`, citation.document_title];
  if (source?.publisher) parts.push(source.publisher);
  if (source?.publication_date) parts.push(source.publication_date);
  parts.push(pageLabel(citation));
  return parts.join(" — ");
}

/**
 * Panneau de traçabilité — version branchée sur le vrai backend Mistral.
 * Volontairement plus court que la maquette d'origine : "valeur brute avant
 * arrondi", "règle d'arrondi" et "identifiant de cellule en base" supposaient
 * une couche structurée déterministe que ce backend (citations PDF) n'a pas
 * — voir backend/README.md. Les champs ci-dessous sont tous dérivés de la
 * vraie réponse de l'API.
 */
export default function TracePanel({
  question,
  citation,
  source,
  onClose,
}: {
  question: string;
  citation: Citation;
  source: SourceDocument | undefined;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formattedCitation(citation, source));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable (e.g. insecure context) — nothing to fall back to silently
    }
  }

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Question", value: question },
    { label: "Publication", value: citation.document_title },
    { label: "Éditeur", value: source?.publisher ?? "Non communiqué par l'API" },
    { label: "Date de publication", value: source?.publication_date ?? "Non communiqué par l'API" },
    { label: "Page", value: pageLabel(citation) },
  ];

  return (
    <aside className={styles.panel} aria-label="Traçabilité de la citation">
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Traçabilité de la citation</span>
        <button type="button" className={styles.closeButton} aria-label="Fermer le panneau" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className={styles.panelBody}>
        <div className={styles.verification}>
          {citation.verified ? <CheckIcon /> : <InfoIcon stroke="var(--c-gray)" />}
          <span className={styles.verificationText}>
            {citation.verified
              ? "Cette citation a été retrouvée mot pour mot dans le texte extrait de la page indiquée."
              : "Cette citation n'a pas pu être retrouvée automatiquement dans le texte extrait de cette page — à vérifier manuellement avant diffusion."}
          </span>
        </div>

        <div className={styles.rows}>
          {rows.map((row, i) => (
            <div key={row.label} className={i === rows.length - 1 ? `${styles.row} ${styles.rowLast}` : styles.row}>
              <span className={styles.rowLabel}>{row.label}</span>
              <span className={styles.rowValue}>{row.value}</span>
            </div>
          ))}
          <div className={`${styles.row} ${styles.rowLast}`}>
            <span className={styles.rowLabel}>Citation exacte</span>
            <span className={styles.rowValueQuote}>&laquo; {citation.quote} &raquo;</span>
          </div>
        </div>
      </div>

      <div className={styles.panelActions}>
        {source && (
          <a
            className={styles.actionSolid}
            href={publicationUrl(source.filename, citation.page_start)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <PublicationIcon />
            <span className={styles.actionSolidLabel}>Consulter la publication</span>
          </a>
        )}
        <button type="button" className={styles.actionOutline} onClick={handleCopy}>
          <CopyIcon />
          <span className={styles.actionOutlineLabel}>Copier la citation formatée</span>
        </button>
        {copied && <span className={styles.copyFeedback}>Citation copiée.</span>}
      </div>
    </aside>
  );
}
