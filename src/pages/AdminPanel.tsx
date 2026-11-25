/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin CRM. Access strictly restricted to registered authenticated users
 * whose database role in `employers.role` is admin or super_admin.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Database,
  Loader2,
  LogOut,
} from "lucide-react";
import RRImage from "@/components/RRImage";
import BlogAdmin from "@/components/admin/BlogAdmin";
import { dbClient, getAuthHeaders } from "@/lib/dbClient";
import {
  EntityKind,
  EntityNavContext,
  GOLD_TEXT_CLASS,
  SECTIONS,
  SectionKey,
  isAdminOrSuperAdminRole,
  isSuperAdminUser,
  safeAuthToken,
} from "@/components/admin/panel/adminConfig";
import {
  AdminAccessGate,
  VerifiedAdminUser,
} from "@/components/admin/panel/AdminAccessGate";
import { EntityModal } from "@/components/admin/panel/EntityModals";
import {
  ClientsSection,
  CandidatesSection,
} from "@/components/admin/sections/ClientsAndCandidates";
import {
  CompaniesListSection,
  VacanciesAnalyticsSection,
} from "@/components/admin/sections/CompaniesAndVacancies";
import {
  InterviewsSection,
  JobTitlesSection,
  TrainingsSection,
} from "@/components/admin/sections/InterviewsAndTrainings";
import {
  AccountsTab,
  RolesSection,
} from "@/components/admin/sections/RolesAndAccounts";
import {
  LogsSection,
  MailingsSection,
  ReviewsSection,
} from "@/components/admin/sections/SystemAndComms";

