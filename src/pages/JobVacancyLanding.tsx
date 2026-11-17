/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import RRImage from "@/components/RRImage";
import { DEFAULT_RR_LOGO_URL } from "@/lib/img";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import Markdown from "react-markdown";
import { JobProject, Message } from "../types";
import { dbClient } from "@/lib/dbClient";
import VacancyAIAssistant from "@/components/VacancyAIAssistant";
import Reveal from "@/components/Reveal";
import AuthModal from "@/components/AuthModal";
import { useLandingTheme, LandingThemeConfig } from "@/components/LandingStyleEditor";
import { saveCandidateSession } from "@/lib/candidateSession";
import {
  Briefcase,
  DollarSign,
  Clock,
  BookOpen,
  MessageSquare,
  ArrowRight,
  Send,
  Loader,
  X,
  FileText,
  User,
  Mail,
  HelpCircle,
  Menu,
  ChevronRight,
  Sparkles,
  Award
} from "lucide-react";

export default function JobVacancyLanding() {
  const { navigate, query } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States
  const [project, setProject] = useState<JobProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [employerContacts, setEmployerContacts] = useState<{ email?: string; phone?: string; telegram?: string } | null>(null);
  const [companyData, setCompanyData] = useState<any>(null);

  // Active theme configuration from company record
  const effectiveTheme: LandingThemeConfig = useMemo(() => {
    const raw = companyData?.theme_config || companyData?.css;
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  }, [companyData?.theme_config, companyData?.css]);

  // Apply custom landing theme automatically for all visitors
  useLandingTheme(effectiveTheme);

  // Consultant chatbot conversation state
  const [messages, setMessages] = useState<Message[]>([]);
  const [userQuestion, setUserQuestion] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isTypewriting, setIsTypewriting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Apply candidate signup modal trigger
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [candName, setCandName] = useState("");
  const [candEmail, setCandEmail] = useState("");
  const [candTg, setCandTg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleGoToCabinet = () => {
    const empToken = localStorage.getItem("emp_token") || localStorage.getItem("employer_token");
    if (!empToken) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      sessionStorage.removeItem("employer_preloaded");
      sessionStorage.setItem("show_employer_entry_loader", "1");
    } catch {}
    const targetEmpId = localStorage.getItem("employer_public_id") || localStorage.getItem("emp_public_id") || project?.employerId || "100007";
    navigate(`/emp${targetEmpId}`);
  };

  // Selected project ID/slug from query (may be empty — then load first published)
  const projectId = query.id || "";

  const fetchProjectDetails = async () => {
    try {
      let q = dbClient
        .from("projects")
        .select("*, companies(*)")
        .eq("is_published", true)
        .limit(1);
      if (projectId) {
        const isUuid = /^[0-9a-f-]{36}$/i.test(projectId);
        q = isUuid
          ? dbClient.from("projects").select("*, companies(*)").eq("id", projectId).eq("is_published", true).limit(1)
          : dbClient.from("projects").select("*, companies(*)").eq("slug", projectId).eq("is_published", true).limit(1);
      }
      const { data } = await q;
      const row: any = data && data[0];
      if (row) {
        const found: JobProject = {
          id: row.id,
          companyName: row.companies?.name || "",
          companySlug: row.companies?.slug || undefined,
          employerId: row.employer_id,
          roleName: row.role_name,
          salaryTerms: row.salary_terms || undefined,
          scheduleTerms: row.schedule_terms || undefined,
          motivationText: row.motivation_text || undefined,
          customWiki: row.custom_wiki || undefined,
          checklistQuestions: [],
          roleplayQuestions: [],
          logoUrl: row.logo_url || row.companies?.logo_url || undefined,
        };
        (found as any).vacancyText = row.vacancy_text || undefined;
        (found as any).tasksActivityText = row.tasks_activity_text || undefined;
        (found as any).motivationTextDetail = row.motivation_text_detail || undefined;
        (found as any).scheduleText = row.schedule_text || undefined;
        (found as any).payoutsText = row.payouts_text || undefined;
        (found as any).onboardingText = row.onboarding_text || undefined;
        (found as any).teamText = row.team_text || undefined;
        (found as any).systemText = row.system_text || undefined;
        setProject(found);
        setCompanyData(row.companies || null);
        if (row.employer_id) {
          const { data: emp } = await dbClient
            .from("employers")
            .select("contact_email, contact_phone, contact_telegram")
            .eq("id", row.employer_id)
            .maybeSingle();
          if (emp) setEmployerContacts({
            email: (emp as any).contact_email || undefined,
            phone: (emp as any).contact_phone || undefined,
            telegram: (emp as any).contact_telegram || undefined,
          });
        }
        setMessages([
          {
            sender: "recruiter",
            text: `Привет! Я — ваш интерактивный карьерный консультант. Я знаю всё о вакансии «${found.roleName}» в компании «${found.companyName}». Размер вознаграждения: ${found.salaryTerms || "достойные условия"}. Задайте любой вопрос о графике, задачах или этапах отбора, и я подробно отвечу! Вы также можете нажать кнопку «Пройти собеседование», чтобы начать блиц-отбор.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      }
    } catch (err) {
      console.error("Error loading project description:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  // Scroll chatbot down
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (customText?: string) => {
    const questionText = customText || userQuestion;
    if (!questionText.trim() || !project || isAiTyping || isTypewriting) return;

    // Add user message
    const userMsg: Message = {
      sender: "candidate",
      text: questionText,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setUserQuestion("");
    setIsAiTyping(true);

    try {
      const { aiChat } = await import("@/lib/aiClient");
      const history = messages.map(m => ({
        role: (m.sender === "candidate" ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      }));
      const p: any = project;
      const c: any = companyData || {};
      const parts: string[] = [
        `Вакансия: ${project.roleName}`,
        `Компания: ${project.companyName}`,
      ];
      if (project.salaryTerms) parts.push(`Оплата: ${project.salaryTerms}`);
      if (project.scheduleTerms) parts.push(`График: ${project.scheduleTerms}`);
      if (p.vacancyText) parts.push(`Задачи/требования/условия:\n${p.vacancyText}`);
      if (p.tasksActivityText) parts.push(`Ежедневный процесс:\n${p.tasksActivityText}`);
      if (p.scheduleText) parts.push(`График подробно:\n${p.scheduleText}`);
      if (p.payoutsText) parts.push(`Выплаты:\n${p.payoutsText}`);
      if (project.motivationText || p.motivationTextDetail) parts.push(`Мотивация:\n${p.motivationTextDetail || project.motivationText}`);
      if (p.onboardingText) parts.push(`Оформление:\n${p.onboardingText}`);
      if (p.teamText) parts.push(`Команда:\n${p.teamText}`);
      if (p.systemText) parts.push(`Система работы:\n${p.systemText}`);
      if (project.customWiki) parts.push(`Wiki:\n${project.customWiki}`);
      if (c.description_text) parts.push(`О компании:\n${c.description_text}`);
      if (c.mission_text) parts.push(`Миссия:\n${c.mission_text}`);
      if (c.products_text) parts.push(`Продукты:\n${c.products_text}`);
      const context = `Отвечай исключительно на основе этих данных по текущей вакансии и компании. Если в данных нет ответа — честно скажи, что уточнишь у работодателя.\n\n${parts.join("\n\n")}`;
      const reply = await aiChat({
        kind: "vacancy_consultant",
        project_id: project.id,
        context,
        messages: [...history, { role: "user", content: questionText }],
      });
      const fullText = reply || "Извините, ИИ-консультант временно недоступен.";
      setIsAiTyping(false);
      setIsTypewriting(true);
      const aiMsg: Message = { sender: "recruiter", text: "", timestamp: new Date().toLocaleTimeString() };
      setMessages(prev => [...prev, aiMsg]);
      const stepMs = 1000 / 30; // 30 chars per second
      await new Promise<void>((resolve) => {
        let i = 0;
        const tick = () => {
          i = Math.min(fullText.length, i + 1);
          setMessages(prev => {
            const copy = prev.slice();
            const last = copy[copy.length - 1];
            if (last && last.sender === "recruiter") {
              copy[copy.length - 1] = { ...last, text: fullText.slice(0, i) };
            }
            return copy;
          });
          if (i < fullText.length) setTimeout(tick, stepMs); else resolve();
        };
        tick();
      });
      setIsTypewriting(false);
    } catch (err) {
      console.error("Failed to fetch response from consultant:", err);
      setIsAiTyping(false);
      setIsTypewriting(false);
    }
  };

  const handleQuickQuestion = (q: string) => {
    handleSendMessage(q);
  };

  const handleApplyOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candName.trim() || !candEmail.trim() || !project) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candName,
          email: candEmail,
          telegramUsername: candTg || "",
          projectId: project.id,
          roleName: project.roleName
        })
      });

      if (res.ok) {
        const candidateInfo = await res.json();
        const candPid = String(candidateInfo.public_id || candidateInfo.publicId || candidateInfo.id).replace(/\D/g, "");
        const vacPid = String(candidateInfo.project_public_id || project.publicId || (project as any).public_id || "400007").replace(/\D/g, "");
        const compPid = String(candidateInfo.company_public_id || (project as any).companyPublicId || (project as any).company_public_id || "300039").replace(/\D/g, "");

        saveCandidateSession({
          token: candidateInfo.token || `cand_token_${candPid}`,
          candidate_id: candidateInfo.id || candidateInfo.candidate_id,
          public_id: candPid,
          project_id: project.id,
          company_id: (project as any).companyId || (project as any).company_id || null,
          email: candEmail.trim().toLowerCase(),
          full_name: candName.trim(),
        });
        localStorage.setItem("cand_session_id", `candidate${candPid}`);
        localStorage.setItem("cand_role", "candidate");
        
        setShowApplyModal(false);
        navigate(`/com${compPid}/vac${vacPid}/cand${candPid}/terms`);
      }
    } catch (err) {
      console.error("Error creating candidate:", err);
      alert("Не удалось зарегистрироваться на вакансию. Повторите попытку.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-transparent backdrop-blur-2xl min-h-screen text-white flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3 p-8 rounded-3xl bg-transparent backdrop-blur-2xl border border-white/20">
          <Loader className="w-8 h-8 animate-spin text-[#E7C768]" />
          <span className="text-sm font-semibold text-slate-200">Загрузка персональной страницы вакансии...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="bg-transparent min-h-screen text-white flex items-center justify-center font-sans p-6">
        <div className="text-center space-y-4 max-w-md bg-transparent backdrop-blur-2xl border border-white/20 p-8 rounded-3xl">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Вакансия не найдена</h2>
          <p className="text-sm text-slate-300">Данный проект был перемещен либо ссылка является недействительной.</p>
          <button onClick={() => navigate("/")} className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer hover:opacity-90 transition">
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-transparent min-h-screen text-white font-sans antialiased flex flex-col justify-between relative selection:bg-[#E7C768]/30">
      
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-50 bg-transparent backdrop-blur-2xl border-b border-white/15 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => navigate("/")}>
            <RRImage 
              src={DEFAULT_RR_LOGO_URL} 
              w={40}
              alt="Робот Рекрутер" 
              className="w-10 h-10 object-contain drop-shadow" 
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Робот Рекрутер
              </span>
              <span className="text-sm font-medium text-slate-300">Презентация вакансии</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center justify-center gap-3 text-sm font-semibold">
            <button onClick={() => navigate("/")} className="landing-btn-inactive transition px-3.5 py-2 text-sm font-semibold cursor-pointer border">
              Главная
            </button>
            <button onClick={() => navigate("/demo")} className="landing-btn-inactive transition px-3.5 py-2 text-sm font-semibold cursor-pointer border">
              Демо-интервью
            </button>
            <button
              onClick={handleGoToCabinet}
              className="landing-btn-inactive transition px-3.5 py-2 text-sm font-semibold cursor-pointer border flex items-center gap-1.5"
            >
              <Briefcase className="w-4 h-4 text-[#E7C768]" />
              <span>В кабинет</span>
            </button>
            <button
              onClick={() => setShowApplyModal(true)}
              className="cursor-pointer landing-btn-active text-sm font-bold px-5 py-2.5 transition shadow-lg border"
            >
              Пройти собеседование
            </button>
          </nav>

          {/* Mobile Burger Toggle Button */}
          <button 
            type="button"
            className="md:hidden flex items-center justify-center p-2 rounded-xl hover:bg-white/10 text-white transition-all cursor-pointer border border-white/15"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6 text-[#E7C768]" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-white/15 flex flex-col gap-3 font-semibold text-sm">
            <button onClick={() => { navigate("/"); setMobileMenuOpen(false); }} className="landing-btn-inactive transition text-left w-full px-4 py-3 rounded-xl border">
              Главная
            </button>
            <button onClick={() => { navigate("/demo"); setMobileMenuOpen(false); }} className="landing-btn-inactive transition text-left w-full px-4 py-3 rounded-xl border">
              Демо-интервью
            </button>
            <button 
              onClick={() => { handleGoToCabinet(); setMobileMenuOpen(false); }} 
              className="landing-btn-inactive transition text-left w-full px-4 py-3 rounded-xl border flex items-center gap-2"
            >
              <Briefcase className="w-4 h-4 text-[#E7C768]" />
              <span>В кабинет</span>
            </button>
            <button 
              onClick={() => { setShowApplyModal(true); setMobileMenuOpen(false); }} 
              className="w-full landing-btn-active font-bold py-3 rounded-xl text-center shadow-lg transition cursor-pointer border"
            >
              Пройти собеседование
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto py-8 px-4 md:px-8 w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Vacancy Details card */}
        <Reveal as="section" direction="left" className="lg:col-span-7 space-y-6 text-left">
          
          <Reveal direction="up" className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
            
            {/* Vacancy Title and Company */}
            <div className="space-y-2">
              <span className="text-sm font-bold text-[#E7C768] bg-transparent backdrop-blur-xl border border-[#E7C768]/40 px-3.5 py-1 rounded-full inline-block">
                Приглашение от работодателя
              </span>
              <h1 className="vacancy-role-title text-3xl font-extrabold leading-tight mt-3">
                {project.roleName}
              </h1>
              <p className="text-lg text-slate-200 font-semibold">{project.companyName}</p>
            </div>

            {/* Core parameters box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-transparent backdrop-blur-xl p-5 rounded-2xl border border-white/15">
              
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 bg-transparent backdrop-blur-xl rounded-xl flex items-center justify-center text-[#E7C768] border border-[#E7C768]/40">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm block text-slate-300 font-medium">Размер вознаграждения</span>
                  <span className="text-base font-bold text-white mt-0.5 block">{project.salaryTerms || "По договоренности"}</span>
                </div>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 bg-transparent backdrop-blur-xl rounded-xl flex items-center justify-center text-[#E7C768] border border-[#E7C768]/40">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm block text-slate-300 font-medium">График работы</span>
                  <span className="text-base font-bold text-white mt-0.5 block">{project.scheduleTerms || "Гибкий"}</span>
                </div>
              </div>

            </div>

            {/* Description & Wiki */}
            <div className="space-y-3">
              <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                <BookOpen className="w-4.5 h-4.5 text-[#E7C768]" /> Условия труда и сведения о компании
              </h3>
              <p className="text-sm text-slate-200 leading-relaxed bg-transparent backdrop-blur-xl p-5 rounded-2xl border border-white/15">
                {project.motivationText || "Компания предоставляет современное оснащение, регулярную выплату вознаграждения, возможности профессионального развития и гибкий формат работы по согласованию."}
              </p>
            </div>

            {/* Custom Wiki Regulations */}
            {project.customWiki && (
              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                  <FileText className="w-4.5 h-4.5 text-[#E7C768]" /> Сводные стандарты и регламенты
                </h3>
                <div className="text-sm text-slate-200 leading-relaxed bg-transparent backdrop-blur-xl p-5 rounded-2xl border border-white/15 max-h-48 overflow-y-auto">
                  {project.customWiki}
                </div>
                <span className="text-sm block text-slate-300 font-sans italic">
                  На основе этих регламентов Робот Рекрутер сформирует персональные материалы после прохождения отбора.
                </span>
              </div>
            )}

            {/* Interview requirements info */}
            <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/40 p-5 rounded-2xl space-y-3">
              <h4 className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Что ждет вас на экспресс-отборе?</h4>
              <ul className="text-sm text-slate-200 space-y-2 list-disc list-inside">
                <li>Интерактивное ИИ-интервью в чате с Роботом Рекрутером.</li>
                <li>Проверка резюме (текстом или прикрепленным файлом).</li>
                <li>Разбор практической рабочей ситуации.</li>
                <li>Мгновенный разбор ответов и доступ к персональным учебным материалам.</li>
              </ul>
            </div>

            {/* CTA action button */}
            <div className="pt-2 text-center sm:text-left">
              {employerContacts && (employerContacts.email || employerContacts.phone || employerContacts.telegram) && (
                <div className="mb-4 bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-5 space-y-2 text-left">
                  <h3 className="font-bold text-sm bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                    <User className="w-4 h-4 text-[#E7C768]" /> Контакты работодателя
                  </h3>
                  <div className="space-y-2 text-sm text-slate-200">
                    {employerContacts.email && (
                      <a href={`mailto:${employerContacts.email}`} className="flex items-center gap-2 hover:text-[#E7C768] transition">
                        <Mail className="w-4 h-4 text-slate-300" /> {employerContacts.email}
                      </a>
                    )}
                    {employerContacts.phone && (
                      <a href={`tel:${employerContacts.phone}`} className="flex items-center gap-2 hover:text-[#E7C768] transition">
                        <HelpCircle className="w-4 h-4 text-slate-300" /> {employerContacts.phone}
                      </a>
                    )}
                    {employerContacts.telegram && (
                      <a href={`https://t.me/${String(employerContacts.telegram).replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-[#E7C768] transition">
                        <MessageSquare className="w-4 h-4 text-slate-300" /> @{String(employerContacts.telegram).replace(/^@/, "")}
                      </a>
                    )}
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowApplyModal(true)}
                className="cursor-pointer inline-flex items-center gap-2.5 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-base px-8 py-4 rounded-2xl shadow-2xl hover:opacity-95 transition duration-150 w-full sm:w-auto text-center justify-center"
              >
                Пройти собеседование <ArrowRight className="w-5 h-5" />
              </button>
            </div>

          </Reveal>

        </Reveal>

        {/* Right Side: Vacancy AI-Consultant chat widget */}
        <Reveal as="aside" direction="right" delay={150} className="lg:col-span-5 space-y-4">
          
          <Reveal direction="up" className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col h-[560px]">
            
            {/* Header info */}
            <div className="flex items-center gap-3 border-b border-white/15 pb-4 mb-4 text-left">
              <Mascot state="greeting" size="sm" />
              <div>
                <h3 className="font-bold text-sm bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">ИИ-Консультант</h3>
                <p className="text-xs text-slate-300 font-medium">Отвечает на любые вопросы о вакансии</p>
              </div>
              <span className="ml-auto w-2.5 h-2.5 rounded-full bg-[#E7C768] animate-pulse" title="ИИ на связи"></span>
            </div>

            {/* Chat message body list */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-sm text-left mb-3">
              {messages.map((m, i) => {
                const isRecruiter = m.sender === "recruiter";
                return (
                  <div
                    key={i}
                    className={`flex flex-col max-w-[85%] ${
                      isRecruiter ? "mr-auto text-left" : "ml-auto text-right"
                    }`}
                  >
                    <div
                      className={`p-3.5 rounded-2xl leading-relaxed text-sm font-medium ${
                        isRecruiter
                          ? "bg-transparent backdrop-blur-xl border border-white/15 text-slate-100 rounded-tl-none"
                          : "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-semibold rounded-tr-none shadow"
                      }`}
                    >
                      <div className="markdown-body">
                        <Markdown>{m.text}</Markdown>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 mt-1 block px-1">
                      {m.timestamp}
                    </span>
                  </div>
                );
              })}

              {isAiTyping && (
                <div className="flex items-center gap-1.5 bg-transparent backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl rounded-tl-none w-max block">
                  <span className="w-2 h-2 bg-[#E7C768] rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-[#E7C768] rounded-full animate-bounce delay-100"></span>
                  <span className="w-2 h-2 bg-[#E7C768] rounded-full animate-bounce delay-200"></span>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Preset quick question trigger tags */}
            <div className="bg-transparent backdrop-blur-xl p-3 rounded-2xl border border-white/15 mb-3 flex flex-wrap gap-2 text-left">
              <span className="text-xs block text-slate-300 w-full font-semibold mb-0.5">Частые вопросы:</span>
              <button
                onClick={() => handleQuickQuestion("Какая реальная оплата на этой позиции?")}
                className="bg-transparent backdrop-blur-xl border border-white/15 hover:border-[#E7C768] text-xs font-semibold text-slate-200 px-3 py-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
              >
                Какая оплата?
              </button>
              <button
                onClick={() => handleQuickQuestion("Можно ли работать удаленно или гибко?")}
                className="bg-transparent backdrop-blur-xl border border-white/15 hover:border-[#E7C768] text-xs font-semibold text-slate-200 px-3 py-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
              >
                Формат и график?
              </button>
              <button
                onClick={() => handleQuickQuestion("Что нужно для прохождения отбора?")}
                className="bg-transparent backdrop-blur-xl border border-white/15 hover:border-[#E7C768] text-xs font-semibold text-slate-200 px-3 py-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
              >
                Как пройти отбор?
              </button>
            </div>

            {/* Input action bar */}
            <div className="flex gap-2">
              <input
                type="text"
                className="w-full bg-transparent backdrop-blur-xl border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#E7C768] transition placeholder:text-slate-400"
                placeholder="Задать вопрос консультанту..."
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isAiTyping || isTypewriting || !userQuestion.trim()}
                className="cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] p-3 rounded-xl font-bold transition flex items-center justify-center disabled:opacity-50 hover:opacity-90"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

          </Reveal>

          <Reveal direction="up" delay={120} className="bg-transparent backdrop-blur-2xl border border-white/15 p-5 rounded-3xl text-left space-y-1.5">
            <h4 className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Помощь ИИ</h4>
            <p className="text-sm text-slate-300 leading-relaxed">
              Напишите вопрос о любых деталях вакансии в диалоговое окно. Робот сверит регламенты и предоставит точный ответ.
            </p>
          </Reveal>

        </Reveal>

      </main>

      {/* Candidate Registration / Apply Modal Dialog */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-fade-in">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 text-white rounded-3xl max-w-md w-full p-6 md:p-8 space-y-6 shadow-2xl relative text-left">
            
            <button
              onClick={() => setShowApplyModal(false)}
              className="absolute top-5 right-5 hover:bg-white/10 p-2 rounded-full text-slate-300 hover:text-white transition cursor-pointer border border-white/15"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <h3 className="text-2xl font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Регистрация на блиц-отбор</h3>
              <p className="text-sm text-slate-300">
                Заполните контакты, чтобы запустить Робота Рекрутера и войти в кабинет соискателя.
              </p>
            </div>

            <form onSubmit={handleApplyOnboarding} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#E7C768]" /> Ваше имя и фамилия:
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-transparent backdrop-blur-xl text-sm p-3 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] text-white font-medium placeholder:text-slate-400"
                  placeholder="Иван Петров"
                  value={candName}
                  onChange={(e) => setCandName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-[#E7C768]" /> Контактный Email:
                </label>
                <input
                  type="email"
                  required
                  className="w-full bg-transparent backdrop-blur-xl text-sm p-3 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] text-white font-medium placeholder:text-slate-400"
                  placeholder="name@example.com"
                  value={candEmail}
                  onChange={(e) => setCandEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-[#E7C768]" /> Telegram логин:
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-sm text-slate-400 font-bold">@</span>
                  <input
                    type="text"
                    className="w-full bg-transparent backdrop-blur-xl text-sm pl-8 pr-3.5 py-3 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] text-white font-medium placeholder:text-slate-400"
                    placeholder="username"
                    value={candTg}
                    onChange={(e) => setCandTg(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="cursor-pointer w-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold py-3.5 rounded-xl hover:opacity-95 transition flex items-center justify-center gap-2 shadow-xl mt-3 text-sm"
              >
                {submitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" /> Авторизация...
                  </>
                ) : (
                  <>
                    Запустить Робота Рекрутера <ChevronRight className="w-4.5 h-4.5" />
                  </>
                )}
              </button>

            </form>

            <span className="text-xs block text-center text-slate-400 leading-relaxed italic">
              Заполняя данные, вы соглашаетесь с обработкой персональных данных для прохождения собеседования.
            </span>

          </div>
        </div>
      )}

      {/* Floating AI Assistant — per-vacancy knowledge base */}
      {project && (
        <VacancyAIAssistant
          projectId={project.id}
          roleName={project.roleName}
          vacancySlug={project.slug || (project as any).roleSlug || (project as any).role_slug}
          companyName={project.companyName}
          companySlug={(companyData as any)?.slug || (companyData as any)?.allslug || (project as any).companySlug}
          companyId={(project as any).companyId || (project as any).company_id || (companyData as any)?.id}
          logoUrl={project.logoUrl || (companyData as any)?.logo_url}
          themeConfig={effectiveTheme}
          containerBorderRadius={effectiveTheme.containerBorderRadius}
          logoFilterColor={effectiveTheme.logoFilterColor}
          logoFilterOpacity={effectiveTheme.logoFilterOpacity}
          logoBgColor={effectiveTheme.logoBgColor}
          logoBgOpacity={effectiveTheme.logoBgOpacity}
          themeColors={{
            headingColor: effectiveTheme.headingsSolidColor,
            bodyTextColor: effectiveTheme.bodyTextColor,
            boldTextColor: effectiveTheme.boldTextColor,
            iconColor: effectiveTheme.iconColor,
            headingsColorMode: effectiveTheme.headingsColorMode,
          }}
          context={(() => {
            const p: any = project; const c: any = companyData || {};
            const parts: string[] = [
              `Вакансия: ${project.roleName}`,
              `Компания: ${project.companyName}`,
            ];
            if (project.salaryTerms) parts.push(`Оплата: ${project.salaryTerms}`);
            if (project.scheduleTerms) parts.push(`График: ${project.scheduleTerms}`);
            if (p.vacancyText) parts.push(`Задачи/требования/условия:\n${p.vacancyText}`);
            if (p.tasksActivityText) parts.push(`Ежедневный процесс:\n${p.tasksActivityText}`);
            if (p.scheduleText) parts.push(`График подробно:\n${p.scheduleText}`);
            if (p.payoutsText) parts.push(`Выплаты:\n${p.payoutsText}`);
            if (project.motivationText || p.motivationTextDetail) parts.push(`Мотивация:\n${p.motivationTextDetail || project.motivationText}`);
            if (p.onboardingText) parts.push(`Оформление:\n${p.onboardingText}`);
            if (p.teamText) parts.push(`Команда:\n${p.teamText}`);
            if (p.systemText) parts.push(`Система работы:\n${p.systemText}`);
            if (project.customWiki) parts.push(`Wiki:\n${project.customWiki}`);
            if (c.description_text) parts.push(`О компании:\n${c.description_text}`);
            if (c.mission_text) parts.push(`Миссия:\n${c.mission_text}`);
            if (c.products_text) parts.push(`Продукты:\n${c.products_text}`);
            return `Отвечай исключительно на основе этих данных по текущей вакансии и компании. Если в данных нет ответа — честно скажи, что уточнишь у работодателя.\n\n${parts.join("\n\n")}`;
          })()}
        />
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        intent="employer"
        initialMode="login"
        onSuccess={() => {
          try {
            sessionStorage.removeItem("employer_preloaded");
            sessionStorage.setItem("show_employer_entry_loader", "1");
          } catch {}
          const targetEmpId = localStorage.getItem("employer_public_id") || localStorage.getItem("emp_public_id") || project?.employerId || "100007";
          navigate(`/emp${targetEmpId}`);
        }}
      />
    </div>
  );
}
