import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DetailSource } from "@/lib/api";

/**
 * Affiche le texte du modele sans laisser apparaitre la syntaxe Markdown :
 * `**gras**` devient du gras, les lignes « - … » / « 1. … » de vraies listes,
 * les titres « ### … » une ligne en gras. Les renvois du type
 * « [Source 3 - …, p.11] » sont retires du texte — les sources sont deja
 * affichees en cartes sous la reponse. Aucun HTML n'est injecte : tout est
 * construit en elements React.
 */

const SOURCE_REF = /\s*[[(]\s*Sources?\s*\d+[^\])]*[\])]/gi;
const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;
// Ligne de separation Markdown (« --- », « *** », « ___ ») : ignoree.
const HORIZONTAL_RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
// Citation (« > … ») : le texte est garde, le chevron retire.
const QUOTE = /^\s*>\s?/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** Lien vers la page d'une source citee dans le texte (#page=N). */
export function detailSourceHref(src: DetailSource): string | null {
  if (!src.url) return null;
  const base = src.url.split("#")[0];
  return src.page ? `${base}#page=${src.page}` : base;
}

/** Titre court pour un lien dans le texte (le titre complet est en info-bulle). */
function shortTitle(title: string): string {
  return title.length > 32 ? `${title.slice(0, 30).trimEnd()}…` : title;
}

function SourceRefLink({ src }: { src: DetailSource }) {
  const href = detailSourceHref(src);
  const label = `${shortTitle(src.title)}${src.page ? ` · p. ${src.page}` : ""}`;
  const title = `${src.title}${src.page ? `, page ${src.page}` : ""}`;
  const className =
    "mx-0.5 inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border border-brand-100 bg-brand-50/70 px-1.5 py-px align-baseline font-sans text-[12px] font-medium text-brand-700";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={`Ouvrir ${title}`} className={cn(className, "hover:border-brand-300 hover:text-brand-900")}>
      {label}
      <ArrowUpRight size={11} />
    </a>
  ) : (
    <span title={title} className={className}>
      {label}
    </span>
  );
}

function renderInline(text: string, keyPrefix: string, refs?: Map<number, DetailSource>): ReactNode[] {
  return text
    .replace(/\*{3,}/g, "**") // « ****titre**** » (titre deja en gras) -> gras simple
    .split(/(\*\*[^*]+\*\*|\[\[\d+\]\])/g)
    .filter(Boolean)
    .map((part, i) => {
      const ref = /^\[\[(\d+)\]\]$/.exec(part);
      if (ref) {
        // Reference a une source : lien en place, ou rien si la source est inconnue.
        const src = refs?.get(Number(ref[1]));
        return src ? <SourceRefLink key={`${keyPrefix}-${i}`} src={src} /> : null;
      }
      return part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      ) : (
        // Marqueurs isoles restants (`*`, `__`, code `…`, liens [texte](adresse)) : on garde le texte.
        part
          .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, "$1")
          .replace(/`+/g, "")
          .replace(/\*\*|__/g, "")
          .replace(/(^|\s)[*_](\S)/g, "$1$2")
          .replace(/(\S)[*_](\s|[.,;:!?]|$)/g, "$1$2")
      );
    });
}

export type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "h"; text: string }
  | { kind: "table"; rows: string[][] };

/** Decoupe le texte du modele en blocs (paragraphes, listes, titres, tableaux) —
 * partage avec la copie (lib/copy.ts) pour que le copie respecte l'affichage. */
export function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(SOURCE_REF, "").split("\n")) {
    const last = blocks[blocks.length - 1];
    const isTableSeparator = last?.kind === "table" && TABLE_SEPARATOR.test(raw);
    if (HORIZONTAL_RULE.test(raw) && !isTableSeparator) {
      blocks.push({ kind: "p", lines: [] }); // une separation vaut une fin de paragraphe
      continue;
    }
    const line = raw.replace(QUOTE, "").trimEnd();
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
    } else if (TABLE_ROW.test(line) || (last?.kind === "table" && TABLE_SEPARATOR.test(line))) {
      // Tableau Markdown (« | a | b | ») ; la ligne de separation « |---|---| » est ignoree.
      if (TABLE_SEPARATOR.test(line)) continue;
      if (last?.kind === "table") last.rows.push(tableCells(line));
      else blocks.push({ kind: "table", rows: [tableCells(line)] });
    } else if (HEADING.test(line)) {
      blocks.push({ kind: "h", text: line.replace(HEADING, "") });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const kind = BULLET.test(line) ? "ul" : "ol";
      const item = line.replace(kind === "ul" ? BULLET : NUMBERED, "");
      if (last?.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last?.kind === "p") {
      last.lines.push(line.trim());
    } else {
      blocks.push({ kind: "p", lines: [line.trim()] });
    }
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : true));
}

export function RichText({
  text,
  className,
  sources,
}: {
  text: string;
  className?: string;
  /** Sources des references [[n]] du texte (explication detaillee). */
  sources?: DetailSource[];
}) {
  const refs = sources ? new Map(sources.map((s) => [s.n, s])) : undefined;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {parse(text).map((block, i) => {
        if (block.kind === "h") {
          return (
            <p key={i} className="font-sans font-semibold text-slate-900">
              {renderInline(block.text, `h${i}`, refs)}
            </p>
          );
        }
        if (block.kind === "table") {
          const [head, ...body] = block.rows;
          return (
            <div key={i} className="overflow-x-auto rounded-xl border border-slate-200 font-sans">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-brand-50 text-brand-900">
                  <tr>
                    {head.map((cell, j) => (
                      <th key={j} className="px-3 py-2 align-top font-semibold">
                        {renderInline(cell, `th${i}-${j}`, refs)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, r) => (
                    <tr key={r} className="border-t border-slate-100">
                      {row.map((cell, j) => (
                        <td key={j} className={cn("px-3 py-2 align-top text-slate-700", j > 0 && "tabular-nums")}>
                          {renderInline(cell, `td${i}-${r}-${j}`, refs)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind !== "p") {
          const List = block.kind;
          return (
            <List
              key={i}
              className={cn("flex flex-col gap-1.5 pl-5", block.kind === "ul" ? "list-disc" : "list-decimal")}
            >
              {block.items.map((item, j) => (
                <li key={j} className="pl-1 marker:text-brand-400">
                  {renderInline(item, `${i}-${j}`, refs)}
                </li>
              ))}
            </List>
          );
        }
        return <p key={i}>{renderInline(block.lines.join(" "), `p${i}`, refs)}</p>;
      })}
    </div>
  );
}