export default function AdminPanel() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<VerifiedAdminUser | null>(null);
  const [section, setSection] = useState<SectionKey>("clients");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [entityStack, setEntityStack] = useState<{ kind: EntityKind; id: string }[]>([]);

  const openEntity = (kind: EntityKind, id: string) => {
    setEntityStack((s) => [...s, { kind, id }]);
  };
  const closeEntity = () => setEntityStack((s) => s.slice(0, -1));

  const verifyAdminSession = useCallback(async () => {
    const token = safeAuthToken();
    if (!token) {
      setAuthenticated(false);
      setIsAdmin(false);
      setCurrentUser(null);
      setAuthChecked(true);
      return;
    }

    try {
      const res = await fetch("/api/admin/session-check", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-employer-token": token,
        },
      });
      if (!res.ok) {
        setAuthenticated(false);
        setIsAdmin(false);
        setCurrentUser(null);
        setAuthChecked(true);
        return;
      }

      const data = await res.json().catch(() => null);
      const isAuthed = Boolean(data?.authenticated && data?.user);
      const userRole = data?.user?.role;
      const roleValid = Boolean(data?.isAdmin) && isAdminOrSuperAdminRole(userRole);

      setAuthenticated(isAuthed);
      setIsAdmin(isAuthed && roleValid);
      setCurrentUser(data?.user || null);
    } catch {
      setAuthenticated(false);
      setIsAdmin(false);
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    verifyAdminSession();
  }, [verifyAdminSession]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/employer/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      }).catch(() => {});
    } catch {}
    await dbClient.auth.signOut();
    try {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("current_employer_id");
    } catch {}
    navigate("/");
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-transparent backdrop-blur-2xl text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#E7C768]" />
      </div>
    );
  }

  const profilePid = String(currentUser?.publicId || currentUser?.public_id || "").replace(/^emp-?/i, "");
  const profilePath = profilePid ? `/emp${profilePid}/profile` : "/setup";

  if (!isAdmin) {
    return (
      <AdminAccessGate
        authenticated={authenticated}
        currentUser={currentUser}
        onAuthenticated={() => {
          setAuthChecked(false);
          verifyAdminSession();
        }}
        onNavigateHome={() => navigate("/")}
        onNavigateProfile={() => navigate(profilePath)}
      />
    );
  }

  const canManageRolesAndDb = isSuperAdminUser(currentUser);
  const visibleSections = SECTIONS.filter((s) => s.key !== "roles" || canManageRolesAndDb);
  const safeSection: SectionKey =
    section === "roles" && !canManageRolesAndDb ? "clients" : section;
  const activeSectionItem =
    visibleSections.find((s) => s.key === safeSection) || visibleSections[0];
  const ActiveSectionIcon = activeSectionItem.icon;

  return (
    <div className="min-h-screen bg-transparent text-white font-sans antialiased relative">
      <header className="sticky top-0 z-40 bg-transparent backdrop-blur-2xl border-b border-white/15 px-3 sm:px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-[1500px] mx-auto">
          <div
            className="flex items-center gap-3 cursor-pointer min-w-0"
            onClick={() => navigate("/")}
          >
            <RRImage
              src="/files/11/rr-logo.png"
              w={36}
              alt="RR"
              className="w-9 h-9 object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col leading-tight min-w-0">
              <span className={`text-base font-bold truncate ${GOLD_TEXT_CLASS}`}>
                Админ-панель
              </span>
              <span className="text-sm text-slate-200 truncate">
                {currentUser?.email || "Панель управления"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {canManageRolesAndDb && (
              <button
                type="button"
                onClick={() => navigate("/system-admin")}
                className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-transparent hover:border-[#E7C768] text-[#F4EE8E] border border-[#E7C768]/50 flex items-center gap-1.5 transition cursor-pointer"
                title="Перейти в управление базой данных"
              >
                <Database className="w-4 h-4 text-[#E7C768]" />
                <span>База данных</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate(profilePath)}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-transparent border border-white/20 hover:border-[#E7C768] text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-[#E7C768]" />
              <span>Кабинет</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold text-white bg-transparent border border-white/25 hover:border-[#E7C768] flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#E7C768]" />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div
          className={`fixed top-20 right-4 left-4 sm:left-auto z-50 px-4 py-3 rounded-2xl text-sm font-semibold shadow-2xl border backdrop-blur-2xl bg-transparent ${
            toast.kind === "ok"
              ? "border-[#E7C768] text-[#F4EE8E]"
              : "border-white/40 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      <main className="max-w-[1500px] mx-auto py-5 px-3 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Mobile vertical dropdown navigation (no horizontal scroll) */}
        <div className="lg:hidden space-y-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-transparent backdrop-blur-xl border border-[#E7C768]/60 text-white text-sm font-bold cursor-pointer"
          >
            <span className="flex items-center gap-2 min-w-0">
              <ActiveSectionIcon className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span className="truncate">{activeSectionItem.label}</span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#E7C768] transition-transform shrink-0 ${
                mobileMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {mobileMenuOpen && (
            <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-2xl p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 shadow-xl">
              {visibleSections.map((s) => {
                const Icon = s.icon;
                const active = safeSection === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setSection(s.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                      active
                        ? "border border-[#E7C768] text-[#F4EE8E] bg-transparent"
                        : "border border-white/15 text-white/90 hover:border-white/40 bg-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4 text-[#E7C768] shrink-0" />
                    <span className="truncate">{s.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop vertical navigation */}
        <aside className="hidden lg:block lg:col-span-3 xl:col-span-2">
          <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-3 space-y-1.5 sticky top-20 shadow-xl">
            {visibleSections.map((s) => {
              const Icon = s.icon;
              const active = safeSection === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSection(s.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                    active
                      ? "bg-transparent text-[#F4EE8E] border border-[#E7C768]"
                      : "bg-transparent border border-transparent text-white/85 hover:border-white/25 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 text-[#E7C768] shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="lg:col-span-9 xl:col-span-10 space-y-4 min-w-0">
          <EntityNavContext.Provider value={{ openEntity }}>
            {safeSection === "clients" && <ClientsSection setToast={setToast} />}
            {safeSection === "candidates" && <CandidatesSection />}
            {safeSection === "companies" && <CompaniesListSection />}
            {safeSection === "vacancies" && <VacanciesAnalyticsSection />}
            {safeSection === "job_titles" && <JobTitlesSection setToast={setToast} />}
            {safeSection === "interviews" && <InterviewsSection />}
            {safeSection === "trainings" && <TrainingsSection />}
            {safeSection === "blog" && <BlogAdmin />}
            {safeSection === "mailings" && <MailingsSection setToast={setToast} />}
            {safeSection === "roles" && canManageRolesAndDb && <RolesSection setToast={setToast} />}
            {safeSection === "accounts" && <AccountsTab setToast={setToast} />}
            {safeSection === "logs" && <LogsSection />}
            {safeSection === "reviews" && <ReviewsSection setToast={setToast} />}
            {entityStack.length > 0 && (
              <EntityModal
                entity={entityStack[entityStack.length - 1]}
                setToast={setToast}
                onClose={closeEntity}
              />
            )}
          </EntityNavContext.Provider>
        </section>
      </main>
    </div>
  );
}
