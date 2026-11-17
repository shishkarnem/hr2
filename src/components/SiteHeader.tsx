/**
 * Единый хеддер сайта (главная, вакансии, блог, вики, демо).
 * Полная копия шапки из LandingPage — логотип, навигация, кнопка авторизации,
 * мобильное меню. Активный пункт подсвечивается по `useLocation().pathname`.
 */
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import RRImage from "@/components/RRImage";
import { DEFAULT_RR_LOGO_URL } from "@/lib/img";
import AuthModal from "@/components/AuthModal";
import { useRouter } from "@/components/RouterContext";
import { dbClient } from "@/lib/dbClient";
import { resolveProfilePathForUser } from "@/lib/links";
import NotificationsBell from "@/components/NotificationsBell";
import {
  Sparkles,
  Menu,
  X,
  LogOut,
  LogIn,
  LayoutDashboard,
  Briefcase,
  BookOpen,
  Home,
  Video,
  GraduationCap,
} from "lucide-react";

type Props = {
  /** Текущая активная страница для подсветки навигации. Если не передано — определяется по pathname. */
  active?: "home" | "vacancy" | "blog" | "faq" | "academy" | "demo";
};

export default function SiteHeader({ active }: Props) {
  const { navigate } = useRouter();
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);
  const [profilePath, setProfilePath] = useState<string>("/");

  useEffect(() => {
    const isRootLanding = pathname === "/" || pathname === "/main" || active === "home";
    if (isRootLanding) {
      // On the main landing page, user is always logged out by default
      try {
        localStorage.removeItem("emp_token");
        localStorage.removeItem("emp_user");
        localStorage.removeItem("cand_session");
      } catch { /* ignore */ }
      setAuthedUserId(null);
      setProfilePath("/");
      return;
    }

    const isPublicRoute =
      pathname === "/auth" ||
      pathname === "/demo" ||
      pathname.startsWith("/vacancy") ||
      pathname.startsWith("/blog") ||
      pathname.startsWith("/academy") ||
      pathname.startsWith("/faq") ||
      pathname.startsWith("/wiki");

    const empToken = localStorage.getItem("emp_token");
    const empUserStr = localStorage.getItem("emp_user");
    const candSession = localStorage.getItem("cand_session");

    if (isPublicRoute && !empToken && !candSession) {
      setAuthedUserId(null);
      setProfilePath("/");
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        if (empToken && empUserStr) {
          const meRes = await fetch("/api/auth/employer/me", {
            headers: { Authorization: `Bearer ${empToken}` },
          }).catch(() => null);

          if (meRes && meRes.ok) {
            const meData = await meRes.json();
            if (meData?.user) {
              const u = meData.user;
              localStorage.setItem("emp_user", JSON.stringify(u));
              const pid = u.publicId || u.public_id || u.employerId;
              setAuthedUserId(u.id || u.userId || u.employerId);
              setProfilePath(pid ? `/emp${String(pid).replace(/^emp-?/, "")}/profile` : "/setup");
              return;
            }
          } else {
            // Token invalid or expired
            localStorage.removeItem("emp_token");
            localStorage.removeItem("emp_user");
          }
        }
        const { data: { session } } = await dbClient.auth.getSession();
        if (cancelled) return;
        const user = session?.user ?? null;
        setAuthedUserId(user?.id ?? null);
        if (user) {
          const p = await resolveProfilePathForUser(user.id);
          if (!cancelled) setProfilePath(p);
        } else {
          setProfilePath("/");
        }
      } catch {
        if (!cancelled) {
          setAuthedUserId(null);
          setProfilePath("/");
        }
      }
    };
    refresh();
    const { data: sub } = dbClient.auth.onAuthStateChange(() => refresh());
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [pathname]);

  const handleLogout = async () => {
    try {
      const empToken = localStorage.getItem("emp_token");
      if (empToken) {
        fetch("/api/auth/employer/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${empToken}` },
        }).catch(() => {});
      }
    } catch { /* ignore */ }
    localStorage.removeItem("emp_token");
    localStorage.removeItem("emp_user");
    await dbClient.auth.signOut().catch(() => {});
    setAuthedUserId(null);
    setProfilePath("/");
  };
  const isRootLanding = pathname === "/" || pathname === "/main" || active === "home";
  const isAuthed = isRootLanding ? false : !!authedUserId;

  const current: NonNullable<Props["active"]> =
    active ??
    (pathname === "/" ? "home"
      : pathname.startsWith("/vacancy") ? "vacancy"
      : pathname.startsWith("/blog") ? "blog"
      : pathname.startsWith("/academy") || pathname.startsWith("/faq") || pathname.startsWith("/wiki") ? "academy"
      : pathname.startsWith("/demo") ? "demo"
      : "home");

  const navBtn = (key: NonNullable<Props["active"]>, label: React.ReactNode, to: string) => {
    const isActive = current === key;
    return (
      <button
        onClick={() => navigate(to)}
        aria-current={isActive ? "page" : undefined}
        className={
          isActive
            ? "relative px-2.5 lg:px-3 py-2 rounded-xl text-[#F4EE8E] bg-white/15 border border-[#E7C768]/60 ring-1 ring-[#E7C768]/40 shadow-md shadow-[#E7C768]/10 inline-flex items-center gap-1.5 font-bold after:content-[''] after:absolute after:left-3 after:right-3 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-[#F4D679] after:to-[#E7C768]"
            : "px-2.5 lg:px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 border border-transparent inline-flex items-center gap-1.5 transition"
        }
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#17344F]/80 backdrop-blur-xl border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full max-w-7xl mx-auto">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
            role="link"
            tabIndex={0}
            aria-label="На главную — Робот Рекрутер"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/"); }}
          >
            <RRImage
              src={DEFAULT_RR_LOGO_URL}
              w={40}
              alt="Логотип Робот Рекрутер"
              className="w-10 h-10 object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">Робот Рекрутер</span>
              <span className="text-[14px] font-mono tracking-wider text-slate-300">Автоматизация найма</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 xl:gap-2 text-sm font-semibold">
            {navBtn("home",    (<><Home          className="w-4 h-4 text-[#E7C768] shrink-0" /><span>Главная</span></>), "/")}
            {navBtn("vacancy", (<><Briefcase     className="w-4 h-4 text-[#E7C768] shrink-0" /><span>Вакансии</span></>), "/vacancy")}
            {navBtn("blog",    (<><BookOpen      className="w-4 h-4 text-[#E7C768] shrink-0" /><span>Блог</span></>), "/blog")}
            {navBtn("academy", (<><GraduationCap className="w-4 h-4 text-[#E7C768] shrink-0" /><span>Академия</span></>), "/academy")}
            {navBtn("demo",    (<><Video         className="w-4 h-4 text-[#E7C768] shrink-0" /><span>Демо</span></>), "/demo")}
          </nav>

          {isAuthed ? (
            <div className="hidden md:flex items-center gap-2">
              <NotificationsBell />
              <button
                onClick={() => {
                  try { sessionStorage.setItem("show_employer_entry_loader", "1"); } catch {}
                  navigate(profilePath);
                }}
                aria-label="Кабинет"
                className="inline-flex items-center gap-2 bg-[#E7C768] text-[#17344F] font-bold text-sm px-3.5 py-2 rounded-xl shadow-lg hover:-translate-y-0.5 transition cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" /> <span>Кабинет</span>
              </button>
              <button onClick={handleLogout} aria-label="Выйти" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-3.5 py-2 rounded-xl transition cursor-pointer">
                <LogOut className="w-4 h-4 shrink-0" /> <span>Выйти</span>
              </button>
            </div>
          ) : (
            <button onClick={() => setIsAuthModalOpen(true)} aria-label="Войти" className="hidden md:inline-flex items-center gap-2 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] text-[#17344F] font-extrabold text-sm px-4 py-2 rounded-xl shadow-lg hover:-translate-y-0.5 transition cursor-pointer">
              <LogIn className="w-4 h-4 shrink-0 text-[#17344F]" /> <span>Войти</span>
            </button>
          )}

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-white" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 max-w-7xl mx-auto">
            <button onClick={() => { navigate("/"); setMobileMenuOpen(false); }} className={`text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm font-semibold transition ${current === "home" ? "bg-white/15 text-[#F4EE8E] border border-[#E7C768]/60" : "text-slate-200 hover:bg-white/10"}`}>
              <Home className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Главная</span>
            </button>
            <button onClick={() => { navigate("/vacancy"); setMobileMenuOpen(false); }} className={`text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm font-semibold transition ${current === "vacancy" ? "bg-white/15 text-[#F4EE8E] border border-[#E7C768]/60" : "text-slate-200 hover:bg-white/10"}`}>
              <Briefcase className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Вакансии</span>
            </button>
            <button onClick={() => { navigate("/blog"); setMobileMenuOpen(false); }} className={`text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm font-semibold transition ${current === "blog" ? "bg-white/15 text-[#F4EE8E] border border-[#E7C768]/60" : "text-slate-200 hover:bg-white/10"}`}>
              <BookOpen className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Блог</span>
            </button>
            <button onClick={() => { navigate("/academy"); setMobileMenuOpen(false); }} className={`text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm font-semibold transition ${current === "academy" ? "bg-white/15 text-[#F4EE8E] border border-[#E7C768]/60" : "text-slate-200 hover:bg-white/10"}`}>
              <GraduationCap className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Академия</span>
            </button>
            <button onClick={() => { navigate("/demo"); setMobileMenuOpen(false); }} className={`text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm font-semibold transition ${current === "demo" ? "bg-white/15 text-[#F4EE8E] border border-[#E7C768]/60" : "text-slate-200 hover:bg-white/10"}`}>
              <Video className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Демо</span>
            </button>
            {isAuthed ? (
              <>
                <button
                  onClick={() => {
                    try { sessionStorage.setItem("show_employer_entry_loader", "1"); } catch {}
                    navigate(profilePath);
                    setMobileMenuOpen(false);
                  }}
                  className="text-left px-3 py-2 rounded-xl bg-[#E7C768] text-[#17344F] font-bold flex items-center gap-2 mt-2"
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>Кабинет</span>
                </button>
                <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl bg-white/10 border border-white/20 font-semibold flex items-center gap-2">
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Выйти</span>
                </button>
              </>
            ) : (
              <button onClick={() => { setIsAuthModalOpen(true); setMobileMenuOpen(false); }} className="text-left px-3 py-2 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] text-[#17344F] font-extrabold flex items-center gap-2 mt-2">
                <LogIn className="w-4 h-4 shrink-0 text-[#17344F]" />
                <span>Войти</span>
              </button>
            )}
          </div>
        )}
      </header>

      {isAuthModalOpen && (
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} intent="employer" initialMode="login" />
      )}
    </>
  );
}