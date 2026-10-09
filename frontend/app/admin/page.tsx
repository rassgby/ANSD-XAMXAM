"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Keyboard,
  Languages,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  Mic,
  RefreshCw,
  ScrollText,
  SearchX,
  X,
  type LucideIcon,
} from "lucide-react";
import { ColumnChart, fmt, Meter, RankedBars } from "@/components/admin/charts";
import { ApiError, GENERIC_ERROR_MESSAGE } from "@/lib/api";
import {
  fetchAdminQuestions,
  fetchAdminStats,
  loadAdminToken,
  saveAdminToken,
  type AdminStats,
  type LoggedQuestion,
  type QuestionStatus,
} from "@/lib/admin";
import { cn } from "@/lib/utils";

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 0, label: "Tout" },
];

const LANGUAGE_NAMES: Record<string, string> = {
  fr: "Français",
  wo: "Wolof",
  en: "English",
  ff: "Pulaar",
  srr: "Sérère",
  dyo: "Diola",
};

const STATUS_TABS: { value: QuestionStatus; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "answered", label: "Répondues" },
  { value: "no_data", label: "Sans données" },
  { value: "error", label: "Erreurs" },
];

const PAGE_SIZE = 20;

// Le Senegal est a UTC+0 toute l'annee : heures et jours UTC du backend = heure de Dakar.
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Dakar",
});

function seconds(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
}

function compact(n: number): string {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

// ------------------------------------------------------------------ page

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(loadAdminToken());
    setReady(true);
  }, []);

  function logout() {
    saveAdminToken(null);
    setToken(null);
  }

  if (!ready) return null;
  return token ? (
    <Dashboard token={token} onLogout={logout} />
  ) : (
    <Login
      onSuccess={(t) => {
        saveAdminToken(t);
        setToken(t);
      }}
    />
  );
}

// ------------------------------------------------------------------ connexion

