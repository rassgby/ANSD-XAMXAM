import { ArrowUpRight } from "lucide-react";
import { useUi } from "@/lib/i18n";
import { publicationUrl, type Citation } from "@/lib/api";

/** Lien vers la page citee : PDF officiel sur ansd.sn ouvert a la bonne page
 * (reponses plus anciennes sans adresse : lien de consultation du backend). */
export function citationHref(c: Citation): string {
  const base = (c.url ?? publicationUrl(c.document_id)).split("#")[0];
  return c.page_start ? `${base}#page=${c.page_start}` : base;
}

/**
 * « Sources » juste sous la reponse, en liste a puces : une source par point
 * (document + page, sans doublon). Le lien ouvre le PDF officiel a la bonne
 * page dans un nouvel onglet.
 */
export function SourceLinks({ citations }: { citations: Citation[] }) {
  const t = useUi();
  const unique = [...new Map(citations.map((c) => [`${c.document_title}#${c.page_start}`, c])).values()];
  if (unique.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-semibold text-slate-700">{t("sources")}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-brand-400">
        {unique.map((c) => (
          <li key={`${c.document_title}#${c.page_start}`} className="pl-1">
            <a
              href={citationHref(c)}
              target="_blank"
              rel="noopener noreferrer"
              title={c.page_start ? t("openSourcePage", { title: c.document_title, page: c.page_start }) : t("openSource", { title: c.document_title })}
              className="inline-flex max-w-full items-center gap-1 font-medium text-brand-700 underline-offset-2 hover:text-brand-900 hover:underline"
            >
              <span className="truncate">{c.document_title}</span>
              {c.page_start && <span className="shrink-0 text-brand-500">— {t("page")} {c.page_start}</span>}
              <ArrowUpRight size={14} className="shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
