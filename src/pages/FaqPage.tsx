/**
 * /faq — Вики/база знаний по продукту RR.
 * Аккордеон вопросов из таблицы faq_items + поиск по тексту.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, Sparkles, BookOpen, Layers } from "lucide-react";
import Markdown from "react-markdown";
import { useRouter } from "@/components/RouterContext";
import EmployerAIAssistant from "@/components/EmployerAIAssistant";
import { useSeo, SITE_URL } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import { loadOnboarding, type OnboardingItem, type OnboardingSection } from "@/lib/onboarding";

const SECTION_LABELS: Record<OnboardingSection, string> = {
  profile: "Профиль",
  companies: "Компании",
  vacancies: "Вакансии",
  interviews: "Интервью",
  training: "Обучения",
  crm: "CRM",
  billing: "Счета",
};

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  product: "О продукте",
  pricing: "Цены и тарифы",
  settings: "Личный кабинет",
  candidate: "Кандидаты",
  integrations: "Интеграции",
  account: "Аккаунт и поддержка",
  general: "Общие вопросы",
};

export default function FaqPage() {
  const { navigate } = useRouter();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onb, setOnb] = useState<OnboardingItem[]>([]);
  const [openOnbId, setOpenOnbId] = useState<string | null>(null);

  useSeo({
    title: "База знаний — Робот Рекрутер",
    description: "Ответы на частые вопросы о платформе Робот Рекрутер: тарифы, ИИ-интервью, настройка вакансий, интеграции и поддержка.",
    canonical: `${SITE_URL}/faq`,
    ogUrl: `${SITE_URL}/faq`,
    ogType: "website",
    jsonLd: items.length
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.slice(0, 50).map((it) => ({
            "@type": "Question",
            name: it.question,
            acceptedAnswer: { "@type": "Answer", text: it.answer },
          })),
        }
      : undefined,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/faq");
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (cancelled) return;
          if (Array.isArray(data)) setItems(data);
        }
      } catch (e) {
        console.error("Failed to load FAQ items from PostgreSQL BD ProTalk:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    loadOnboarding().then((list) => { if (!cancelled) setOnb(list); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => it.question.toLowerCase().includes(q) || it.answer.toLowerCase().includes(q),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, FaqItem[]>();
    for (const it of filtered) {
      const arr = map.get(it.category) || [];
      arr.push(it);
      map.set(it.category, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const onbFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return onb;
    return onb.filter((x) => x.title.toLowerCase().includes(q) || x.body_md.toLowerCase().includes(q));
  }, [onb, query]);

  const onbGrouped = useMemo(() => {
    const map = new Map<OnboardingSection, OnboardingItem[]>();
    for (const it of onbFiltered) {
      const arr = map.get(it.section) || [];
      arr.push(it);
      map.set(it.section, arr);
    }
    // welcome первым, остальное по order_idx
    for (const [k, arr] of map) {
      arr.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "section_welcome" ? -1 : 1;
        return a.order_idx - b.order_idx;
      });
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [onbFiltered]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#17344F]/65 via-[#1E4468]/50 to-[#265582]/65 text-white font-sans relative">
      <SiteHeader active="faq" />

      <section className="max-w-5xl mx-auto px-4 md:px-8 py-10 md:py-16">
        {/* Hero */}
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 mb-10">
          <img
            src="/files/9/rr8.png"
            alt="RR — Вики"
            className="w-40 h-40 md:w-52 md:h-52 object-contain drop-shadow-2xl shrink-0"
          />
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-[#E7C768]/15 border border-[#E7C768]/30 rounded-full px-4 py-1.5 mb-4">
              <BookOpen className="w-4 h-4 text-[#E7C768]" />
              <span className="text-sm font-bold text-[#E7C768]">
                Вики Робот Рекрутер
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Ответы на{" "}
              <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">
                все вопросы
              </span>{" "}
              о платформе
            </h1>
            <div className="mt-4 relative max-w-2xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#E7C768]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по вопросам и ответам…"
                className="w-full bg-white/10 border border-white/20 rounded-2xl pl-12 pr-4 py-3.5 text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] focus:bg-white/15 transition font-medium text-base"
              />
              {query && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-300 pr-2">
                  {filtered.length} {pluralize(filtered.length, "вопрос", "вопроса", "вопросов")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="mt-6 space-y-8">
          {loading && <p className="text-center text-slate-300 py-12">Загружаем базу знаний…</p>}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
              <p className="text-slate-200 text-lg">Ничего не нашли по запросу «{query}».</p>
              <p className="text-slate-400 text-sm mt-2">
                Попробуйте другую формулировку или спросите ИИ-Ассистента →
              </p>
            </div>
          )}

          {!loading &&
            grouped.map(([cat, list]) => (
              <div key={cat}>
                <h2 className="text-sm font-bold text-[#E7C768] mb-3 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  {CATEGORY_LABELS[cat] || cat}
                  <span className="text-slate-400 font-mono">({list.length})</span>
                </h2>
                <div className="space-y-2">
                  {list.map((it) => {
                    const open = openId === it.id;
                    return (
                      <div
                        key={it.id}
                        className={`bg-white/5 border rounded-2xl overflow-hidden transition ${
                          open ? "border-[#E7C768]/60 bg-white/10" : "border-white/10 hover:border-white/20"
                        }`}
                      >
                        <button
                          onClick={() => setOpenId(open ? null : it.id)}
                          className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                        >
                          <span className="font-semibold text-white text-[15px] leading-snug">
                            {it.question}
                          </span>
                          <ChevronDown
                            className={`w-5 h-5 shrink-0 text-[#E7C768] transition-transform ${
                              open ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {open && (
                          <div className="px-5 pb-5 -mt-1 text-slate-200 leading-relaxed text-sm border-t border-white/10 pt-4 markdown-body">
                            <Markdown>{it.answer}</Markdown>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

          {/* === База знаний кабинета (онбординг работодателя) === */}
          {!loading && onbGrouped.length > 0 && (
            <div className="pt-6 mt-6 border-t border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-5 h-5 text-[#E7C768]" />
                <h2 className="text-lg font-bold text-white">
                  База знаний <span className="text-[#E7C768]">личного кабинета</span>
                </h2>
              </div>
              <p className="text-slate-300 text-sm mb-6 max-w-3xl">
                Подробные описания каждого раздела и поля кабинета работодателя:
                Профиль, Компании, Вакансии, Интервью, Обучения, CRM, Счета. Те же тексты
                показываются как велком-тур при первом входе в раздел и по «?» рядом с полями.
              </p>
              {onbGrouped.map(([sec, list]) => (
                <div key={sec} id={`section-${sec}`} className="mb-6">
                  <h3 className="text-sm font-bold text-[#E7C768] mb-3 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    {SECTION_LABELS[sec]}
                    <span className="text-slate-400 font-mono">({list.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {list.map((it) => {
                      const open = openOnbId === it.id;
                      const isWelcome = it.kind === "section_welcome";
                      return (
                        <div
                          key={it.id}
                          id={it.field_key ? `${sec}-${it.field_key}` : `${sec}-welcome`}
                          className={`bg-white/5 border rounded-2xl overflow-hidden transition ${
                            open ? "border-[#E7C768]/60 bg-white/10" : isWelcome ? "border-[#E7C768]/30" : "border-white/10 hover:border-white/20"
                          }`}
                        >
                          <button
                            onClick={() => setOpenOnbId(open ? null : it.id)}
                            className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                          >
                            <span className="font-semibold text-white text-[15px] leading-snug flex items-center gap-2">
                              {isWelcome && <span className="text-sm font-mono bg-[#E7C768]/20 text-[#E7C768] px-1.5 py-0.5 rounded">обзор</span>}
                              {it.title}
                            </span>
                            <ChevronDown className={`w-5 h-5 shrink-0 text-[#E7C768] transition-transform ${open ? "rotate-180" : ""}`} />
                          </button>
                          {open && (
                            <div className="px-5 pb-5 -mt-1 text-slate-200 leading-relaxed text-sm border-t border-white/10 pt-4 markdown-body">
                              <Markdown>{it.body_md}</Markdown>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <EmployerAIAssistant />
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}