function Login({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await fetchAdminStats(password.trim(), 7); // valide le mot de passe
      onSuccess(password.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/ansd-logo.png" alt="ANSD" width={259} height={194} className="h-12 w-auto" priority />
          <div>
            <h1 className="text-lg font-bold text-brand-900">Tableau de bord</h1>
            <p className="text-sm text-slate-500">Assistant de l&rsquo;ANSD — accès administrateur</p>
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Mot de passe administrateur
          <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-brand-400">
            <LockKeyhole size={16} className="shrink-0 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none"
            />
          </div>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-glow transition-opacity disabled:opacity-50"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          Se connecter
        </button>
      </form>
    </main>
  );
}

// ------------------------------------------------------------------ tableau de bord

type SectionId = "overview" | "activity" | "usage" | "content" | "gaps" | "log" | "performance";

const SECTIONS: { id: SectionId; hash: string; label: string; icon: LucideIcon; description: string }[] = [
  { id: "overview", hash: "vue-ensemble", label: "Vue d'ensemble", icon: LayoutDashboard, description: "Les chiffres clés de l'assistant" },
  { id: "activity", hash: "activite", label: "Activité", icon: BarChart3, description: "Quand l'assistant est utilisé" },
  { id: "usage", hash: "langues-usages", label: "Langues & usages", icon: Languages, description: "Langues, écrit ou vocal, interactions avec les réponses" },
  { id: "content", hash: "sujets-sources", label: "Sujets & sources", icon: BookOpen, description: "Ce qui est demandé et les publications qui y répondent" },
  { id: "gaps", hash: "sans-donnees", label: "Demandes sans données", icon: SearchX, description: "Questions que le corpus ne couvre pas encore — à prioriser pour l'enrichir" },
  { id: "log", hash: "journal", label: "Journal des questions", icon: ScrollText, description: "Toutes les questions, les plus récentes en premier" },
  { id: "performance", hash: "performance", label: "Performance & coûts", icon: Gauge, description: "Rapidité, fiabilité et consommation du modèle" },
];

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  // Rubrique dans l'adresse (#activite…) : conservee au rechargement, partageable.
  // Suit aussi les changements d'adresse (lien direct, bouton « Précédent »).
  useEffect(() => {
    const sync = () => {
      const fromHash = SECTIONS.find((s) => s.hash === window.location.hash.slice(1));
      if (fromHash) setSection(fromHash.id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function openSection(id: SectionId) {
    setSection(id);
    setMenuOpen(false);
    const hash = SECTIONS.find((s) => s.id === id)!.hash;
    window.history.pushState(null, "", `#${hash}`);
    window.scrollTo({ top: 0 });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchAdminStats(token, days));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onLogout();
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [token, days, onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = SECTIONS.find((s) => s.id === section)!;
  const nav = (
    <SidebarNav
      section={section}
      onSelect={openSection}
      gaps={stats?.kpis.no_data}
      onLogout={onLogout}
    />
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Barre laterale — fixe a partir de lg */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-white lg:block">{nav}</aside>

      {/* Tiroir — telephone et tablette */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[88%] max-w-[300px] bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Fermer le menu"
              className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Barre du haut — telephone et tablette */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
          >
            <Menu size={20} />
          </button>
          <Image src="/ansd-logo.png" alt="ANSD" width={259} height={194} className="h-8 w-auto" />
          <p className="truncate text-sm font-bold text-brand-900">Tableau de bord</p>
        </header>

        <main className="flex w-full flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
          {/* Titre de la rubrique + filtres (une seule ligne, au-dessus de ce qu'ils filtrent) */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-900 sm:text-2xl">
                <current.icon size={22} className="text-brand-600" />
                {current.label}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{current.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Période">
                {PERIODS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setDays(p.days)}
                    aria-pressed={days === p.days}
                    className={cn(
                      "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                      days === p.days ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void load()}
                aria-label="Actualiser"
                title={
                  stats
                    ? `Mis à jour à ${new Date(stats.generated_at * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
                    : "Actualiser"
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700"
              >
                <RefreshCw size={16} className={cn(loading && "animate-spin")} />
              </button>
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} /> {error}
            </p>
          )}

          {!stats ? (
            <div className="flex justify-center py-24">
              <Loader2 size={28} className="animate-spin text-brand-500" />
            </div>
          ) : (
            // Rechargement : on garde l'affichage precedent, attenue (pas de saut).
            <div className={cn("flex flex-col gap-6 transition-opacity", loading && "opacity-60")}>
              {stats.kpis.questions === 0 && section !== "log" && (
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                  Aucune question posée sur la période choisie. Les indicateurs se rempliront dès que l&rsquo;assistant
                  sera utilisé.
                </p>
              )}
              <SectionContent section={section} stats={stats} days={days} token={token} onLogout={onLogout} onOpen={openSection} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarNav({
  section,
  onSelect,
  gaps,
  onLogout,
}: {
  section: SectionId;
  onSelect: (id: SectionId) => void;
  gaps?: number;
  onLogout: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-5 pt-5">
        <Image src="/ansd-logo.png" alt="ANSD" width={259} height={194} className="h-10 w-auto shrink-0" />
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-bold text-brand-900">Tableau de bord</p>
          <p className="text-xs text-slate-500">Assistant de l&rsquo;ANSD</p>
        </div>
      </div>

      <nav aria-label="Rubriques du tableau de bord" className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = id === section;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                    active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon size={18} className={cn("shrink-0", active ? "text-brand-600" : "text-slate-400")} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {id === "gaps" && !!gaps && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-800">
                      {fmt.format(gaps)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-1 border-t border-slate-100 p-3">
        <Link
          href="/accueil"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-brand-700"
        >
          <ArrowUpRight size={18} className="text-slate-400" />
          Ouvrir l&rsquo;assistant
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-red-700"
        >
          <LogOut size={18} className="text-slate-400" />
          Déconnexion
        </button>
      </div>
    </div>
  );
}

function SectionContent({
  section,
  stats,
  days,
  token,
  onLogout,
  onOpen,
}: {
  section: SectionId;
  stats: AdminStats;
  days: number;
  token: string;
  onLogout: () => void;
  onOpen: (id: SectionId) => void;
}) {
  const k = stats.kpis;
  const periodText = days ? `Sur les ${days} derniers jours` : "Sur toute la période";

  const perDayChart = (height: number) => (
    <ColumnChart
      ariaLabel="Nombre de questions par jour"
      valueLabel="questions"
      height={height}
      tickEvery={Math.max(1, Math.ceil(stats.per_day.length / 8))}
      data={stats.per_day.map((d) => ({
        key: d.date,
        label: dateFmt.format(new Date(d.date)),
        value: d.total,
        tooltip: {
          title: new Date(d.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
          rows: [
            { label: "Répondues", value: fmt.format(d.answered) },
            { label: "Sans données", value: fmt.format(d.no_data) },
          ],
        },
      }))}
    />
  );

  switch (section) {
    case "overview":
      return (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Card className="col-span-2 flex flex-col justify-between gap-3 lg:row-span-2">
              <p className="text-sm font-medium text-slate-500">Questions posées</p>
              <p className="text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">{fmt.format(k.questions)}</p>
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-sm">
                <div>
                  <p className="text-slate-500">Répondues</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt.format(k.questions - k.no_data)}</p>
                </div>
                <button type="button" onClick={() => onOpen("gaps")} className="text-left">
                  <p className="text-slate-500 underline-offset-2 hover:underline">Sans données</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt.format(k.no_data)}</p>
                </button>
              </div>
            </Card>
            <Stat label="Utilisateurs" value={fmt.format(k.users)} hint="navigateurs distincts" />
            <Stat
              label="Discussions"
              value={fmt.format(k.sessions)}
              hint={k.sessions ? `${(k.questions / k.sessions).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} questions en moyenne` : undefined}
            />
            <Stat label="Taux de réponse" value={`${k.answer_rate.toLocaleString("fr-FR")} %`} hint="questions couvertes par les publications">
              <Meter value={k.answer_rate} label="Taux de réponse" />
            </Stat>
            <Stat label="Temps de réponse" value={seconds(k.avg_latency_ms)} hint="en moyenne" />
          </section>
          <Card>
            <CardTitle title="Questions par jour" subtitle={periodText} />
            {perDayChart(200)}
          </Card>
        </>
      );

    case "activity":
      return (
        <>
          <Card>
            <CardTitle title="Questions par jour" subtitle={periodText} />
            {perDayChart(240)}
            <DataTable
              summary="Voir les données jour par jour"
              headers={["Jour", "Questions", "Répondues", "Sans données"]}
              rows={[...stats.per_day].reverse().map((d) => [
                new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
                fmt.format(d.total),
                fmt.format(d.answered),
                fmt.format(d.no_data),
              ])}
            />
          </Card>
          <Card>
            <CardTitle title="Heures de pointe" subtitle="Questions selon l'heure de la journée (heure de Dakar)" />
            <ColumnChart
              ariaLabel="Nombre de questions selon l'heure"
              valueLabel="questions"
              height={200}
              tickEvery={3}
              data={stats.per_hour.map((h) => ({
                key: String(h.hour),
                label: `${h.hour} h`,
                value: h.total,
                tooltip: { title: `Entre ${h.hour} h et ${h.hour + 1} h` },
              }))}
            />
          </Card>
        </>
      );

    case "usage":
      return (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Questions vocales" value={`${k.voice_share.toLocaleString("fr-FR")} %`} hint="posées à voix haute">
              <Meter value={k.voice_share} label="Part des questions vocales" />
            </Stat>
            <Stat label="Questions écrites" value={`${(k.questions ? 100 - k.voice_share : 0).toLocaleString("fr-FR")} %`} hint="tapées au clavier">
              <Meter value={k.questions ? 100 - k.voice_share : 0} label="Part des questions écrites" />
            </Stat>
            <Stat label="Explications ouvertes" value={fmt.format(k.details_opened)} hint={`${k.details_rate.toLocaleString("fr-FR")} % des réponses`} />
            <Stat label="Écoutes" value={fmt.format(k.listens)} hint="clics sur « Réponse audio » (hors lecture automatique)" />
          </section>
          <Card>
            <CardTitle title="Langues utilisées" />
            <RankedBars
              rows={stats.languages.map((l) => ({ key: l.language, label: LANGUAGE_NAMES[l.language] ?? l.language, value: l.total }))}
            />
          </Card>
        </>
      );

    case "content":
      return (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle title="Sujets les plus demandés" subtitle="D'après le titre donné à chaque discussion" />
              <RankedBars rows={stats.topics.map((t) => ({ key: t.topic, label: t.topic, value: t.total, suffix: "disc." }))} />
            </Card>
            <Card>
              <CardTitle title="Publications les plus citées" subtitle="Nombre de réponses s'appuyant sur chaque publication" />
              <RankedBars rows={stats.top_sources.map((s) => ({ key: s.title, label: s.title, title: s.title, value: s.total }))} />
            </Card>
          </div>
          <Card>
            <CardTitle title="Questions les plus fréquentes" />
            <QuestionRanking items={stats.top_questions} />
          </Card>
        </>
      );

    case "gaps":
      return (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4">
            <Stat label="Questions sans données" value={fmt.format(k.no_data)} hint={periodText.toLowerCase()} alert={k.no_data > 0} />
            <Stat
              label="Part des questions"
              value={`${(k.questions ? Math.round((1000 * k.no_data) / k.questions) / 10 : 0).toLocaleString("fr-FR")} %`}
              hint="non couvertes par les publications indexées"
            />
          </section>
          <Card>
            <CardTitle title="Les plus demandées" subtitle="Ajouter les publications correspondantes au corpus améliorera directement le taux de réponse" />
            <QuestionRanking items={stats.unanswered} empty="Toutes les questions ont trouvé une réponse." />
          </Card>
        </>
      );

    case "log":
      return <QuestionLog token={token} days={days} onUnauthorized={onLogout} />;

    case "performance":
      return (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <Stat label="Temps de réponse moyen" value={seconds(k.avg_latency_ms)} hint={`9 réponses sur 10 en moins de ${seconds(k.p90_latency_ms)}`} />
          <Stat label="Servies depuis le cache" value={`${k.cache_rate.toLocaleString("fr-FR")} %`} hint="réponses instantanées, sans appel au modèle">
            <Meter value={k.cache_rate} label="Part des réponses servies depuis le cache" />
          </Stat>
          <Stat label="Erreurs" value={fmt.format(k.errors)} hint={`${k.error_rate.toLocaleString("fr-FR")} % des questions`} alert={k.errors > 0} />
          <Stat
            className="col-span-2 lg:col-span-3"
            label="Tokens consommés"
            value={compact(k.prompt_tokens + k.completion_tokens)}
            hint={`Réponses uniquement (hors explications détaillées et titres) · ${compact(k.prompt_tokens)} en entrée, ${compact(k.completion_tokens)} en sortie`}
          />
        </section>
      );
  }
}

// ------------------------------------------------------------------ elements

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 sm:p-6", className)}>{children}</section>;
}

function CardTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  alert,
  className,
  children,
}: {
  className?: string;
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col gap-2", className)}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        {alert && <AlertTriangle size={14} className="text-amber-500" aria-label="Attention" />}
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

function DataTable({ summary, headers, rows }: { summary: string; headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-800">{summary}</summary>
      <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-100">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={cn("px-3 py-2 font-semibold", i > 0 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t border-slate-100">
                {r.map((c, i) => (
                  <td key={i} className={cn("px-3 py-1.5 text-slate-700", i > 0 && "text-right tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function QuestionRanking({ items, empty = "Aucune question sur la période." }: { items: AdminStats["top_questions"]; empty?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <ol className="flex flex-col divide-y divide-slate-100">
      {items.map((q, i) => (
        <li key={`${q.question}-${i}`} className="flex items-start gap-3 py-2.5 text-sm">
          <span className="w-5 shrink-0 pt-px text-right text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
          <span className="min-w-0 flex-1 text-slate-700">{q.question}</span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-900">× {fmt.format(q.count)}</span>
        </li>
      ))}
    </ol>
  );
}

function QuestionLog({ token, days, onUnauthorized }: { token: string; days: number; onUnauthorized: () => void }) {
  const [status, setStatus] = useState<QuestionStatus>("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; items: LoggedQuestion[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setPage(0), [status, days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminQuestions(token, days, status, page * PAGE_SIZE, PAGE_SIZE)
      .then((d) => !cancelled && setData(d))
      .catch((err) => err instanceof ApiError && err.status === 401 && onUnauthorized())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, days, status, page, onUnauthorized]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {data ? `${fmt.format(data.total)} question${data.total > 1 ? "s" : ""}` : "\u00a0"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatus(t.value)}
              aria-pressed={status === t.value}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                status === t.value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">Question</th>
              <th className="py-2 pr-3 font-semibold">Langue</th>
              <th className="py-2 pr-3 font-semibold">Mode</th>
              <th className="py-2 pr-3 font-semibold">Statut</th>
              <th className="py-2 text-right font-semibold">Temps</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((q, i) => (
              <tr key={`${q.ts}-${i}`} className="border-b border-slate-50 align-top">
                <td className="whitespace-nowrap py-2.5 pr-3 text-slate-500">{dateTimeFmt.format(new Date(q.ts * 1000))}</td>
                <td className="py-2.5 pr-3 text-slate-800">{q.question}</td>
                <td className="py-2.5 pr-3 text-slate-600">{LANGUAGE_NAMES[q.language] ?? q.language}</td>
                <td className="py-2.5 pr-3 text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    {q.mode === "voice" ? <Mic size={13} /> : <Keyboard size={13} />}
                    {q.mode === "voice" ? "Vocal" : "Écrit"}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <StatusBadge q={q} />
                </td>
                <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-slate-600">{seconds(q.latency_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Aucune question.</p>}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            {fmt.format(page * PAGE_SIZE + 1)}–{fmt.format(Math.min(data.total, (page + 1) * PAGE_SIZE))} sur{" "}
            {fmt.format(data.total)}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Page précédente"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Page suivante"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Statut : toujours une icone/un libelle, jamais la couleur seule. */
function StatusBadge({ q }: { q: LoggedQuestion }) {
  if (q.error)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
        <AlertTriangle size={12} /> Erreur
      </span>
    );
  if (q.answered === 1)
    return <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">✓ Répondue</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">○ Sans données</span>;
}
