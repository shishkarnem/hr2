/**
 * Публичный каталог всех активных вакансий со всех компаний.
 * Карточки ведут на действующие лендинги конкретных вакансий
 * (/com{company_slug}/vac{project_slug}/vacancy). Доступ без регистрации.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "../components/RouterContext";
import SiteHeader from "@/components/SiteHeader";
import { dbClient } from "@/lib/dbClient";
import { useSeo, SITE_URL } from "@/lib/seo";
import VacancyCard from "@/components/VacancyCard";
import PublicMobileNavbar from "@/components/PublicMobileNavbar";
import UnifiedAIAssistant from "@/components/UnifiedAIAssistant";
import {
  Search, Filter, X,
  Sparkles, Zap, Users,
} from "lucide-react";

type Vac = {
  id: string;
  public_id: string | null;
  slug: string | null;
  role_name: string | null;
  salary_terms: string | null;
  schedule_terms: string | null;
  vacancy_text: string | null;
  logo_url: string | null;
  created_at: string;
  company_id: string | null;
  company_name: string;
  company_slug: string | null;
  company_logo: string | null;
  industry: string | null;
  theme_config?: any;
  css?: string | null;
};

// Карточка вакансии вынесена в `@/components/VacancyCard`.

export default function VacancyCatalogPage() {
  const { navigate } = useRouter();
  useSeo({
    title: "Каталог вакансий — Робот Рекрутер",
    description: "Актуальные открытые вакансии компаний платформы Робот Рекрутер. Откликнуться можно без регистрации — ИИ проведёт первичное собеседование.",
    canonical: `${SITE_URL}/vacancy`,
    ogUrl: `${SITE_URL}/vacancy`,
    ogType: "website",
  });
  const [loading, setLoading] = useState(true);
  const [vacs, setVacs] = useState<Vac[]>([]);

  const [q, setQ] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [industryFilter, setIndustryFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Скролл наверх при заходе на страницу — иначе после перехода с лендинга
  // позиция остаётся внизу.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/public-vacancies");
        if (res.ok) {
          const list = await res.json().catch(() => null);
          if (Array.isArray(list) && list.length > 0) {
            if (!cancel) {
              setVacs(list);
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("[VacancyCatalogPage] Failed to fetch from PostgreSQL BD ProTalk API, using database fallback:", err);
      }

      const { data } = await dbClient
        .from("projects")
        .select("id, public_id, slug, role_name, salary_terms, schedule_terms, vacancy_text, logo_url, company_name, company_slug, created_at, company_id, theme_config, css, companies(name, slug, logo_url, industry, theme_config, css)")
        .eq("is_published", true)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancel) return;
      const rows = (data || []).map((r: any): Vac => {
        let themeConf = (r.companies as any)?.theme_config || r.theme_config || null;
        if (typeof themeConf === "string") {
          try { themeConf = JSON.parse(themeConf); } catch {}
        }
        const resolvedCompName = (r.company_name && String(r.company_name).trim()) || r.companies?.name || (r as any).linked_company_name || "Компания";
        const resolvedCompSlug = (r.company_slug && String(r.company_slug).trim()) || r.companies?.slug || (r as any).linked_company_slug || null;
        const resolvedLogo = r.companies?.logo_url || r.logo_url || null;
        const resolvedIndustry = r.companies?.industry || "Услуги";

        return {
          id: r.id,
          public_id: r.public_id,
          slug: r.slug,
          role_name: r.role_name,
          salary_terms: r.salary_terms,
          schedule_terms: r.schedule_terms,
          vacancy_text: r.vacancy_text,
          logo_url: resolvedLogo,
          created_at: r.created_at,
          company_id: r.company_id,
          company_name: resolvedCompName,
          company_slug: resolvedCompSlug,
          company_logo: resolvedLogo,
          industry: resolvedIndustry,
          theme_config: themeConf,
          css: (r.companies as any)?.css || r.css || null,
        };
      });
      setVacs(rows);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const companies = useMemo(() => {
    const m = new Map<string, string>();
    vacs.forEach((v) => { if (v.company_name) m.set(v.company_name, v.company_name); });
    return Array.from(m.keys()).sort((a, b) => a.localeCompare(b, "ru"));
  }, [vacs]);

  const industries = useMemo(() => {
    const s = new Set<string>();
    vacs.forEach((v) => { if (v.industry) s.add(v.industry); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ru"));
  }, [vacs]);

  const roles = useMemo(() => {
    const s = new Set<string>();
    vacs.forEach((v) => { if (v.role_name) s.add(v.role_name); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ru"));
  }, [vacs]);

  const filtered = useMemo(() => {
    let list = vacs;
    if (companyFilter) list = list.filter((v) => v.company_name === companyFilter);
    if (industryFilter) list = list.filter((v) => v.industry === industryFilter);
    if (roleFilter) list = list.filter((v) => v.role_name === roleFilter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((v) =>
        (v.role_name || "").toLowerCase().includes(needle) ||
        (v.company_name || "").toLowerCase().includes(needle) ||
        (v.vacancy_text || "").toLowerCase().includes(needle) ||
        (v.salary_terms || "").toLowerCase().includes(needle) ||
        (v.schedule_terms || "").toLowerCase().includes(needle)
      );
    }
    return list;
  }, [vacs, q, companyFilter, industryFilter, roleFilter]);

  // Сброс пагинации при смене фильтров/поиска.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [q, companyFilter, industryFilter, roleFilter]);

  // Догрузка следующих 20 при подкручивании к низу списка.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
        }
      }
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);

  const openVacancy = (v: Vac) => {
    const compSlug = v.company_slug && v.company_slug !== "company" ? v.company_slug : "300001";
    const vacSlug = v.slug && v.slug !== "vacancy" ? v.slug : (v.public_id || v.id);
    if (compSlug && vacSlug) {
      if (/^\d+$/.test(compSlug)) {
        const vacPid = String(v.public_id || v.id).replace(/\D/g, "") || String(v.id);
        navigate(`/com${compSlug}/vac${vacPid}/vacancy`);
      } else {
        navigate(`/${compSlug}/${vacSlug}/vacancy`);
      }
    } else {
      navigate(`/job?id=${encodeURIComponent(v.slug || v.id)}`);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-white font-sans relative">
      <SiteHeader active="vacancy" />

      <main className="brand-editor bg-transparent max-w-7xl mx-auto px-[3%] md:px-8 py-8 md:py-12">
        {/* Hero / search */}
        <section className="mb-8">
          <h1 className="text-3xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-[#F5D67A] via-[#E8B84E] to-[#C9933A] bg-clip-text text-transparent">
            Каталог вакансий
          </h1>
          <p className="text-white/70 mb-6 max-w-2xl">
            Все активные вакансии всех компаний платформы. Откройте карточку, чтобы узнать подробности и подать заявку — регистрация не нужна.
          </p>

          <div className="rounded-3xl bg-transparent border border-[#E7C768]/40 backdrop-blur-2xl p-4 md:p-5 shadow-2xl space-y-3">
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#E7C768] pointer-events-none" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Профессия, ключевые слова, компания…"
                  className="w-full bg-transparent backdrop-blur-md border border-[#E7C768]/35 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white placeholder:text-white/70 focus:outline-none focus:border-[#E7C768] focus:ring-2 focus:ring-[#E7C768]/40 transition"
                />
              </div>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl border text-sm font-semibold transition cursor-pointer shadow-sm ${
                  showFilters
                    ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] font-bold shadow-lg"
                    : "bg-transparent backdrop-blur-md border-[#E7C768]/40 text-[#E7C768] hover:border-[#E7C768]"
                }`}
              >
                <Filter className={`w-4 h-4 ${showFilters ? "text-[#17344F]" : "text-[#E7C768]"}`} />
                <span>Фильтры</span>
              </button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-[#E7C768]/20 animate-fade-in">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-sm font-semibold text-white">Должность</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-transparent backdrop-blur-md border border-[#E7C768]/40 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-[#E7C768] focus:ring-1 focus:ring-[#E7C768]"
                  >
                    <option value="" className="text-white bg-[#17344F]">Все должности</option>
                    {roles.map((c) => (<option key={c} value={c} className="text-white bg-[#17344F]">{c}</option>))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-sm font-semibold text-white">Компания</span>
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="bg-transparent backdrop-blur-md border border-[#E7C768]/40 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-[#E7C768] focus:ring-1 focus:ring-[#E7C768]"
                  >
                    <option value="" className="text-white bg-[#17344F]">Все компании</option>
                    {companies.map((c) => (<option key={c} value={c} className="text-white bg-[#17344F]">{c}</option>))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-sm font-semibold text-white">Отрасль</span>
                  <select
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                    className="bg-transparent backdrop-blur-md border border-[#E7C768]/40 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-[#E7C768] focus:ring-1 focus:ring-[#E7C768]"
                  >
                    <option value="" className="text-white bg-[#17344F]">Все отрасли</option>
                    {industries.map((c) => (<option key={c} value={c} className="text-white bg-[#17344F]">{c}</option>))}
                  </select>
                </label>
                {(companyFilter || industryFilter || roleFilter) && (
                  <button
                    onClick={() => { setCompanyFilter(""); setIndustryFilter(""); setRoleFilter(""); }}
                    className="md:col-span-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-transparent backdrop-blur-md border border-[#E7C768]/40 text-[#E7C768] transition text-sm font-medium cursor-pointer"
                  >
                    <X className="w-4 h-4" /> Сбросить фильтры
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-white/80">
            {loading ? "Загрузка вакансий…" : `Показано ${Math.min(visibleCount, filtered.length)} из ${filtered.length}`}
          </div>
        </section>

        {/* SEO / продающий блок */}
        <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-transparent border border-white/25 p-5 backdrop-blur-2xl">
            <div className="flex items-center gap-2 mb-2 text-[#F5D67A] font-semibold">
              <Sparkles className="w-4 h-4" /> Без HR и без ожидания
            </div>
            <p className="text-sm text-white/90 leading-relaxed">
              Откликайтесь на вакансию и проходите интервью с ИИ-рекрутёром прямо сейчас. Никаких очередей, переписок и «мы вам перезвоним».
            </p>
          </div>
          <div className="rounded-2xl bg-transparent border border-white/25 p-5 backdrop-blur-2xl">
            <div className="flex items-center gap-2 mb-2 text-[#F5D67A] font-semibold">
              <Users className="w-4 h-4" /> Бесплатно для соискателей
            </div>
            <p className="text-sm text-white/90 leading-relaxed">
              Откройте любую вакансию без регистрации, изучите условия, задачи и обучение, и подайте заявку в один клик.
            </p>
          </div>
          <div className="rounded-2xl bg-transparent border border-white/25 p-5 backdrop-blur-2xl">
            <div className="flex items-center gap-2 mb-2 text-[#F5D67A] font-semibold">
              <Zap className="w-4 h-4" /> Работодателю — пример вашей будущей вакансии
            </div>
            <p className="text-sm text-white/90 leading-relaxed">
              Смотрите, как может выглядеть страница вашей вакансии, интервью и обучение. Соберите свою за 5 минут вместе с РобоРекрутом — даже без готовых материалов.
            </p>
          </div>
        </section>

        {/* List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-transparent backdrop-blur-2xl border border-white/25 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-transparent backdrop-blur-2xl border border-white/25 p-8 text-center text-white/90">
            По вашему запросу ничего не найдено.{" "}
            <button onClick={() => { setQ(""); setCompanyFilter(""); setIndustryFilter(""); setRoleFilter(""); }} className="underline hover:text-white">
              Сбросить поиск
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {visible.map((v, idx) => (
              <VacancyCard
                key={`${v.id}-${idx}`}
                vacancy={{
                  id: v.id,
                  public_id: v.public_id,
                  slug: v.slug,
                  roleName: v.role_name,
                  companyName: v.company_name,
                  companyLogo: v.logo_url || v.company_logo,
                  industry: v.industry,
                  salaryTerms: v.salary_terms,
                  scheduleTerms: v.schedule_terms,
                  vacancyText: v.vacancy_text,
                }}
                themeConfig={v.theme_config}
                onOpen={() => openVacancy(v)}
              />
            ))}
            <div ref={sentinelRef} className="col-span-full h-10" />
            {visibleCount < filtered.length && (
              <div className="col-span-full text-center text-white/50 text-sm py-4">Загружаем ещё…</div>
            )}
          </div>
        )}
      </main>
      <UnifiedAIAssistant assistantType="landing" />
      <PublicMobileNavbar />
    </div>
  );
}