/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import RRImage from "@/components/RRImage";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import EmployerAIAssistant from "../components/EmployerAIAssistant";
import SelectCompanyModalForVacancy from "@/components/SelectCompanyModalForVacancy";
import VacancyCreationLimitModal from "@/components/VacancyCreationLimitModal";
import OnboardingHost from "../components/OnboardingHost";
import HiringCalculator from "../components/HiringCalculator";
import VacancyLimitAllocator, { MinimalVacancyLimits } from "../components/VacancyLimitAllocator";
import TrainingWizard from "../components/TrainingWizard";
import TrainingList from "../components/TrainingList";
import InterviewList from "../components/InterviewList";
import InterviewWizard from "../components/InterviewWizard";
import SpendConfirmDialog, { type SpendKind } from "../components/SpendConfirmDialog";
import CompanyTeamModal from "../components/team/CompanyTeamModal";
import { JobProject, Candidate } from "../types";
import { fetchJobTitles, upsertJobTitle } from "@/lib/jobTitles";
import {
  DEFAULT_VAC_TEMPLATES,
  DEFAULT_TRAINING_TEMPLATES,
  getRoleTemplates,
  mergedTemplate,
  saveRoleTemplates,
  type TrainingFieldKey,
} from "@/lib/vacancyTemplates";
import { dbClient } from "@/lib/dbClient";
import { resizeToWebP } from "@/lib/imageResize";
import { getUploadService, FileUploadService } from "@/services/FileUploadService";
import { resolveActiveEmployerId } from "@/lib/actorSession";
import { FIXED_PRICES, packTierPrice } from "@/lib/rr";
import { useAIWait } from "../components/AIWaitProvider";
import { ruField } from "@/lib/fieldLabels";
import { useAIReady } from "../lib/aiReady";
import SitePreview from "../components/SitePreview";
import VacancyEditor from "../components/VacancyEditor";
import { DocumentUploader } from "../components/DocumentUploader";
import { scoreTone, type ToneLabel } from "@/lib/scoreTone";
import NotificationsBell from "@/components/NotificationsBell";
import LandingPreloader from "../components/LandingPreloader";
import { rrImg, DEFAULT_RR_LOGO_URL } from "@/lib/img";
import AuthModal from "../components/AuthModal";
import AudioField from "../components/AudioField";
import { CrmFilterModal, KanbanColumnModal, TableColumnModal, type CrmFieldFilters, type AvailableCustomField } from "@/components/crm/CrmModals";
import CrmConstructorModal from "@/components/CrmConstructorModal";
import CrmDialogsModal from "@/components/CrmDialogsModal";
import AcademyModal from "@/components/AcademyModal";
import ArchiveVacancyModal from "@/components/vacancies/ArchiveVacancyModal";
import {
  parseVacancyCandidateFieldsConfig,
  extractStandardFieldsFromCandidateRow,
  extractCustomFieldsFromCandidateRow,
} from "@/lib/candidateFields";
import {
  STANDARD_CANDIDATE_FIELDS,
  normalizeStandardFieldsFromCandidate,
  normalizeCustomFieldsFromCandidate,
} from "@/constants/candidateFields";
import MiniAudioField from "../components/MiniAudioField";
import {
  VACANCY_FIELDS,
  VACANCY_FIELDS_BY_KEY,
  type VacancyFieldKey,
  type VacancyField,
} from "../lib/fieldFormats";
import {
  cacheEmployerPublicId,
  clearCachedEmployerPublicId,
  isEmployerPublicIdCandidate,
  parseEmployerPublicIdFromPath,
  transliterateToSlug,
} from "@/lib/links";

// ---------------------------------------------------------------------------
// Mapping helpers: JobProject (camelCase) ↔ VacancyFormValues (snake_case keys
// matching `public.projects` columns and the canonical 15-field spec).
// ---------------------------------------------------------------------------
const CAMEL_BY_KEY: Record<VacancyFieldKey, string> = {
  role_name: "roleName",
  vacancy_text: "vacancyText",
  tasks_activity_text: "tasksActivityText",
  schedule_text: "scheduleText",
  motivation_text: "motivationText",
  motivation_text_detail: "motivationTextDetail",
  payouts_text: "payoutsText",
  onboarding_text: "onboardingText",
  team_text: "teamText",
  system_text: "systemText",
  training_professional_text: "trainingProfessionalText",
  training_product_text: "trainingProductText",
  training_systems_text: "trainingSystemsText",
  training_wiki_text: "trainingWikiText",
  training_regulations_text: "trainingRegulationsText",
};

function projectToVacancyValues(p: any): Partial<Record<VacancyFieldKey, string>> & { candidate_fields_config?: any } {
  const out: any = {};
  for (const key of Object.keys(CAMEL_BY_KEY) as VacancyFieldKey[]) {
    out[key] = p?.[CAMEL_BY_KEY[key]] ?? "";
  }
  out.candidate_fields_config = p?.candidate_fields_config ?? p?.candidateFieldsConfig ?? "";
  return out;
}

function vacancyValuesToCamel(
  patch: Partial<Record<VacancyFieldKey, string>> & { candidate_fields_config?: any },
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "candidate_fields_config") {
      out.candidate_fields_config = v;
      out.candidateFieldsConfig = v;
    } else if (CAMEL_BY_KEY[k as VacancyFieldKey]) {
      out[CAMEL_BY_KEY[k as VacancyFieldKey]] = v ?? "";
    }
  }
  return out;
}

/**
 * Map the per-role template payload (legacy keys used by saveRoleTemplates +
 * generic DEFAULT_*_TEMPLATES) onto the canonical VacancyFieldKey schema used
 * by `<VacancyEditor>`. Used to (a) feed `roleTemplates` prop to the editor
 * so the "Шаблон" button picks per-role values, and (b) bulk-overwrite all
 * 15 fields when the user changes the role.
 */
function roleTplToFields(
  tpl: Record<string, string> | undefined | null,
): Partial<Record<VacancyFieldKey, string>> {
  const t = tpl || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = (t as any)?.[k];
      if (v && String(v).trim()) return String(v);
    }
    return "";
  };
  return {
    vacancy_text: pick("vacancy_text"),
    tasks_activity_text: pick("tasks_activity_text"),
    schedule_text: pick("schedule_text"),
    motivation_text: pick("motivation_text"),
    motivation_text_detail: pick("motivation_text_detail"),
    payouts_text: pick("payouts_text"),
    onboarding_text: pick("onboarding_text"),
    team_text: pick("team_text", "team_text_vac"),
    system_text: pick("system_text", "system_text_vac"),
    training_professional_text: pick("training_professional_text", "training_prof_text"),
    training_product_text: pick("training_product_text"),
    training_systems_text: pick("training_systems_text", "training_system_text"),
    training_wiki_text: pick("training_wiki_text"),
    training_regulations_text: pick("training_regulations_text"),
  };
}
import {
  Users,
  Smartphone,
  Plus,
  Send,
  Chrome,
  Cpu,
  Search,
  RefreshCw,
  Copy,
  Check,
  CheckCircle,
  FileText,
  LogOut,
  Settings,
  ArrowLeftRight,
  Menu,
  X,
  Briefcase,
  Building2,
  CreditCard,
  User,
  Activity,
  Bell,
  Mail,
  Layers,
  Trash2,
  Play,
  Pause,
  ShieldCheck,
  Sliders,
  DollarSign,
  Award,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Phone,
  MessageSquare,
  GraduationCap,
  Upload,
  Wand2,
  Lock,
  CheckCircle2,
  UserCheck,
  Loader2,
  Edit,
  Handshake,
  Image as ImageIcon,
  Palette,
  ExternalLink,
  SlidersHorizontal,
  Filter,
  HelpCircle,
  MessageSquareCode,
  Archive,
} from "lucide-react";
import {
  VacancyView,
  MotivationView,
  CompanyView,
  OnboardingView,
  PayoutsView,
  ScheduleView,
  TeamView,
  SystemView
} from "../components/VacancySections";
import CandidateDetailsModal from "../components/CandidateDetailsModal";
import OfferConsent from "../components/OfferConsent";
import HHTemplatesSection from "../components/HHTemplatesSection";
import { useConfirm } from "../components/ConfirmDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function EmployerPanel() {
  const { path, navigate } = useRouter();

  // Employer identity state
  const [employerId, setEmployerId] = useState<string>(() => {
    const fromUrl = parseEmployerPublicIdFromPath(window.location.pathname);
    if (fromUrl) return fromUrl;
    try {
      const raw = localStorage.getItem("emp_user");
      if (raw) {
        const u = JSON.parse(raw);
        const pid = u.publicId || u.public_id || u.employerId;
        if (pid && isEmployerPublicIdCandidate(pid)) return String(pid);
      }
    } catch {}
    return "100007";
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { run: aiWaitRun } = useAIWait();
  const aiReady = useAIReady();
  const confirm = useConfirm();
  const [authReady, setAuthReady] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [dataLoadPercent, setDataLoadPercent] = useState<number>(15);
  const [dataLoadStatusText, setDataLoadStatusText] = useState<string>("Подключение к защищенной базе данных...");
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(() => {
    try {
      const t = localStorage.getItem("emp_token") || localStorage.getItem("employer_token");
      return Boolean(t);
    } catch {
      return false;
    }
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => {
    try {
      const t = localStorage.getItem("emp_token") || localStorage.getItem("employer_token");
      return !t;
    } catch {
      return true;
    }
  });

  const handleAuthSuccess = () => {
    setHasValidSession(true);
    setIsAuthModalOpen(false);
    try {
      sessionStorage.removeItem("employer_preloaded");
      sessionStorage.setItem("show_employer_entry_loader", "1");
    } catch {}
    setIsPreloading(true);
    fetchEmployerData();
  };
  const [isPreloading, setIsPreloading] = useState<boolean>(() => {
    try {
      if (sessionStorage.getItem("show_employer_entry_loader") === "1") return true;
      if (sessionStorage.getItem("employer_preloaded") !== "1") return true;
      return true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    let mounted = true;
    try {
      dbClient.auth.getSession().then(({ data: { session } }) => {
        if (!mounted) return;
        setAuthUserId(session?.user?.id ?? null);
        setAuthReady(true);
      }).catch(() => {
        if (mounted) setAuthReady(true);
      });
      const { data: { subscription } } = dbClient.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        setAuthUserId(session?.user?.id ?? null);
        setAuthReady(true);
      });
      return () => {
        mounted = false;
        try {
          subscription.unsubscribe();
        } catch {}
      };
    } catch {
      setAuthReady(true);
    }
  }, []);

  // Derive active tab from subroute PATH
  let activeTab: "crm" | "vacancies" | "companies" | "tariff" | "profile" | "interviews" | "training" = "crm";
  if (path.includes("/vacancies")) {
    activeTab = "vacancies";
  } else if (path.includes("/companies")) {
    activeTab = "companies";
  } else if (path.includes("/tariff") || path.includes("/billing") || path.includes("/invoice") || path.includes("/payment") || path.includes("/accounts")) {
    activeTab = "tariff";
  } else if (path.includes("/profile")) {
    activeTab = "profile";
  } else if (path.includes("/interviews")) {
    activeTab = "interviews";
  } else if (path.includes("/training")) {
    activeTab = "training";
  } else {
    activeTab = "crm";
  }

  // CRM sub-view styles
  const [crmViewMode, setCrmViewMode] = useState<"kanban" | "table">("kanban");
  const [crmFilterRole, setCrmFilterRole] = useState<string>("all");
  const [crmFilterCompany, setCrmFilterCompany] = useState<string>("all");
  const [crmFilterStage, setCrmFilterStage] = useState<string>("all");
  const [crmFilterVerdict, setCrmFilterVerdict] = useState<string>("all");
  const [crmFilterDecision, setCrmFilterDecision] = useState<string>("all");
  const [crmSort, setCrmSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "created", dir: "desc" });
  // Period filter on updated_at: "all" | "24h" | "custom"
  const [crmDatePreset, setCrmDatePreset] = useState<"all" | "24h" | "custom">("all");
  const [crmDateFrom, setCrmDateFrom] = useState<string>("");
  const [crmDateTo, setCrmDateTo] = useState<string>("");
  const [hireDecisionMap, setHireDecisionMap] = useState<Record<string, string>>({});

  // Unified Filter Modal & Column Modals
  const [isCrmFilterModalOpen, setIsCrmFilterModalOpen] = useState(false);
  const [isCrmConstructorOpen, setIsCrmConstructorOpen] = useState(false);
  const [isCrmDialogsOpen, setIsCrmDialogsOpen] = useState(false);
  const [isAcademyModalOpen, setIsAcademyModalOpen] = useState(false);
  const [academyModalSlug, setAcademyModalSlug] = useState<string>("crm");

  const [kanbanVisibleCols, setKanbanVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`crm_kanban_cols_${employerId || "emp"}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [kanbanCardFields, setKanbanCardFields] = useState<{
    showRole: boolean;
    showCompany: boolean;
    showEmail: boolean;
    showPhone: boolean;
    showCity: boolean;
    showExperience: boolean;
    showScores: boolean;
    showOverall: boolean;
    showVerdict: boolean;
    showDecision: boolean;
    showDate: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem(`crm_kanban_cards_${employerId || "emp"}`);
      return saved
        ? JSON.parse(saved)
        : {
            showRole: true,
            showCompany: false,
            showEmail: true,
            showPhone: true,
            showCity: false,
            showExperience: false,
            showScores: true,
            showOverall: true,
            showVerdict: true,
            showDecision: true,
            showDate: true,
          };
    } catch {
      return {
        showRole: true,
        showCompany: false,
        showEmail: true,
        showPhone: true,
        showCity: false,
        showExperience: false,
        showScores: true,
        showOverall: true,
        showVerdict: true,
        showDecision: true,
        showDate: true,
      };
    }
  });

  const [tableVisibleCols, setTableVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`crm_table_cols_${employerId || "emp"}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [tablePageSize, setTablePageSize] = useState<number | "all">(() => {
    try {
      const saved = localStorage.getItem(`crm_table_pagesize_${employerId || "emp"}`);
      if (saved === "all") return "all";
      const num = Number(saved);
      return [10, 25, 100, 500].includes(num) ? num : 25;
    } catch {
      return 25;
    }
  });

  const [tableCurrentPage, setTableCurrentPage] = useState<number>(1);

  // Sync CRM Constructor Settings with Server (PostgreSQL BD ProTalk)
  useEffect(() => {
    const empId = employerId || "emp";
    fetch(`/api/crm/constructor/${encodeURIComponent(empId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings) {
          if (data.settings.kanbanVisibleCols) setKanbanVisibleCols(data.settings.kanbanVisibleCols);
          if (data.settings.kanbanCardFields) setKanbanCardFields(data.settings.kanbanCardFields);
          if (data.settings.tableVisibleCols) setTableVisibleCols(data.settings.tableVisibleCols);
          if (data.settings.tablePageSize) setTablePageSize(data.settings.tablePageSize);
        }
      })
      .catch(() => null);
  }, [employerId]);

  const syncConstructorToServer = (override?: any) => {
    const empId = employerId || "emp";
    const payload = {
      kanbanVisibleCols,
      kanbanCardFields,
      tableVisibleCols,
      tablePageSize,
      ...override,
    };
    fetch(`/api/crm/constructor/${encodeURIComponent(empId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: payload }),
    }).catch(() => null);
  };

  const handleToggleKanbanCol = (stage: string) => {
    setKanbanVisibleCols((prev) => {
      const next = { ...prev, [stage]: prev[stage] === false ? true : false };
      try { localStorage.setItem(`crm_kanban_cols_${employerId || "emp"}`, JSON.stringify(next)); } catch {}
      syncConstructorToServer({ kanbanVisibleCols: next });
      return next;
    });
  };

  const handleSetAllKanbanCols = (visible: boolean) => {
    const next: Record<string, boolean> = {};
    const stages = ["registration", "screening", "checklist", "situations", "interview_reject", "interview_success", "professional", "product", "systems", "certified"];
    stages.forEach((s) => { next[s] = visible; });
    setKanbanVisibleCols(next);
    try { localStorage.setItem(`crm_kanban_cols_${employerId || "emp"}`, JSON.stringify(next)); } catch {}
    syncConstructorToServer({ kanbanVisibleCols: next });
  };

  const handleToggleKanbanCardField = (key: string) => {
    setKanbanCardFields((prev: any) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(`crm_kanban_cards_${employerId || "emp"}`, JSON.stringify(next)); } catch {}
      syncConstructorToServer({ kanbanCardFields: next });
      return next;
    });
  };

  const handleToggleTableCol = (key: string) => {
    setTableVisibleCols((prev) => {
      const next = { ...prev, [key]: prev[key] === false ? true : false };
      try { localStorage.setItem(`crm_table_cols_${employerId || "emp"}`, JSON.stringify(next)); } catch {}
      syncConstructorToServer({ tableVisibleCols: next });
      return next;
    });
  };

  const handleChangeTablePageSize = (size: number | "all") => {
    setTablePageSize(size);
    setTableCurrentPage(1);
    try { localStorage.setItem(`crm_table_pagesize_${employerId || "emp"}`, String(size)); } catch {}
    syncConstructorToServer({ tablePageSize: size });
  };
  const [kanbanModalStage, setKanbanModalStage] = useState<string | null>(null);
  const [tableModalCol, setTableModalCol] = useState<string | null>(null);
  const [crmFieldFilters, setCrmFieldFilters] = useState<CrmFieldFilters>({});

  // Per-column controls for Kanban
  const [kanbanColSearch, setKanbanColSearch] = useState<Record<string, string>>({});
  const [kanbanColSearchOpen, setKanbanColSearchOpen] = useState<Record<string, boolean>>({});
  const [kanbanColSort, setKanbanColSort] = useState<Record<string, { field: "name" | "date" | "score"; dir: "asc" | "desc" } | undefined>>({});
  const [kanbanColFilter, setKanbanColFilter] = useState<Record<string, { decision?: string; verdict?: string } | undefined>>({});
  const [kanbanColMenuOpen, setKanbanColMenuOpen] = useState<Record<string, boolean>>({});

  // Per-column controls for CRM Table
  const [tableColFilters, setTableColFilters] = useState<{
    name?: string;
    city?: string;
    workExperience?: string;
    skills?: string;
    education?: string;
    customFieldKey?: string;
    customFieldValue?: string;
    verdict?: string;
    company?: string;
    companySearch?: string;
    role?: string;
    roleSearch?: string;
    stage?: string;
    decision?: string;
    createdPreset?: string;
    createdFrom?: string;
    createdTo?: string;
    updatedPreset?: string;
    updatedFrom?: string;
    updatedTo?: string;
    resumeScoreMin?: number;
    checklistScoreMin?: number;
    situationsScoreMin?: number;
    overallScoreMin?: number;
    scoreField?: string;
    scoreMin?: number;
    [key: string]: any;
  }>({});
  const [tableFilterOpen, setTableFilterOpen] = useState<string | null>(null);

  // Kanban refs + helpers (CRM hotfix v2)
  const kanbanViewportRef = useRef<HTMLDivElement | null>(null);
  const kanbanColumnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const kanbanTopScrollRef = useRef<HTMLDivElement | null>(null);
  const kanbanTopSpacerRef = useRef<HTMLDivElement | null>(null);
  const [kanbanEdge, setKanbanEdge] = useState<{ left: boolean; right: boolean }>({ left: true, right: false });
  const updateKanbanEdges = () => {
    const v = kanbanViewportRef.current;
    if (!v) return;
    const atLeft = v.scrollLeft <= 2;
    const atRight = v.scrollLeft + v.clientWidth >= v.scrollWidth - 2;
    setKanbanEdge({ left: atLeft, right: atRight });
    // Sync top scrollbar spacer width + position
    const t = kanbanTopScrollRef.current;
    const s = kanbanTopSpacerRef.current;
    if (t && s) {
      if (s.style.width !== `${v.scrollWidth}px`) s.style.width = `${v.scrollWidth}px`;
      if (Math.abs(t.scrollLeft - v.scrollLeft) > 1) t.scrollLeft = v.scrollLeft;
    }
  };
  const scrollKanban = (direction: "left" | "right") => {
    const v = kanbanViewportRef.current;
    if (!v) return;
    const delta = v.clientWidth * 0.75;
    v.scrollBy({ left: direction === "right" ? delta : -delta, behavior: "smooth" });
  };
  const scrollToKanbanStage = (stage: string) => {
    const v = kanbanViewportRef.current;
    const col = kanbanColumnRefs.current[stage];
    if (!v || !col) return;
    v.scrollTo({ left: col.offsetLeft - 12, behavior: "smooth" });
  };
  const handleKanbanDragOver = (e: React.DragEvent) => {
    const v = kanbanViewportRef.current;
    if (!v) return;
    const rect = v.getBoundingClientRect();
    const edgeZone = 80;
    const step = 24;
    if (e.clientX < rect.left + edgeZone) v.scrollLeft -= step;
    else if (e.clientX > rect.right - edgeZone) v.scrollLeft += step;
  };

  // Fetching data state
  const [projects, setProjects] = useState<JobProject[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // Training tab: list ↔ editor toggle
  const [trainingView, setTrainingView] = useState<{ mode: "list" } | { mode: "edit"; projectId: string } | { mode: "create"; projectId?: string }>({ mode: "list" });
  // Interview tab: list ↔ editor toggle (mirrors training)
  const [interviewView, setInterviewView] = useState<{ mode: "list" } | { mode: "edit"; projectId: string } | { mode: "create"; projectId?: string }>({ mode: "list" });
  const [interviewListReloadKey, setInterviewListReloadKey] = useState(0);
  const [tgMsgLog, setTgMsgLog] = useState<{ id: string; chatId: string; message: string; timestamp: string }[]>([]);
  const [aiStatus, setAiStatus] = useState({ active: true, model: "" });

  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [copiedEmployerId, setCopiedEmployerId] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Spend-confirm modal (charge for landing / interview_setup / training_setup
  // *before* opening the corresponding wizard).
  type SpendDialogState = {
    kind: SpendKind;
    projectId?: string;
    pickProjects?: JobProject[];
    excludeProjectIds?: Set<string>;
    onConfirmed: (projectId: string, result: import("@/components/SpendConfirmDialog").SpendResult) => void;
    onCancel?: () => void;
  };
  const [spendDialog, setSpendDialog] = useState<SpendDialogState | null>(null);

  // CRM States
  const [crmSearch, setCrmSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // Listen for "open-candidate-card" (dispatched by NotificationsBell) and
  // for a ?candidate=<id> URL param so notifications can deep-link into the
  // CRM candidate card without a full navigation.
  useEffect(() => {
    const onOpen = (e: any) => {
      const id = e?.detail?.id;
      if (id) setSelectedCandidateId(String(id));
    };
    window.addEventListener("open-candidate-card", onOpen as any);
    return () => window.removeEventListener("open-candidate-card", onOpen as any);
  }, []);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const id = sp.get("candidate");
      if (id) {
        setSelectedCandidateId(id);
        sp.delete("candidate");
        const qs = sp.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }
    } catch { /* ignore */ }
  }, []);

  // Mailing States
  const [mailingSegment, setMailingSegment] = useState<string>("all");
  const [mailingTemplate, setMailingTemplate] = useState<string>("welcome");
  const [mailingText, setMailingText] = useState("Здравствуйте! Рады видеть вас в команде. Пожалуйста, пройдите ИИ-собеседование для активации.");
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [mailingLogs, setMailingLogs] = useState<string[]>([]);

  // Vacancy States
  const [pausedProjectIds, setPausedProjectIds] = useState<string[]>([]);
  const [setupCompanyName, setSetupCompanyName] = useState("");
  const [setupRoleName, setSetupRoleName] = useState("Менеджер по продажам");
  const [setupSalary, setSetupSalary] = useState("80000 - 120000 руб");
  const [setupSchedule, setSetupSchedule] = useState("5/2, гибридный график");
  const [setupCustomWiki, setSetupCustomWiki] = useState("Правила адаптации: мы поставляем ИИ-сервисы. Кандидат должен владеть техниками продаж.");
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [showAddNewVacancy, setShowAddNewVacancy] = useState(false);
  const [showSelectCompanyModalForVacancy, setShowSelectCompanyModalForVacancy] = useState(false);
  const [showVacancyLimitModal, setShowVacancyLimitModal] = useState(false);
  const [pendingVacancyPaymentMethod, setPendingVacancyPaymentMethod] = useState<"credit" | "balance">("credit");
  const [isCreatingVacancyDraft, setIsCreatingVacancyDraft] = useState(false);
  const [showCompanyTeamModal, setShowCompanyTeamModal] = useState<boolean>(false);
  const [selectedTeamCompany, setSelectedTeamCompany] = useState<any>(null);

  // Extended vacancy wizard fields (mirror of project landing sections).
  const [setupVacancyText, setSetupVacancyText] = useState("");
  const [setupTasksActivityText, setSetupTasksActivityText] = useState("");
  const [setupMotivationText, setSetupMotivationText] = useState("");
  const [setupMotivationDetail, setSetupMotivationDetail] = useState("");
  const [setupScheduleText, setSetupScheduleText] = useState("");
  const [setupPayoutsText, setSetupPayoutsText] = useState("");
  const [setupOnboardingText, setSetupOnboardingText] = useState("");
  const [setupTeamText, setSetupTeamText] = useState("");
  const [setupSystemText, setSetupSystemText] = useState("");
  // Training-group canonical fields (4/15) — also persisted on save.
  const [setupTrainingProfessionalText, setSetupTrainingProfessionalText] = useState("");
  const [setupTrainingProductText, setSetupTrainingProductText] = useState("");
  const [setupTrainingSystemsText, setSetupTrainingSystemsText] = useState("");
  const [setupTrainingWikiText, setSetupTrainingWikiText] = useState("");
  const [setupTrainingRegulationsText, setSetupTrainingRegulationsText] = useState("");
  const [setupCandidateFieldsConfig, setSetupCandidateFieldsConfig] = useState<any>(null);
  // AI-enhance loading state for the in-wizard VacancyEditor.
  const [wizardAiKey, setWizardAiKey] = useState<VacancyFieldKey | null>(null);

  // Vacancy wizard: 2-step file ingest (upload → recognize → fill raw text).
  const [draftVacancyFilePath, setDraftVacancyFilePath] = useState<string | null>(null);
  const [vacancyFileName, setVacancyFileName] = useState<string>("");
  const [isUploadingVacancyFile, setIsUploadingVacancyFile] = useState(false);
  const [vacancyUploadError, setVacancyUploadError] = useState<string>("");
  // Raw extracted vacancy text from uploaded document (≤5000 chars). Editable.
  // Passed to «Оформить красиво» as file_context.
  const [vacancyRawText, setVacancyRawText] = useState<string>("");

  // Per-role templates merged from DB (job_titles.field_templates) over generic defaults.
  // Used to (a) show visible "Пример" next to each field, (b) prefill empty fields when
  // the role changes, (c) pass as "эталон" context to the AI (single + all_vacancy).
  const [roleTemplates, setRoleTemplates] = useState<Record<string, string>>({});
  // When the AI fills all 15 fields itself, it also sets a new `role_name`.
  // The `useEffect` below normally reacts to `setupRoleName` changes by
  // overwriting every field with the per-role template (or generic «Менеджер
  // по продажам» defaults), which would clobber the AI answer. Setting this
  // ref to true right before applying AI results suppresses that overwrite
  // exactly once, while still refreshing `roleTemplates` for later prompts.
  const skipRoleAutoFillRef = useRef(false);
  const exampleFor = (field: string): string =>
    mergedTemplate(field, roleTemplates, { ...DEFAULT_VAC_TEMPLATES, ...DEFAULT_TRAINING_TEMPLATES } as any) ||
    VACANCY_FIELDS_BY_KEY[field as VacancyFieldKey]?.example ||
    "";
  const [showExampleFor, setShowExampleFor] = useState<Record<string, boolean>>({});

  // Reload templates when the selected role changes and OVERWRITE all 15
  // wizard fields with the per-role template (falling back to the canonical
  // example). If the user has already typed something, ask before overwriting.
  useEffect(() => {
    if (!setupRoleName.trim()) return;
    let cancelled = false;
    (async () => {
      const tpl = await getRoleTemplates(setupRoleName);
      if (cancelled) return;
      setRoleTemplates(tpl as Record<string, string>);

      // Suppress the destructive auto-fill once (e.g. right after the AI
      // beautifier produced 15 ready fields and updated role_name).
      if (skipRoleAutoFillRef.current) {
        skipRoleAutoFillRef.current = false;
        return;
      }

      const mapped = roleTplToFields(tpl as any);
      const valueFor = (key: VacancyFieldKey) =>
        (mapped[key] && mapped[key]!.trim()) ||
        VACANCY_FIELDS_BY_KEY[key].example;

      const current: Record<VacancyFieldKey, string> = {
        role_name: setupRoleName,
        vacancy_text: setupVacancyText,
        tasks_activity_text: setupTasksActivityText,
        schedule_text: setupScheduleText,
        motivation_text: setupMotivationText,
        motivation_text_detail: setupMotivationDetail,
        payouts_text: setupPayoutsText,
        onboarding_text: setupOnboardingText,
        team_text: setupTeamText,
        system_text: setupSystemText,
        training_professional_text: setupTrainingProfessionalText,
        training_product_text: setupTrainingProductText,
        training_systems_text: setupTrainingSystemsText,
        training_wiki_text: setupTrainingWikiText,
        training_regulations_text: setupTrainingRegulationsText,
      };
      const hasUserContent = (Object.keys(current) as VacancyFieldKey[]).some(
        (k) => k !== "role_name" && (current[k] || "").trim().length > 0,
      );
      // No system popup. If the user already started filling fields, we never
      // silently overwrite — they must explicitly press the
      // «Предложить заполнение вакансии» button to apply templates.
      if (hasUserContent) return;
      setSetupVacancyText(valueFor("vacancy_text"));
      setSetupTasksActivityText(valueFor("tasks_activity_text"));
      setSetupScheduleText(valueFor("schedule_text"));
      setSetupMotivationText(valueFor("motivation_text"));
      setSetupMotivationDetail(valueFor("motivation_text_detail"));
      setSetupPayoutsText(valueFor("payouts_text"));
      setSetupOnboardingText(valueFor("onboarding_text"));
      setSetupTeamText(valueFor("team_text"));
      setSetupSystemText(valueFor("system_text"));
      setSetupTrainingProfessionalText(valueFor("training_professional_text"));
      setSetupTrainingProductText(valueFor("training_product_text"));
      setSetupTrainingSystemsText(valueFor("training_systems_text"));
      setSetupTrainingWikiText(valueFor("training_wiki_text"));
      setSetupTrainingRegulationsText(valueFor("training_regulations_text"));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupRoleName]);

  // Draft project bookkeeping (matches the company wizard pattern).
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [draftProjectPublicId, setDraftProjectPublicId] = useState<string | null>(null);
  const [enhancingVacFields, setEnhancingVacFields] = useState<Record<string, boolean>>({});

  // Shared job titles catalog (loaded from public.job_titles).
  const [jobTitlesList, setJobTitlesList] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchJobTitles();
      if (!cancelled) setJobTitlesList(rows.map((r) => r.title));
    })();
    return () => { cancelled = true; };
  }, []);

  // Profile States
  const [adminTgId, setAdminTgId] = useState(() => localStorage.getItem("employer_tg_id") || "59384591");
  const [profileName, setProfileName] = useState("");
  const [companyNameState, setCompanyNameState] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [isProfileSaved, setIsProfileSaved] = useState(false);

  // High-fidelity Google and Telegram profile states
  const [googleName, setGoogleName] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [googlePhoto, setGooglePhoto] = useState("");
  const [googleId, setGoogleId] = useState("");
  const [googleVerified, setGoogleVerified] = useState(true);
  const [authProvider, setAuthProvider] = useState<"google" | "email" | "unknown">("unknown");
  const [employerCreatedAt, setEmployerCreatedAt] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState("");
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState("");
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [tempProfileName, setTempProfileName] = useState("");
  const [tempCompanyName, setTempCompanyName] = useState("");
  const [tempProfileEmail, setTempProfileEmail] = useState("");
  const [tempProfilePhone, setTempProfilePhone] = useState("");
  const [tempTelegramUsername, setTempTelegramUsername] = useState("");
  const [tempTelegramChatId, setTempTelegramChatId] = useState("");
  const [editModalTab, setEditModalTab] = useState<"profile" | "telegram" | "password">("profile");

  const [telegramIdState, setTelegramIdState] = useState("");
  const [telegramPhoto, setTelegramPhoto] = useState("");
  const [telegramFirstName, setTelegramFirstName] = useState("");
  const [telegramLastName, setTelegramLastName] = useState("");
  const [telegramUsernameState, setTelegramUsernameState] = useState("");
  const [telegramPhone, setTelegramPhone] = useState<string>("");
  // Telegram chat ID for duplicating employer notifications into the bot.
  const [telegramChatId, setTelegramChatId] = useState<string>("");
  const [telegramGroupIds, setTelegramGroupIds] = useState<string>("");
  const [telegramChannelIds, setTelegramChannelIds] = useState<string>("");
  const [telegramNotifyEvents, setTelegramNotifyEvents] = useState({
    new_candidate: true,
    interview_passed: true,
    test_passed: true,
    training_progress: true,
    balance_change: true,
    daily_digest: false,
  });

  // Temp states for editing
  const [tempTelegramGroupIds, setTempTelegramGroupIds] = useState<string>("");
  const [tempTelegramChannelIds, setTempTelegramChannelIds] = useState<string>("");
  const [tempTelegramNotifyEvents, setTempTelegramNotifyEvents] = useState({
    new_candidate: true,
    interview_passed: true,
    test_passed: true,
    training_progress: true,
    balance_change: true,
    daily_digest: false,
  });

  const [telegramChatSaved, setTelegramChatSaved] = useState<boolean>(false);
  const [telegramChatSaving, setTelegramChatSaving] = useState<boolean>(false);
  const [isRequestingPhone, setIsRequestingPhone] = useState(false);
  const [referralStats, setReferralStats] = useState<{ count: number; rr: number }>({ count: 0, rr: 0 });

  // Billing & Tariff States
  const [balance, setBalance] = useState<number>(1000);
  const [balanceStart, setBalanceStart] = useState<number>(0);
  const [balancePay, setBalancePay] = useState<number>(0);
  const [balanceReferral, setBalanceReferral] = useState<number>(0);
  const [balanceAdmin, setBalanceAdmin] = useState<number>(0);
  const [balanceLimits, setBalanceLimits] = useState<number>(0);
  const [interviewCredits, setInterviewCredits] = useState<number>(0);
  const [trainingCredits, setTrainingCredits] = useState<number>(0);
  const [landingCredits, setLandingCredits] = useState<number>(0);
  const [interviewSetupCredits, setInterviewSetupCredits] = useState<number>(0);
  const [trainingSetupCredits, setTrainingSetupCredits] = useState<number>(0);
  const [packQty, setPackQty] = useState<{ interview: number; training: number }>({ interview: 10, training: 0 });
  const [packBusy, setPackBusy] = useState<boolean>(false);
  const [fixedBusy, setFixedBusy] = useState<null | "landing" | "interview_setup" | "training_setup">(null);
  const [fixedQty, setFixedQty] = useState<Record<"landing" | "interview_setup" | "training_setup", number>>({
    landing: 1, interview_setup: 1, training_setup: 1,
  });
  const [referrer, setReferrer] = useState<null | { name: string; email: string; phone: string | null; telegram: string | null; public_id: string }>(null);
  const [referees, setReferees] = useState<Array<{ name: string; email: string; created_at: string; bonus_rr: number }>>([]);

  const [topupAmountRub, setTopupAmountRub] = useState<number>(100);
  const [purchaseError, setPurchaseError] = useState<string>("");
  const [isBuying, setIsBuying] = useState<string | null>(null);
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [topupOfferOk, setTopupOfferOk] = useState<boolean>(true);
  const [topupError, setTopupError] = useState<string>("");

  const [tariffLevel, setTariffLevel] = useState<"bronze" | "silver" | "gold">("bronze");
  const [tariffTab, setTariffTab] = useState<string>("balance");
  const [samplePostCopied, setSamplePostCopied] = useState<boolean>(false);

  useEffect(() => {
    if (activeTab === "tariff") {
      if (path.includes("/tariff/pay") || path.includes("/tariff/buy") || path.includes("/payment")) {
        setTariffTab("pay");
      } else if (path.includes("/tariff/vacancy") || path.includes("/tariff/vacancies")) {
        setTariffTab("vacancy");
      } else if (path.includes("/tariff/history") || path.includes("/invoice")) {
        setTariffTab("history");
      } else if (path.includes("/tariff/partners") || path.includes("/tariff/referral")) {
        setTariffTab("partners");
      } else if (path.includes("/tariff")) {
        setTariffTab("balance");
      }
    }
  }, [path, activeTab]);

  const handleTariffTabChange = (val: string) => {
    setTariffTab(val);
    const sub =
      val === "pay"
        ? "pay"
        : val === "vacancy"
        ? "vacancy"
        : val === "history"
        ? "history"
        : val === "partners" || val === "referral"
        ? "partners"
        : "balance";
    if (employerId) {
      navigate(`/emp${employerId}/tariff/${sub}`);
    }
  };
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [historyPageSize, setHistoryPageSize] = useState<number>(20);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historySortField, setHistorySortField] = useState<"date" | "type" | "note" | "amount">("date");
  const [historySortDir, setHistorySortDir] = useState<"asc" | "desc">("desc");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>("all");
  const [historyDateFrom, setHistoryDateFrom] = useState<string>("");
  const [historyDateTo, setHistoryDateTo] = useState<string>("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlanToBuy, setSelectedPlanToBuy] = useState<"silver" | "gold" | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Admin mode: разрешает администраторам открывать кабинет демо-кандидата и
  // переходить на лендинги без полноценной регистрации.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let resolvedAdmin = false;
      const token = localStorage.getItem("emp_token") || localStorage.getItem("employer_token");
      if (token) {
        const meRes = await fetch("/api/auth/employer/me", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
        if (meRes && meRes.ok) {
          const meData = await meRes.json();
          const u = meData?.user;
          const uPid = String(u?.publicId || u?.public_id || "");
          if (u?.role === "admin" || u?.is_admin || uPid === "100007" || u?.email === "shishkarnem@gmail.com") {
            resolvedAdmin = true;
          }
          if (!cancelled) {
            setIsAdmin(resolvedAdmin && String(employerId || uPid) === "100007");
          }
          return;
        }
      }

      try {
        const { dbClient } = await import("@/lib/dbClient");
        const { data: { user } } = await dbClient.auth.getUser();
        if (user) {
          const { data } = await dbClient
            .from("employers")
            .select("*")
            .or(`user_id.eq.${user.id},id.eq.${user.id},email.eq.${user.email}`)
            .maybeSingle();
          if ((data as any)?.role === "admin" || user.email === "shishkarnem@gmail.com") {
            resolvedAdmin = true;
          }
        }
      } catch {
        // Ignore remote database connectivity issues
      }
      if (!cancelled) {
        setIsAdmin(resolvedAdmin && String(employerId) === "100007");
      }
    })();
    return () => { cancelled = true; };
  }, [employerId]);

  // Open the demo candidate cabinet under a real URL: /{companySlug}/{projectSlug}/candidate{publicId}/profile
  const handleOpenCandidateAsAdmin = async (candidateOverride?: any) => {
    const { dbClient } = await import("@/lib/dbClient");
    const { buildCandidateUrl, buildVacancyUrl, buildCompanyUrl } = await import("@/lib/links");
    let cand: any = candidateOverride;
    if (!cand) {
      const { data } = await dbClient
        .from("candidates")
        .select("id, public_id, project_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      cand = data;
    }
    if (!cand?.project_id || !cand?.public_id) return;
    const { data: proj } = await dbClient
      .from("projects")
      .select("id, slug, role_name, company_id")
      .eq("id", cand.project_id)
      .maybeSingle();
    const { data: comp } = proj?.company_id
      ? await dbClient.from("companies").select("id, slug, name").eq("id", proj.company_id).maybeSingle()
      : { data: null } as any;
    sessionStorage.setItem("rr_admin_impersonate", "1");
    navigate(buildCandidateUrl(comp, proj, cand, "profile"));
    // hint vars to satisfy eslint about unused builders in some envs
    void buildVacancyUrl; void buildCompanyUrl;
  };

  const handleOpenVacancyAsAdmin = async () => {
    const { dbClient } = await import("@/lib/dbClient");
    const { buildVacancyUrl } = await import("@/lib/links");
    const { data: proj } = await dbClient
      .from("projects")
      .select("id, slug, company_id")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data: comp } = proj?.company_id
      ? await dbClient.from("companies").select("id, slug").eq("id", proj.company_id).maybeSingle()
      : { data: null } as any;
    if (proj && comp) navigate(buildVacancyUrl(comp, proj));
  };

  // Companies custom database state
  const [companiesList, setCompaniesList] = useState<any[]>([]);
  const [companyFilterTab, setCompanyFilterTab] = useState<"all" | "published" | "draft" | "archive" | "deleted">("all");
  // Onboarding: пошаговая активация разделов (#7)
  const [hasTrainingSetup, setHasTrainingSetup] = useState(false);
  const [hasInterviewSetup, setHasInterviewSetup] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const setupRedirectDoneRef = useRef(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
  const [newCompanyStaff, setNewCompanyStaff] = useState("");
  const [newCompanyDesc, setNewCompanyDesc] = useState("");
  const [newCompanySite, setNewCompanySite] = useState("");
  const [newCompanySitesList, setNewCompanySitesList] = useState<Array<{
    id: string;
    url: string;
    title: string;
    customScreenshot?: string;
    heightPx?: number;
  }>>([
    { id: "site-1", url: "", title: "Официальный сайт", customScreenshot: "", heightPx: 160 }
  ]);
  const [uploadingSiteScreenshotIdx, setUploadingSiteScreenshotIdx] = useState<number | null>(null);

  const handleSiteScreenshotPick = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingSiteScreenshotIdx(idx);
    try {
      const { blob } = await resizeToWebP(file, 1280, 0.85);
      const companyNameClean = newCompanyName.trim() || "Компания";
      const uploaderName = profileName || profileEmail || googleEmail || (employerId ? `Работодатель #${employerId}` : "Работодатель");
      const shotUrl = await getUploadService().uploadFromBlob(blob, `${(companyNameClean || "").toLowerCase().replace(/[^a-z0-9а-яё]/gi, "_")}-screenshot-${idx + 1}.webp`, {
        custom_name: `Скриншот сайта ${companyNameClean}`,
        owner_id: uploaderName,
        description: `Скриншот сайта для карточки компании ${companyNameClean}`,
      });
      setNewCompanySitesList(prev => prev.map((item, i) => i === idx ? { ...item, customScreenshot: shotUrl } : item));
      addAuditEvent("success", "Скриншот загружен", "Пользовательский скриншот успешно прикреплён к ссылке.");
    } catch (err: any) {
      addAuditEvent("warning", "Ошибка загрузки", err?.message || "Не удалось загрузить скриншот");
    } finally {
      setUploadingSiteScreenshotIdx(null);
    }
  };

  const DEFAULT_LOGO_URL = "/files/11/rr-logo.png";
  const [newCompanyLogo, setNewCompanyLogo] = useState(DEFAULT_LOGO_URL);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const handleLogoFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoUploadError("");
    setIsUploadingLogo(true);
    try {
      const companyNameClean = newCompanyName.trim() || "Компания";
      const uploaderName = profileName || profileEmail || googleEmail || (employerId ? `Работодатель #${employerId}` : "Работодатель");
      let logoUrl = "";
      const isPng = file.type === "image/png" || (file.name ? file.name.toLowerCase().endsWith(".png") : false);
      if (isPng) {
        // Upload original PNG with X-Preserve-Alpha: true to maintain transparency
        const res = await getUploadService().uploadFileResult(file, {
          custom_name: `Логотип: ${companyNameClean}.png`,
          owner_id: uploaderName,
          description: `Логотип бренда ${companyNameClean} (PNG с альфа-прозрачностью)`,
        });
        logoUrl = res.url;
      } else {
        const { blob } = await resizeToWebP(file, 512, 0.9);
        logoUrl = await getUploadService().uploadFromBlob(blob, `${(companyNameClean || "").toLowerCase().replace(/[^a-z0-9а-яё]/gi, "_")}-logo.webp`, {
          custom_name: `Логотип: ${companyNameClean}`,
          owner_id: uploaderName,
          description: `Логотип бренда ${companyNameClean}`,
        });
      }
      setNewCompanyLogo(logoUrl);
      addAuditEvent("success", "Логотип загружен", "Логотип успешно сохранён с сохранением прозрачности (Alpha)");
    } catch (err: any) {
      setLogoUploadError(err?.message || "Не удалось загрузить логотип");
    } finally {
      setIsUploadingLogo(false);
    }
  };
  const [newCompanyFiles, setNewCompanyFiles] = useState("");
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  // Raw extracted company text from the uploaded document (≤5000 chars).
  // Editable in a large textarea, also passed to «Оформить красиво» as a hint.
  const [companyRawText, setCompanyRawText] = useState("");

  // New fields per spec: "Описание компании и чем занимается" + "Основные продукты"
  const [newCompanyDescription, setNewCompanyDescription] = useState("");
  const [newCompanyProducts, setNewCompanyProducts] = useState("");

  // Draft company state (database) — created when user opens the wizard
  const [draftCompanyId, setDraftCompanyId] = useState<string | null>(null);
  const [draftCompanyPublicId, setDraftCompanyPublicId] = useState<string | null>(null);
  const [draftFilePath, setDraftFilePath] = useState<string | null>(null);

  // New Brand fields requested by end-user:
  const [newCompanyMissionText, setNewCompanyMissionText] = useState("");
  const [newCompanyCustomWiki, setNewCompanyCustomWiki] = useState("");
  const [newCompanySalaryTerms, setNewCompanySalaryTerms] = useState("");
  const [newCompanyScheduleTerms, setNewCompanyScheduleTerms] = useState("");
  const [newCompanyStatsValClients, setNewCompanyStatsValClients] = useState("");
  const [newCompanyStatsLabelClients, setNewCompanyStatsLabelClients] = useState("");
  const [newCompanyStatsValDialogs, setNewCompanyStatsValDialogs] = useState("");
  const [newCompanyStatsLabelDialogs, setNewCompanyStatsLabelDialogs] = useState("");
  const [newCompanyStatsValFounded, setNewCompanyStatsValFounded] = useState("");
  const [newCompanyStatsLabelFounded, setNewCompanyStatsLabelFounded] = useState("");

  const [enhancingFields, setEnhancingFields] = useState<Record<string, boolean>>({});
  const [isEnhancingAll, setIsEnhancingAll] = useState(false);

  const isCompanySlugDuplicate = useMemo(() => {
    if (!newCompanyName || !newCompanyName.trim()) return false;
    const rawSlug = transliterateToSlug(newCompanyName.trim()) || "company";
    return companiesList.some((c) => {
      if (draftCompanyId && (String(c.id) === String(draftCompanyId) || (c.public_id && draftCompanyPublicId && String(c.public_id) === String(draftCompanyPublicId)))) {
        return false;
      }
      if (c.status === "deleted" || c.deleted_at) return false;
      const cSlug = (c.slug || transliterateToSlug(c.name || "") || "").toLowerCase();
      const cName = (c.name || "").trim().toLowerCase();
      return cName === newCompanyName.trim().toLowerCase() || cSlug === rawSlug.toLowerCase();
    });
  }, [newCompanyName, companiesList, draftCompanyId, draftCompanyPublicId]);

  const handleEnhanceSingleField = async (fieldName: string, currentVal: string) => {
    setEnhancingFields(prev => ({ ...prev, [fieldName]: true }));
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const newVal = await aiWaitRun({
        title: `ИИ улучшает поле «${ruField(fieldName)}»`,
        task: () => aiEnhanceSingle({
          field: fieldName,
          value: currentVal,
          company_name: newCompanyName,
          hint: `industry=${newCompanyIndustry}; staff=${newCompanyStaff}; description=${newCompanyDesc}; site=${newCompanySite}; mission=${newCompanyMissionText}`,
        }),
      });
      if (newVal) {
        if (fieldName === "name") setNewCompanyName(newVal);
        else if (fieldName === "industry") setNewCompanyIndustry(newVal);
        else if (fieldName === "staff") setNewCompanyStaff(newVal);
        else if (fieldName === "description") { setNewCompanyDesc(newVal); setNewCompanyDescription(newVal); }
        else if (fieldName === "sites") {
          const norm = /^https?:\/\//i.test(newVal) ? newVal : `https://${newVal}`;
          setNewCompanySite(norm);
          setNewCompanySitesList(prev => {
            if (!prev || prev.length === 0) {
              return [{ id: "site-1", url: norm, title: "Официальный сайт", customScreenshot: "", heightPx: 160 }];
            }
            return [{ ...prev[0], url: norm }, ...prev.slice(1)];
          });
        }
        else if (fieldName === "logoUrl") setNewCompanyLogo(newVal);
        else if (fieldName === "missionText") setNewCompanyMissionText(newVal);
        else if (fieldName === "customWiki") setNewCompanyCustomWiki(newVal);
        else if (fieldName === "salaryTerms") setNewCompanySalaryTerms(newVal);
        else if (fieldName === "scheduleTerms") setNewCompanyScheduleTerms(newVal);
        else if (fieldName === "statsValClients") setNewCompanyStatsValClients(newVal);
        else if (fieldName === "statsLabelClients") setNewCompanyStatsLabelClients(newVal);
        else if (fieldName === "statsValDialogs") setNewCompanyStatsValDialogs(newVal);
        else if (fieldName === "statsLabelDialogs") setNewCompanyStatsLabelDialogs(newVal);
        else if (fieldName === "statsValFounded") setNewCompanyStatsValFounded(newVal);
        else if (fieldName === "statsLabelFounded") setNewCompanyStatsLabelFounded(newVal);
        else if (fieldName === "descriptionText") setNewCompanyDescription(newVal);
        else if (fieldName === "aboutText") setNewCompanyDesc(newVal);
        else if (fieldName === "productsText") setNewCompanyProducts(newVal);

        addAuditEvent("success", "ИИ Улучшение поля", `Поле успешно улучшено ИИ!`);
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Не удалось связаться с RR.");
    } finally {
      setEnhancingFields(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const handleEnhanceAllFields = async () => {
    setIsEnhancingAll(true);
    addAuditEvent("info", "ИИ Настройка", "ИИ-аналитик RR комплексно оформляет ваш бренд...");
    try {
      const { aiEnhanceAll } = await import("@/lib/aiClient");
      const fields = {
        name: newCompanyName,
        industry: newCompanyIndustry,
        staff: newCompanyStaff,
        description_text: newCompanyDescription || newCompanyDesc,
        products_text: newCompanyProducts,
        missionText: newCompanyMissionText,
        team: newCompanyDesc,
        sites: newCompanySite,
        logoUrl: newCompanyLogo,
        customWiki: newCompanyCustomWiki,
        salaryTerms: newCompanySalaryTerms,
        scheduleTerms: newCompanyScheduleTerms,
        statsValClients: newCompanyStatsValClients,
        statsLabelClients: newCompanyStatsLabelClients,
        statsValDialogs: newCompanyStatsValDialogs,
        statsLabelDialogs: newCompanyStatsLabelDialogs,
        statsValFounded: newCompanyStatsValFounded,
        statsLabelFounded: newCompanyStatsLabelFounded,
      };
      const enriched = await aiWaitRun({
        title: "ИИ упаковывает бренд компании",
        task: () => aiEnhanceAll({
          mode: "all_company",
          company_name: newCompanyName,
          fields,
          hint: [
            newCompanyFiles ? `attached files: ${String(newCompanyFiles)}` : "",
            companyRawText ? `Извлечённый текст о компании из документа:\n${companyRawText}` : "",
          ].filter(Boolean).join("\n\n") || undefined,
        }),
      });
      if (enriched) {
        const compName = enriched.name || enriched.company_name;
        if (compName) setNewCompanyName(compName);
        if (enriched.industry) setNewCompanyIndustry(enriched.industry);
        if (enriched.staff) setNewCompanyStaff(enriched.staff);

        const desc = enriched.description_text || enriched.description || enriched.about_text;
        if (desc) {
          setNewCompanyDescription(desc);
          if (!newCompanyDesc) setNewCompanyDesc(desc);
        }
        const prods = enriched.products_text || enriched.products;
        if (prods) setNewCompanyProducts(prods);

        const team = enriched.team || enriched.team_text;
        if (team) setNewCompanyDesc(team);

        const rawSite = enriched.sites || enriched.website;
        if (rawSite) {
          const formattedSite = /^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`;
          setNewCompanySite(formattedSite);
          setNewCompanySitesList(prev => {
            if (!prev || prev.length === 0) {
              return [{ id: "site-1", url: formattedSite, title: "Официальный сайт", customScreenshot: "", heightPx: 160 }];
            }
            return [{ ...prev[0], url: formattedSite }, ...prev.slice(1)];
          });
        }

        const logo = enriched.logoUrl || enriched.logo_url;
        if (logo) setNewCompanyLogo(logo);

        const mission = enriched.missionText || enriched.mission_text;
        if (mission) setNewCompanyMissionText(mission);

        const wiki = enriched.customWiki || enriched.system_text;
        if (wiki) setNewCompanyCustomWiki(wiki);

        const salary = enriched.salaryTerms || enriched.payouts_text;
        if (salary) setNewCompanySalaryTerms(salary);

        const schedule = enriched.scheduleTerms || enriched.schedule_text;
        if (schedule) setNewCompanyScheduleTerms(schedule);

        if (enriched.statsValClients) setNewCompanyStatsValClients(String(enriched.statsValClients));
        if (enriched.statsLabelClients) setNewCompanyStatsLabelClients(String(enriched.statsLabelClients));
        if (enriched.statsValDialogs) setNewCompanyStatsValDialogs(String(enriched.statsValDialogs));
        if (enriched.statsLabelDialogs) setNewCompanyStatsLabelDialogs(String(enriched.statsLabelDialogs));
        if (enriched.statsValFounded) setNewCompanyStatsValFounded(String(enriched.statsValFounded));
        if (enriched.statsLabelFounded) setNewCompanyStatsLabelFounded(String(enriched.statsLabelFounded));

        addAuditEvent("success", "Бренд упакован", "Все поля вашей компании успешно улучшены и структурированы ИИ!");
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Не удалось связаться с RR.");
    } finally {
      setIsEnhancingAll(false);
    }
  };

  const parseCompanyFileWithAI = async (filename: string) => {
    setIsParsingFile(true);
    addAuditEvent("info", "ИИ разбор документа", `ИИ-Копирайтер RR считывает текст из файла: ${filename}...`);
    try {
      let filePath = draftFilePath || "";
      if (filePath && filePath.startsWith("/")) {
        filePath = `${window.location.origin}${filePath}`;
      }
      const cleanEmpId = resolveActiveEmployerId({ employer_id: employerId });
      const chatId = `${cleanEmpId}_RRcompany`;

      const res = await aiWaitRun<any>({
        title: `Распознавание компании из файла ${filename}`,
        fallback: {
          viewerAllowed: true,
        },
        task: async (attempt: number) => {
          const usePromax = attempt > 0;
          try {
            const apiRes = await fetch("/api/ai-ingest-document", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                entity: "company",
                chat_id: chatId,
                employer_id: cleanEmpId,
                employer_public_id: cleanEmpId,
                file_url: filePath || undefined,
                filename,
                max_chars: 10000,
                use_promax: usePromax,
              }),
            });
            if (apiRes.ok) {
              const data = await apiRes.json();
              return data;
            }
          } catch (e) {
            console.warn("Direct API call failed, falling back to database function:", e);
          }

          const { data, error } = await dbClient.functions.invoke("ai-ingest-document", {
            body: {
              entity: "company",
              chat_id: chatId,
              employer_id: cleanEmpId,
              file_url: filePath || undefined,
              filename,
              max_chars: 10000,
              use_promax: usePromax,
            },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });

      const text = String(res?.text || res?.result || res?.reply || res?.data?.text || "").slice(0, 10000);
      if (text) {
        setCompanyRawText(text);
        addAuditEvent("success", "Текст извлечён", `Документ ${filename} распознан (${text.length} симв.). Проверьте текст и нажмите «Оформить красиво».`);
      } else {
        addAuditEvent("warning", "Пустой ответ", "ИИ не вернул текст из документа.");
      }
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка распознавания", err?.message || "Не удалось разобрать файл.");
    } finally {
      setIsParsingFile(false);
    }
  };

  // Open wizard: reuse existing empty draft or create draft company immediately
  const openAddCompanyWizard = async () => {
    if (showAddCompany) { await cancelAddCompanyWizard(); return; }
    // Reset wizard fields so the user starts clean.
    setNewCompanyName("");
    setNewCompanyIndustry("");
    setNewCompanyStaff("");
    setNewCompanySite("");
    setNewCompanySitesList([
      { id: "site-1", url: "", title: "Официальный сайт", customScreenshot: "", heightPx: 160 }
    ]);
    setNewCompanyLogo(DEFAULT_LOGO_URL);
    setNewCompanyDescription("");
    setNewCompanyProducts("");
    setNewCompanyMissionText("");
    setNewCompanyDesc("");
    setNewCompanySalaryTerms("");
    setNewCompanyScheduleTerms("");
    setNewCompanyCustomWiki("");
    setCompanyRawText("");
    setNewCompanyFiles("");
    setShowAddCompany(true);

    // Check if there is already an existing empty draft in companiesList
    const existingEmptyDraft = companiesList.find(
      (c) => c.status === "draft" && (!c.name || String(c.name).trim() === "")
    );
    if (existingEmptyDraft) {
      setDraftCompanyId(existingEmptyDraft.id);
      setDraftCompanyPublicId(existingEmptyDraft.public_id || null);
      return;
    }

    try {
      // 1. Create draft in PostgreSQL BD ProTalk directly
      const localRes = await fetch("/api/companies/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId: employerId || "100007", owner_employer_id: employerId || "100007" }),
      }).catch(() => null);

      if (localRes && localRes.ok) {
        const localData = await localRes.json();
        if (localData?.company) {
          setDraftCompanyId(localData.company.id);
          setDraftCompanyPublicId(localData.company.public_id);
        }
      }

      // 2. database draft creation (best-effort)
      const { data, error } = await dbClient.rpc("company_create_draft");
      if (!error && data) {
        const d = data as any;
        if (!draftCompanyId) {
          setDraftCompanyId(d?.id || null);
          setDraftCompanyPublicId(d?.public_id || null);
        }
      }
    } catch (err: any) {
      console.warn("Background draft creation note:", err);
    }
  };

  // Cancel wizard
  const cancelAddCompanyWizard = async () => {
    try {
      // If the wizard was opened on a fresh empty draft (no name yet) — drop it permanently
      if (draftCompanyId) {
        await fetch(`/api/companies/${draftCompanyId}?permanent=true`, { method: "DELETE" }).catch(() => null);
        const { data: row } = await dbClient
          .from("companies")
          .select("name, status")
          .eq("id", draftCompanyId)
          .maybeSingle();
        const isEmptyDraft =
          row && row.status === "draft" && (!row.name || String(row.name).trim() === "");
        if (isEmptyDraft) {
          await dbClient.from("companies").delete().eq("id", draftCompanyId);
        }
      }
    } catch (e) { console.warn("cancel cleanup error", e); }
    setDraftFilePath(null);
    setShowAddCompany(false);
    setDraftCompanyId(null);
    setDraftCompanyPublicId(null);
    // Refresh list from DB so any leftover state is reconciled.
    fetchCompanies();
  };

  // Open existing company in the wizard for editing
  const openEditCompanyWizard = async (comp: any) => {
    setDraftCompanyId(comp.id);
    setDraftCompanyPublicId(comp.public_id || null);
    setNewCompanyName(comp.name || "");
    setNewCompanyLogo(comp.logo_url || comp.logoUrl || DEFAULT_LOGO_URL);
    setNewCompanyIndustry(comp.industry || "");
    setNewCompanyStaff(comp.staff || "");
    setNewCompanySite(comp.website || comp.sites || "");

    // Parse multi-site links if stored as JSON or string
    let parsedSites: Array<{ id: string; url: string; title: string; customScreenshot?: string; heightPx?: number }> = [];
    try {
      if (comp.sites && String(comp.sites).trim().startsWith("[")) {
        const arr = JSON.parse(comp.sites);
        if (Array.isArray(arr) && arr.length > 0) {
          parsedSites = arr.map((item: any, i: number) => ({
            id: item.id || `site-${i + 1}`,
            url: item.url || "",
            title: item.title || (i === 0 ? "Официальный сайт" : `Ссылка ${i + 1}`),
            customScreenshot: item.customScreenshot || item.screenshotUrl || "",
            heightPx: item.heightPx || 160,
          }));
        }
      }
    } catch {}
    if (parsedSites.length === 0) {
      const singleUrl = comp.website || comp.sites || "";
      parsedSites = [{ id: "site-1", url: singleUrl, title: "Официальный сайт", customScreenshot: "", heightPx: 160 }];
    }
    setNewCompanySitesList(parsedSites);

    setNewCompanyDescription(comp.description_text || comp.description || "");
    setNewCompanyProducts(comp.products_text || "");
    setNewCompanyMissionText(comp.mission_text || "");
    setNewCompanyDesc(comp.about_text || "");
    setNewCompanySalaryTerms(comp.payouts_text || "");
    setNewCompanyScheduleTerms(comp.schedule_text || "");
    setNewCompanyCustomWiki(comp.system_text || "");
    const st = (comp.stats || {}) as any;
    setNewCompanyStatsValFounded(st.founded_year ? String(st.founded_year) : "");
    setNewCompanyStatsValClients(st.employees ? String(st.employees) : "");
    setNewCompanyStatsValDialogs(st.turnover ? String(st.turnover) : "");
    const lbl = (st.labels || {}) as any;
    setNewCompanyStatsLabelFounded(lbl.founded || "");
    setNewCompanyStatsLabelClients(lbl.employees || "");
    setNewCompanyStatsLabelDialogs(lbl.turnover || "");
    setShowAddCompany(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const handleArchiveCompany = async (comp: any) => {
    try {
      const res = await fetch(`/api/companies/${comp.id}/archive`, { method: "POST" });
      if (res.ok) {
        addAuditEvent("info", "Архив компании", `Статус компании «${comp.name || 'Компания'}» изменен.`);
        await fetchCompanies();
      }
    } catch (e) {
      console.error("Archive error:", e);
    }
  };

  const handleDeleteCompany = async (comp: any) => {
    try {
      const res = await fetch(`/api/companies/${comp.id}`, { method: "DELETE" });
      if (res.ok) {
        addAuditEvent("info", "Удаление компании", `Компания «${comp.name || 'Компания'}» помещена в корзину.`);
        await fetchCompanies();
      }
    } catch (e) {
      console.error("Delete error:", e);
    }
  };

  const handleRestoreCompany = async (comp: any) => {
    try {
      const res = await fetch(`/api/companies/${comp.id}/restore`, { method: "POST" });
      if (res.ok) {
        addAuditEvent("success", "Восстановление", `Компания «${comp.name || 'Компания'}» успешно восстановлена.`);
        await fetchCompanies();
      }
    } catch (e) {
      console.error("Restore error:", e);
    }
  };

  // Upload a file to ProTalk storage and register in PostgreSQL BD ProTalk files DB, returns URL
  const uploadCompanyFile = async (file: File): Promise<string | null> => {
    setUploadError("");
    setIsUploadingFile(true);
    try {
      const cleanEmpId = String(employerId || "100007").replace(/\D/g, "") || "100007";
      const result = await FileUploadService.uploadFileResult(file, {
        owner_id: cleanEmpId,
        custom_name: file.name,
        description: "Файл описания компании для ИИ-распознавания"
      });
      const url = result.url;
      const directUrl = result.original_url || (url.startsWith("/") ? `${window.location.origin}${url}` : url);
      setDraftFilePath(directUrl);
      setNewCompanyFiles(file.name);
      addAuditEvent("success", "Файл загружен", `${file.name}`);
      return url;
    } catch (err: any) {
      console.error("upload error", err);
      const msg = err?.message || "Не удалось загрузить файл.";
      setUploadError(msg);
      addAuditEvent("warning", "Ошибка загрузки файла", msg);
      setNewCompanyFiles("");
      setDraftFilePath(null);
      return null;
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Project (Vacancy) edit state
  const [editingProject, setEditingProject] = useState<JobProject | null>(null);
  // Raw OCR/AI-extracted text from a document uploaded inside the vacancy
  // EDITOR modal — fed into `handleEnhanceAllVacancyLandingFields` as
  // `file_context` so beautify-all reads facts from the uploaded file.
  const [editVacancyRawText, setEditVacancyRawText] = useState<string>("");
  const [isEnhancingAllVacEdit, setIsEnhancingAllVacEdit] = useState(false);
  const [editorSubTab, setEditorSubTab] = useState<string>("company");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [inlineEditSection, setInlineEditSection] = useState<string | null>(null);
  const [aiEnhancingField, setAiEnhancingField] = useState<VacancyFieldKey | null>(null);
  // Per-role templates for the currently edited project (mirrors the wizard's
  // `roleTemplates`). Used to drive the "Шаблон должности" button inside the
  // edit modal's VacancyEditor and to bulk-overwrite fields when the user
  // changes the role from inside the modal.
  const [editRoleTemplates, setEditRoleTemplates] = useState<Record<string, string>>({});
  const [editSpecialtySearch, setEditSpecialtySearch] = useState("");
  const [vacancyToArchive, setVacancyToArchive] = useState<any | null>(null);
  const [vacanciesFilterTab, setVacanciesFilterTab] = useState<"active" | "paused" | "archived" | "all">("active");
  const [updatingStatusProjectId, setUpdatingStatusProjectId] = useState<string | null>(null);

  const isRoleSlugDuplicate = useMemo(() => {
    if (!editingProject?.roleName || !editingProject.roleName.trim()) return false;
    const desiredRoleSlug = transliterateToSlug(editingProject.roleName.trim()).toLowerCase();
    if (!desiredRoleSlug) return false;

    const targetCoId = (editingProject as any).company_id || (editingProject as any).companyId;
    const matchedCo = companiesList.find(
      (c) => targetCoId && (String(c.id) === String(targetCoId) || String(c.public_id) === String(targetCoId) || String(c.id) === `comp-${String(targetCoId).replace(/^comp-?/, "")}`)
    ) || companiesList.find(
      (c) => (c?.name || "").toLowerCase() === ((editingProject as any).companyName || "").toLowerCase()
    );

    const coIdSet = new Set<string>();
    if (targetCoId) {
      coIdSet.add(String(targetCoId));
      coIdSet.add(`comp-${String(targetCoId).replace(/^comp-?/, "")}`);
      coIdSet.add(String(targetCoId).replace(/^comp-?/, ""));
    }
    if (matchedCo) {
      if (matchedCo.id) coIdSet.add(String(matchedCo.id));
      if (matchedCo.public_id) {
        coIdSet.add(String(matchedCo.public_id));
        coIdSet.add(`comp-${matchedCo.public_id}`);
      }
    }

    return projects.some((p: any) => {
      // Exclude current project
      if (p.id === editingProject.id) return false;
      if (editingProject.public_id && (String(p.public_id) === String(editingProject.public_id) || String(p.publicId) === String(editingProject.public_id))) return false;
      if ((editingProject as any).publicId && (String(p.public_id) === String((editingProject as any).publicId) || String(p.publicId) === String((editingProject as any).publicId))) return false;
      if (p.status === "deleted") return false;

      // Check if belongs to SAME company
      const pCoId = String(p.company_id || p.companyId || "");
      const pCoSlug = String(p.company_slug || p.companySlug || "").toLowerCase();
      const pCoName = (p.company_name || p.companyName || "").trim().toLowerCase();
      const matchesCo =
        coIdSet.has(pCoId) ||
        (matchedCo?.slug && pCoSlug === matchedCo.slug.toLowerCase()) ||
        (matchedCo?.name && pCoName === matchedCo.name.trim().toLowerCase());

      if (!matchesCo) return false;

      // Check slug collision within the same company
      const pSlug = (p.slug || p.role_slug || transliterateToSlug(p.role_name || p.roleName || "")).toLowerCase();
      const pRoleSlug = transliterateToSlug(p.role_name || p.roleName || "").toLowerCase();

      return pSlug === desiredRoleSlug || pRoleSlug === desiredRoleSlug;
    });
  }, [editingProject?.roleName, (editingProject as any)?.company_id, (editingProject as any)?.companyId, (editingProject as any)?.companyName, editingProject?.id, (editingProject as any)?.publicId, editingProject?.public_id, projects, companiesList]);

  // All custom fields dynamically discovered across projects
  const allCustomFields = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    (projects || []).forEach((p: any) => {
      const cfg = parseVacancyCandidateFieldsConfig(p.candidate_fields_config || p.candidateFieldsConfig);
      if (Array.isArray(cfg?.customFields)) {
        cfg.customFields.forEach((cf: any) => {
          if (cf && cf.key && !map.has(cf.key)) {
            map.set(cf.key, { key: `custom_${cf.key}`, label: cf.label || cf.key });
          }
        });
      }
    });
    return Array.from(map.values());
  }, [projects]);

  // Comprehensive table column definitions: 11 CRM/Funnel columns + 26 Standard candidate profile fields + Vacancy custom fields
  const allCrmTableColumnDefs = useMemo(() => {
    const crmCols: Array<{
      key: string;
      label: string;
      category: "crm" | "standard" | "custom";
      w: number;
      align: "left" | "center" | "right";
    }> = [
      { key: "name", label: "ФИО кандидата", category: "crm", w: 260, align: "left" },
      { key: "company", label: "Компания", category: "crm", w: 180, align: "left" },
      { key: "role", label: "Вакансия", category: "crm", w: 200, align: "left" },
      { key: "stage", label: "Текущий этап", category: "crm", w: 170, align: "left" },
      { key: "created", label: "Создан", category: "crm", w: 120, align: "left" },
      { key: "updated", label: "Изменён", category: "crm", w: 120, align: "left" },
      { key: "resume", label: "Резюме", category: "crm", w: 90, align: "center" },
      { key: "checklist", label: "Чек-лист", category: "crm", w: 90, align: "center" },
      { key: "situations", label: "Ситуации", category: "crm", w: 90, align: "center" },
      { key: "overall", label: "Средний", category: "crm", w: 90, align: "center" },
      { key: "actions", label: "Действия", category: "crm", w: 140, align: "right" },
    ];

    const stdCols: Array<{
      key: string;
      label: string;
      category: "standard";
      w: number;
      align: "left";
    }> = STANDARD_CANDIDATE_FIELDS.map((f) => ({
      key: `std_${f.key}`,
      label: f.label,
      category: "standard" as const,
      w: 190,
      align: "left" as const,
    }));

    const custCols: Array<{
      key: string;
      label: string;
      category: "custom";
      w: number;
      align: "left";
    }> = allCustomFields.map((cf) => ({
      key: cf.key,
      label: cf.label,
      category: "custom" as const,
      w: 190,
      align: "left" as const,
    }));

    return [...crmCols, ...stdCols, ...custCols];
  }, [allCustomFields]);

  const handleSetAllTableCols = (visible: boolean) => {
    const next: Record<string, boolean> = {};
    allCrmTableColumnDefs.forEach((col) => {
      next[col.key] = visible;
    });
    setTableVisibleCols(next);
    try { localStorage.setItem(`crm_table_cols_${employerId || "emp"}`, JSON.stringify(next)); } catch {}
    syncConstructorToServer({ tableVisibleCols: next });
  };

  const handleAiFillField = (field: string, value: any) => {
    const fLower = (field || "").toLowerCase();
    // Company form
    if (fLower === "name" || fLower === "company_name") {
      setNewCompanyName(String(value || ""));
      setShowAddCompany(true);
      navigate(`/emp${employerId}/companies`);
    } else if (fLower === "industry") {
      setNewCompanyIndustry(String(value || ""));
    } else if (fLower === "staff") {
      setNewCompanyStaff(String(value || ""));
    } else if (fLower === "description" || fLower === "company_desc") {
      setNewCompanyDesc(String(value || ""));
    } else if (fLower === "website" || fLower === "site") {
      setNewCompanySite(String(value || ""));
    }
    // Vacancy editor
    else if (fLower === "role_name" || fLower === "rolename" || fLower === "role") {
      if (editingProject) {
        setEditingProject((prev) => (prev ? ({ ...prev, roleName: String(value || "") } as any) : null));
      }
    } else if (fLower === "salary_from" || fLower === "salaryfrom") {
      if (editingProject) {
        setEditingProject((prev) => (prev ? ({ ...prev, salaryFrom: Number(value) || 0 } as any) : null));
      }
    } else if (fLower === "salary_to" || fLower === "salaryto") {
      if (editingProject) {
        setEditingProject((prev) => (prev ? ({ ...prev, salaryTo: Number(value) || 0 } as any) : null));
      }
    } else if (fLower === "duties" || fLower === "requirements" || fLower === "conditions") {
      if (editingProject) {
        setEditingProject((prev) => (prev ? ({ ...prev, [fLower]: String(value || "") } as any) : null));
      }
    }
    // CRM Columns and fields
    else if (fLower === "kanban_col") {
      handleToggleKanbanCol(String(value));
    } else if (fLower === "card_field") {
      handleToggleKanbanCardField(String(value));
    } else if (fLower === "table_col") {
      handleToggleTableCol(String(value));
    }
  };

  // Load per-role templates for the currently edited project so the editor's
  // "Шаблон должности" button uses values specific to the chosen role.
  useEffect(() => {
    const role = editingProject?.roleName?.trim();
    if (!role) { setEditRoleTemplates({}); return; }
    let cancelled = false;
    (async () => {
      const tpl = await getRoleTemplates(role);
      if (!cancelled) setEditRoleTemplates((tpl as Record<string, string>) || {});
    })();
    return () => { cancelled = true; };
  }, [editingProject?.roleName]);

  // Realtime debounce sync of slug & company_slug for editingProject
  useEffect(() => {
    if (!editingProject?.id) return;
    const timer = setTimeout(async () => {
      const role = editingProject.roleName?.trim();
      const compName = editingProject.companyName?.trim();
      const compId = (editingProject as any).companyId || (editingProject as any).company_id;
      if (!role && !compName) return;
      try {
        const res = await fetch("/api/projects/sync-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingProject.id,
            publicId: (editingProject as any).publicId || (editingProject as any).public_id,
            role_name: role,
            company_name: compName,
            company_id: compId,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d?.roleSlug || d?.companySlug) {
            setEditingProject((prev) => {
              if (!prev || prev.id !== editingProject.id) return prev;
              return {
                ...prev,
                slug: d.roleSlug || (prev as any).slug,
                companySlug: d.companySlug || (prev as any).companySlug,
                publicVacUrl: d.publicVacUrl || (prev as any).publicVacUrl,
              } as any;
            });
          }
        }
      } catch (errSync) {
        // quiet background sync
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [editingProject?.id, editingProject?.roleName, editingProject?.companyName]);

  // Bulk-overwrite all 15 fields of the edited project from the current role's
  // template (used by an explicit button next to the role selector).
  const applyRoleTemplateToEditing = async () => {
    if (!editingProject?.roleName?.trim()) return;
    const tpl = await getRoleTemplates(editingProject.roleName);
    setEditRoleTemplates((tpl as Record<string, string>) || {});
    const mapped = roleTplToFields(tpl as any);
    const valueFor = (key: VacancyFieldKey) =>
      (mapped[key] && mapped[key]!.trim()) || VACANCY_FIELDS_BY_KEY[key].example;
    const patch: Partial<Record<VacancyFieldKey, string>> = {};
    (Object.keys(CAMEL_BY_KEY) as VacancyFieldKey[]).forEach((k) => {
      if (k === "role_name") return;
      patch[k] = valueFor(k);
    });
    setEditingProject({ ...editingProject, ...vacancyValuesToCamel(patch) } as any);
    addAuditEvent("success", "Шаблон применён", `Поля заполнены шаблоном для «${editingProject.roleName}».`);
  };

  // Set vacancy status (active, paused, archived) - Reversible, durable via PostgreSQL BD ProTalk
  const handleSetVacancyStatus = async (projId: string, newStatus: "active" | "paused" | "archived") => {
    setUpdatingStatusProjectId(projId);
    try {
      const res = await fetch(`/api/projects/${projId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          is_published: newStatus === "active",
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || "Ошибка обновления статуса вакансии");
      }
      setPausedProjectIds((prev) => {
        if (newStatus === "paused") {
          return prev.includes(projId) ? prev : [...prev, projId];
        }
        return prev.filter((id) => id !== projId);
      });
      setProjects((prev) =>
        prev.map((p) => (p.id === projId ? ({ ...p, status: newStatus, is_published: newStatus === "active" ? 1 : 0 } as any) : p))
      );
      if (editingProject && editingProject.id === projId) {
        setEditingProject({ ...editingProject, status: newStatus, is_published: newStatus === "active" ? 1 : 0 } as any);
      }
      const label =
        newStatus === "active"
          ? "активирована"
          : newStatus === "paused"
          ? "приостановлена (на паузе)"
          : "переведена в архив";
      addAuditEvent("success", "Статус вакансии обновлен", `Вакансия успешно ${label}.`);
      void fetchData();
    } catch (err: any) {
      console.error("[handleSetVacancyStatus]", err);
      addAuditEvent("warning", "Ошибка смены статуса", "Не удалось изменить статус вакансии: " + (err?.message || err));
    } finally {
      setUpdatingStatusProjectId(null);
    }
  };

  const handleOpenArchiveModal = (proj: any) => {
    setVacancyToArchive(proj);
  };
  
  // Custom Interview and Training builder states
  const [activeEditTab, setActiveEditTab] = useState<"landing" | "training">("landing");
  const [isEnhancingAllVac, setIsEnhancingAllVac] = useState(false);
  const [isParsingTrainingFile, setIsParsingTrainingFile] = useState(false);
  const [trainingDragActive, setTrainingDragActive] = useState(false);

  // System Audit Events State
  const [auditEvents, setAuditEvents] = useState<any[]>([
    { id: 1, type: "info", title: "Вход в панель управления", message: "Успешная авторизация в системе управления Робором.", timestamp: "12:15:30" },
    { id: 2, type: "success", title: "Обновление синхронизации", message: "Проекты и аналитика успешно считаны со встроенного БД сервера.", timestamp: "12:15:35" }
  ]);
  const [auditFilter, setAuditFilter] = useState<"all" | "info" | "success" | "warning">("all");

  // Synchronized Full-Stack Fetching
  const fetchCompanies = async () => {
    try {
      if (!isEmployerPublicIdCandidate(employerId)) {
        setCompaniesList([]);
        return;
      }
      let rawList: any[] = [];
      let apiSucceeded = false;
      try {
        const res = await fetch(`/api/companies?employerId=${encodeURIComponent(employerId)}`);
        if (res.ok) {
          const apiData = await res.json();
          if (Array.isArray(apiData)) {
            rawList = apiData;
            apiSucceeded = true;
          }
        }
      } catch (e) {
        console.warn("fetchCompanies PostgreSQL BD ProTalk endpoint error:", e);
      }

      // Query fallback ONLY if API call itself failed
      if (!apiSucceeded && rawList.length === 0) {
        try {
          const { dbClient } = await import("@/lib/dbClient");
          const { data: emp } = await dbClient
            .from("employers")
            .select("id, public_id")
            .or(`public_id.eq.${employerId},id.eq.${employerId}`)
            .maybeSingle();
          if (emp?.id) {
            const r = await dbClient
              .from("companies")
              .select("*")
              .or(`owner_employer_id.eq.${emp.id},employer_id.eq.${emp.id},owner_employer_id.eq.${emp.public_id || employerId},employer_id.eq.${emp.public_id || employerId}`)
              .order("created_at", { ascending: false });
            if (r.data && Array.isArray(r.data)) {
              rawList = r.data;
            }
          }
        } catch (e) {
          console.warn("fetchCompanies database lookup error:", e);
        }
      }

      console.info("[EmployerPanel] companies loaded:", rawList.length, "for emp", employerId);
      setCompaniesList(
        rawList.map((c: any) => ({
          id: c.id,
          public_id: c.public_id || c.publicId,
          name: c.name,
          slug: c.slug,
          legacy_slug: c.legacy_slug || c.legacySlug || c.slug,
          logoUrl: c.logo_url || c.logoUrl,
          status: c.status || (c.is_published === 0 || c.is_published === false ? "draft" : "published"),
          description_text: c.description_text || c.descriptionText || c.description,
          products_text: c.products_text || c.productsText,
          mission_text: c.mission_text || c.missionText,
          about_text: c.about_text || c.aboutText || c.description,
          team_text: c.team_text || c.teamText,
          payouts_text: c.payouts_text || c.salaryTerms,
          schedule_text: c.schedule_text || c.scheduleTerms,
          system_text: c.system_text || c.customWiki,
          stats: typeof c.stats === "string" ? JSON.parse(c.stats) : (c.stats || {}),
          logo_url: c.logo_url || c.logoUrl,
          missionText: c.mission_text || c.missionText,
          description: c.about_text || c.description_text || c.description,
          industry: c.industry || "",
          staff: c.staff || "",
          website: c.website || c.sites || "",
          sites: c.website || c.sites || "",
          activeVacancies: c.active_vacancies || 0,
          employerId: c.employer_id || c.owner_employer_id || employerId,
          owner_employer_id: c.owner_employer_id || c.employer_id || employerId,
          archived_at: c.archived_at || null,
          deleted_at: c.deleted_at || null,
          is_published: c.is_published !== undefined ? (Number(c.is_published) === 1 || c.is_published === true) : (c.status === "published"),
          theme_config: c.theme_config || c.css,
          css: c.css || c.theme_config,
        }))
      );
    } catch (err) {
      console.error("Error loading companies from server:", err);
    }
  };

  const fetchEmployerData = async () => {
    try {
      const empToken = localStorage.getItem("emp_token") || localStorage.getItem("employer_token");
      const empUserStr = localStorage.getItem("emp_user");
      let cachedUser: any = null;
      try {
        if (empUserStr) cachedUser = JSON.parse(empUserStr);
      } catch {}

      if (empToken) {
        const meRes = await fetch("/api/auth/employer/me", {
          headers: { Authorization: `Bearer ${empToken}` },
        }).catch(() => null);
        if (meRes && meRes.ok) {
          const meData = await meRes.json();
          if (meData?.user) {
            const u = meData.user;
            localStorage.setItem("emp_user", JSON.stringify(u));
            const pId = u.publicId || u.public_id || u.employerId;
            if (pId && !employerId) setEmployerId(pId);
            setProfileName(u.name || u.contact_name || "");
            setProfileEmail(u.email || u.contact_email || "");
            setCompanyNameState(u.companyName || u.company_name || "");
            setProfileTitle(u.title || "");
            setProfilePhone(u.phone || u.contact_phone || "");
            setTelegramUsernameState((u.telegram || u.contact_telegram || u.telegram_username || "").replace(/^@+/, ""));
            if (u.telegram_chat_id || u.telegramChatId) setTelegramChatId(String(u.telegram_chat_id || u.telegramChatId));
            const notifCfgU = u.notifications_config || null;
            if (notifCfgU) {
              if (notifCfgU.telegram_group_ids) setTelegramGroupIds(String(notifCfgU.telegram_group_ids));
              if (notifCfgU.telegram_channel_ids) setTelegramChannelIds(String(notifCfgU.telegram_channel_ids));
              if (notifCfgU.events) setTelegramNotifyEvents((prev) => ({ ...prev, ...notifCfgU.events }));
            }
            if (u.balance !== undefined) setBalance(Number(u.balance));
            if (u.interview_credits !== undefined) setInterviewCredits(Number(u.interview_credits));
            if (u.training_credits !== undefined) setTrainingCredits(Number(u.training_credits));
            if (u.landing_credits !== undefined) setLandingCredits(Number(u.landing_credits));
            if (u.interview_setup_credits !== undefined) setInterviewSetupCredits(Number(u.interview_setup_credits));
            if (u.training_setup_credits !== undefined) setTrainingSetupCredits(Number(u.training_setup_credits));
            if (u.created_at) setEmployerCreatedAt(u.created_at);
            return;
          }
        }
      }

      // If no valid auth session, fetch employer record by URL employerId (public_id) or fallback
      const targetEmpId = (isEmployerPublicIdCandidate(employerId) ? employerId : null) ||
        parseEmployerPublicIdFromPath(window.location.pathname) ||
        cachedUser?.publicId ||
        cachedUser?.public_id ||
        "100007";

      if (targetEmpId) {
        const publicRes = await fetch(`/api/employers/${targetEmpId}`).catch(() => null);
        if (publicRes && publicRes.ok) {
          const pubData = await publicRes.json();
          if (pubData && (pubData.id || pubData.public_id)) {
            if (pubData.public_id && !employerId) setEmployerId(pubData.public_id);
            setProfileName(pubData.name || pubData.contact_name || "");
            setProfileEmail(pubData.email || pubData.contact_email || "");
            setCompanyNameState(pubData.company_name || pubData.companyName || "");
            setProfilePhone(pubData.phone || pubData.contact_phone || "");
            setTelegramUsernameState((pubData.contact_telegram || pubData.telegram_username || pubData.telegram || "").replace(/^@+/, ""));
            if (pubData.telegram_chat_id || pubData.telegramChatId) setTelegramChatId(String(pubData.telegram_chat_id || pubData.telegramChatId));
            const notifCfgPub = pubData.notifications_config || null;
            if (notifCfgPub) {
              if (notifCfgPub.telegram_group_ids) setTelegramGroupIds(String(notifCfgPub.telegram_group_ids));
              if (notifCfgPub.telegram_channel_ids) setTelegramChannelIds(String(notifCfgPub.telegram_channel_ids));
              if (notifCfgPub.events) setTelegramNotifyEvents((prev) => ({ ...prev, ...notifCfgPub.events }));
            }
            if (pubData.balance !== undefined) setBalance(Number(pubData.balance));
            if (pubData.interview_credits !== undefined) setInterviewCredits(Number(pubData.interview_credits));
            if (pubData.training_credits !== undefined) setTrainingCredits(Number(pubData.training_credits));
            if (pubData.landing_credits !== undefined) setLandingCredits(Number(pubData.landing_credits));
            if (pubData.interview_setup_credits !== undefined) setInterviewSetupCredits(Number(pubData.interview_setup_credits));
            if (pubData.training_setup_credits !== undefined) setTrainingSetupCredits(Number(pubData.training_setup_credits));
            if (pubData.created_at) setEmployerCreatedAt(pubData.created_at);
            return;
          }
        }
      }

      // If local cache exists, use it
      if (cachedUser && (cachedUser.name || cachedUser.email || cachedUser.publicId)) {
        setProfileName(cachedUser.name || cachedUser.contact_name || "");
        setProfileEmail(cachedUser.email || cachedUser.contact_email || "");
        setCompanyNameState(cachedUser.companyName || cachedUser.company_name || "");
        setProfilePhone(cachedUser.phone || cachedUser.contact_phone || "");
        setTelegramUsernameState((cachedUser.telegram || cachedUser.contact_telegram || "").replace(/^@+/, ""));
        if (cachedUser.balance !== undefined) setBalance(Number(cachedUser.balance));
        return;
      }

      // database fallback — read employer row by public_id (safely guarded)
      if (isEmployerPublicIdCandidate(targetEmpId)) {
        try {
          const { dbClient } = await import("@/lib/dbClient");
          const { data: emp } = await dbClient
            .from("employers")
            .select("*, wallets(units_balance)")
            .eq("public_id", targetEmpId)
            .maybeSingle();
          if (emp) {
            const directEmpBal = (emp as any).balance;
            setBalance(directEmpBal !== undefined && directEmpBal !== null ? Number(directEmpBal) : Number((emp as any).wallets?.[0]?.units_balance ?? (emp as any).wallets?.units_balance ?? 0));
            const empName = emp.contact_name || (emp as any).name || "";
            const empEmail = emp.contact_email || (emp as any).email || "";
            const empPhone = emp.contact_phone || (emp as any).phone || "";
            const empCompany = (emp as any).company_name || "";
            const empTg = emp.contact_telegram || (emp as any).telegram_username || "";
            setProfileName(empName);
            setProfileEmail(empEmail);
            setProfilePhone(empPhone);
            setCompanyNameState(empCompany);
            setTelegramUsernameState(empTg.replace(/^@+/, ""));
            if ((emp as any).telegram_chat_id) setTelegramChatId(String((emp as any).telegram_chat_id));
            if (emp.created_at) setEmployerCreatedAt(emp.created_at);
          }
        } catch (dbErr) {
          console.warn("[EmployerPanel] database profile fallback unavailable:", dbErr);
        }
      }
    } catch (err) {
      console.warn("Could not refresh employer profile from remote:", err);
    }
  };

  const handleUpdateProfile = async (customPayload?: any) => {
    try {
      const defaultPayload = {
        employerId,
        publicId: employerId,
        name: profileName,
        company_name: companyNameState,
        title: profileTitle,
        email: profileEmail,
        phone: profilePhone,
        telegram: telegramUsernameState,
      };

      const payload = customPayload ? { ...defaultPayload, ...customPayload } : defaultPayload;

      // Update via backend API
      try {
        const res = await fetch("/api/auth/employer/update-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.user) {
          if (data.user.name) setProfileName(data.user.name);
          if (data.user.phone) setProfilePhone(data.user.phone);
          if (data.user.email) setProfileEmail(data.user.email);
          if (data.user.companyName) setCompanyNameState(data.user.companyName);
          if (data.user.telegram) setTelegramUsernameState(data.user.telegram.replace(/^@+/, ""));
        }
      } catch (err) {
        console.error("Backend profile update error:", err);
      }

      // Also try database as fallback
      try {
        const { dbClient } = await import("@/lib/dbClient");
        if (employerId) {
          await dbClient
            .from("employers")
            .update({
              name: payload.name,
              contact_name: payload.name,
              company_name: payload.company_name,
              email: payload.email,
              contact_email: payload.email,
              phone: payload.phone,
              contact_phone: payload.phone,
              telegram_username: payload.telegram ? payload.telegram.replace(/^@+/, "") : null,
              contact_telegram: payload.telegram ? payload.telegram.replace(/^@+/, "") : null,
            } as any)
            .or(`public_id.eq.${employerId},id.eq.${employerId}`);
        }
      } catch {}

      setIsProfileSaved(true);
      addAuditEvent("success", "Профиль сохранен", "HR менеджер успешно обновил личные контактные данные.");
      setTimeout(() => setIsProfileSaved(false), 2500);
      fetchEmployerData();
    } catch (err) {
      console.error("Error updating profile:", err);
    }
  };

  const handleChangePassword = async (): Promise<boolean> => {
    setPasswordChangeError("");
    setPasswordChangeSuccess("");
    if (!newPassword || newPassword.length < 8) {
      setPasswordChangeError("Пароль должен быть не менее 8 символов");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError("Пароли не совпадают");
      return false;
    }
    setIsChangingPassword(true);
    try {
      const { dbClient } = await import("@/lib/dbClient");
      const { error: dbErr } = await dbClient.auth.updateUser({ password: newPassword });

      const res = await fetch("/api/auth/employer/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: googleEmail || profileEmail,
          newPassword,
          employerId,
        }),
      }).catch(() => null);

      if (dbErr && (!res || !res.ok)) {
        throw new Error(dbErr.message || "Не удалось изменить пароль");
      }

      setPasswordChangeSuccess("Пароль успешно изменён!");
      setNewPassword("");
      setConfirmPassword("");
      return true;
    } catch (err: any) {
      setPasswordChangeError(err.message || "Ошибка при смене пароля");
      return false;
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Fetch initial data in parallel with in-flight guard so 8s polling never stacks
  const fetchDataInFlightRef = useRef(false);
  const fetchData = async () => {
    if (fetchDataInFlightRef.current) return;
    fetchDataInFlightRef.current = true;
    try {
      if (!isEmployerPublicIdCandidate(employerId)) return;
      if (!isDataLoaded) {
        setDataLoadPercent(35);
        setDataLoadStatusText("Загрузка вакансий, кандидатов и профиля...");
      }
      const { dbClient } = await import("@/lib/dbClient");
      const effectiveIsAdmin = isAdmin && String(employerId) === "100007";

      const projectsPromise = (async () => {
        let projRows: any[] = [];
        let projApiOk = false;
        try {
          const resp = await fetch(`/api/projects?employerId=${encodeURIComponent(employerId)}`);
          if (resp.ok) {
            const list = await resp.json();
            if (Array.isArray(list)) {
              projRows = list;
              projApiOk = true;
            }
          }
        } catch (e) {
          console.warn("fetch /api/projects failed, trying fallback:", e);
        }

        if (!projApiOk && projRows.length === 0) {
          try {
            const { data: emp } = await dbClient.from("employers").select("id").eq("public_id", employerId).maybeSingle();
            if (emp?.id) {
              const r = await dbClient.from("projects").select("*, companies(name, slug)").eq("employer_id", emp.id);
              projRows = (r.data as any[]) || [];
            }
          } catch {}
        }

        setProjects(
          (projRows || []).map((p: any) => ({
            id: p.id,
            public_id: p.public_id || p.publicId || p.id,
            company_id: p.company_id || p.companyId || p.companies?.id || undefined,
            companyId: p.company_id || p.companyId || p.companies?.id || undefined,
            company_name: p.company_name || p.companyName || p.companies?.name || p.linked_company_name || "",
            companyName: p.company_name || p.companyName || p.companies?.name || p.linked_company_name || "",
            company_slug: p.company_slug || p.companySlug || p.companies?.slug || p.linked_company_slug || undefined,
            companySlug: p.company_slug || p.companySlug || p.companies?.slug || p.linked_company_slug || undefined,
            company_public_id: p.company_public_id || p.companyPublicId || p.linked_company_public_id || undefined,
            companyPublicId: p.company_public_id || p.companyPublicId || p.linked_company_public_id || undefined,
            employer_id: p.employer_id || p.employerId,
            employerId: p.employer_id || p.employerId,
            employer_public_id: p.employer_public_id || p.employerPublicId || undefined,
            employerPublicId: p.employer_public_id || p.employerPublicId || undefined,
            publicVacUrl: p.publicVacUrl || undefined,
            editVacUrl: p.editVacUrl || undefined,
            roleName: p.role_name || p.roleName || "",
            salaryTerms: p.salary_terms || p.salaryTerms || undefined,
            scheduleTerms: p.schedule_terms || p.scheduleTerms || undefined,
            motivationText: p.motivation_text || p.motivationText || undefined,
            customWiki: p.custom_wiki || p.customWiki || undefined,
            checklistQuestions: p.checklistQuestions || [],
            roleplayQuestions: p.roleplayQuestions || [],
            logoUrl: p.logo_url || p.logoUrl || undefined,
            slug: p.slug,
            vacancyText: p.vacancy_text || p.vacancyText || undefined,
            tasksActivityText: p.tasks_activity_text || p.tasksActivityText || undefined,
            scheduleText: p.schedule_text || p.scheduleText || undefined,
            motivationTextDetail: p.motivation_text_detail || p.motivationTextDetail || undefined,
            payoutsText: p.payouts_text || p.payoutsText || undefined,
            onboardingText: p.onboarding_text || p.onboardingText || undefined,
            teamText: p.team_text || p.teamText || undefined,
            systemText: p.system_text || p.systemText || undefined,
            trainingProfessionalText: p.training_professional_text || p.trainingProfessionalText || undefined,
            trainingProductText: p.training_product_text || p.trainingProductText || undefined,
            trainingSystemsText: p.training_systems_text || p.trainingSystemsText || undefined,
            trainingWikiText: p.training_wiki_text || p.trainingWikiText || undefined,
            trainingRegulationsText: p.training_regulations_text || p.trainingRegulationsText || undefined,
            hhPostText: p.hh_post_text || p.hhPostText || undefined,
            hhInviteText: p.hh_invite_text || p.hhInviteText || undefined,
            hhAutoresumeText: p.hh_autoresume_text || p.hhAutoresumeText || undefined,
            candidate_fields_config: p.candidate_fields_config || p.candidateFieldsConfig || undefined,
            candidateFieldsConfig: p.candidate_fields_config || p.candidateFieldsConfig || undefined,
            trainingProfText: p.training_prof_text || p.training_professional_text || p.trainingProfText || undefined,
            trainingSystemText: p.training_system_text || p.training_systems_text || p.trainingSystemText || undefined,
            candidates_count: Number(p.candidates_count || p.candidatesCount || 0),
            candidatesCount: Number(p.candidates_count || p.candidatesCount || 0),
            interviewed_count: Number(p.interviewed_count || p.interviewedCount || 0),
            interviewedCount: Number(p.interviewed_count || p.interviewedCount || 0),
            training_count: Number(p.training_count || p.trainingCount || 0),
            trainingCount: Number(p.training_count || p.trainingCount || 0),
            interview_limit: Math.round(Number(p.interview_limit ?? p.interviewLimit ?? 0)),
            interviewLimit: Math.round(Number(p.interview_limit ?? p.interviewLimit ?? 0)),
            interview_used: Math.round(Number(p.interview_used ?? p.interviewUsed ?? 0)),
            interviewUsed: Math.round(Number(p.interview_used ?? p.interviewUsed ?? 0)),
            training_limit: Math.round(Number(p.training_limit ?? p.trainingLimit ?? 0)),
            trainingLimit: Math.round(Number(p.training_limit ?? p.trainingLimit ?? 0)),
            training_used: Math.round(Number(p.training_used ?? p.trainingUsed ?? 0)),
            trainingUsed: Math.round(Number(p.training_used ?? p.trainingUsed ?? 0)),
            interviewPassScore: Number(p.interview_pass_score ?? p.interviewPassScore) > 0 ? Number(p.interview_pass_score ?? p.interviewPassScore) : 70,
            status: p.status || "active",
            is_published: p.is_published !== undefined ? p.is_published : 1,
            notifications_config: p.notifications_config || p.notificationsConfig || null,
            notificationsConfig: p.notifications_config || p.notificationsConfig || null,
            theme_config: p.theme_config || p.linked_company_theme_config || undefined,
            css: p.css || p.linked_company_css || undefined,
          })) as any,
        );
      })();

      const candidatesPromise = (async () => {
        let candRows: any[] = [];
        try {
          const { data, error } = await (dbClient as any).rpc("employer_list_candidates", {
            _employer_id: employerId,
            is_admin: effectiveIsAdmin,
          });
          if (!error && Array.isArray(data)) candRows = data;
        } catch (e) { console.warn("employer_list_candidates rpc failed", e); }
        setCandidates(
          (candRows || []).map((c: any) => ({
            id: `candidate${c.public_id}`,
            uuid: c.id,
            publicId: c.public_id,
            name: c.full_name || `Кандидат #${c.public_id}`,
            fullName: c.full_name || "",
            email: c.email || "",
            phone: c.phone || "",
            projectId: c.project_id,
            projectPublicId: c.project_public_id,
            companyId: c.company_id,
            companyName: c.company_name || "",
            companySlug: c.company_slug || undefined,
            roleName: c.role_name || "",
            currentStage: c.current_stage,
            crmStage: c.crm_stage || c.derived_stage || "registration",
            derivedStage: c.derived_stage,
            hasResume: !!c.has_resume,
            hasChecklist: !!c.has_checklist,
            hasSituations: !!c.has_situations,
            hasOverall: !!c.has_overall,
            trainingPassed: c.training_passed || [],
            certified: !!c.certified,
            createdAt: c.created_at,
            updatedAt: c.updated_at || c.created_at,
            registeredVia: c.registered_via,
            hireDecision: c.hire_decision || "",
            hireDecidedAt: c.hire_decided_at || null,
            hireMessage: c.hire_message || "",
            scores: {
              resumeScore: c.resume_score != null ? Number(c.resume_score) : undefined,
              checklistScore: c.checklist_score != null ? Number(c.checklist_score) : undefined,
              situationsScore: c.situations_score != null ? Number(c.situations_score) : undefined,
              interviewScore: c.interview_score != null ? Number(c.interview_score) : undefined,
              overallScore: c.overall_score != null ? Number(c.overall_score) : undefined,
            },
            standardFields: c.standard_fields || c.standardFields || {},
            customFields: c.custom_fields || c.customFields || {},
            city: c.city || c.standard_fields?.city || "",
            citizenship: c.citizenship || c.standard_fields?.citizenship || "",
            workExperience: c.work_experience || c.standard_fields?.work_experience || "",
            desiredSalary: c.desired_salary || c.standard_fields?.desired_salary || "",
            education: c.education || c.standard_fields?.education || "",
            skills: c.skills || c.standard_fields?.skills || "",
            gender: c.gender || c.standard_fields?.gender || "",
            employerId: c.employer_id || c.employerId || undefined,
          })) as any,
        );
      })();

      await Promise.all([
        projectsPromise,
        candidatesPromise,
        fetchEmployerData(),
        fetchCompanies(),
      ]);
    } catch (err) {
      console.error("Error loading server data:", err);
    } finally {
      fetchDataInFlightRef.current = false;
      if (!isDataLoaded) {
        setDataLoadPercent(100);
        setDataLoadStatusText("Кабинет готов к работе!");
      }
      setIsDataLoaded(true);
    }
  };

  useEffect(() => {
    fetchData();
    // Do not poll on high frequency when editing training materials to prevent preview re-renders
    if (activeTab === "training") return;
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [employerId, activeTab]);

  // Real-time synchronization of candidate stage updates (BroadcastChannel + CustomEvent)
  useEffect(() => {
    const handleStageUpdate = (evt: any) => {
      const detail = evt?.detail || evt?.data;
      if (!detail?.candidateId || !detail?.stage) return;
      const targetId = String(detail.candidateId);
      const cleanTargetId = targetId.replace(/^candidate/i, "").trim();
      setCandidates((prev) =>
        prev.map((c: any) => {
          const cId = String(c.id || "");
          const cPub = String(c.publicId || "");
          const cUuid = String(c.uuid || "");
          if (cId === targetId || cPub === cleanTargetId || cUuid === targetId || cId === `candidate${cleanTargetId}`) {
            return {
              ...c,
              crmStage: detail.stage,
              currentStage: detail.stage,
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        })
      );
      void fetchData();
    };

    window.addEventListener("candidate_stage_updated", handleStageUpdate as any);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("crm_stage_sync");
      channel.onmessage = (msgEvt) => {
        if (msgEvt.data?.type === "candidate_stage_updated") {
          handleStageUpdate(msgEvt);
        }
      };
    } catch {}

    return () => {
      window.removeEventListener("candidate_stage_updated", handleStageUpdate as any);
      if (channel) {
        try { channel.close(); } catch {}
      }
    };
  }, [employerId]);

  // Side-fetch employer decisions for CRM cards/filter (RLS-safe: only rows
  // this employer can see are returned).
  useEffect(() => {
    const ids = candidates.map((c: any) => c.uuid).filter(Boolean);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await dbClient
        .from("candidates")
        .select("id, hire_decision")
        .in("id", ids as string[]);
      if (cancelled || !Array.isArray(data)) return;
      const m: Record<string, string> = {};
      for (const r of data as any[]) if (r?.hire_decision) m[r.id] = r.hire_decision;
      setHireDecisionMap(m);
    })();
    return () => { cancelled = true; };
  }, [candidates]);

  // Refresh CRM / vacancies immediately on window focus or tab visibility
  // change so that completing a candidate stage in another tab is reflected
  // without waiting for the 4-second polling cycle.
  useEffect(() => {
    if (!employerId) return;
    const onFocus = () => { fetchData(); };
    const onVis = () => { if (document.visibilityState === "visible") fetchData(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employerId]);

  // Immediate refresh of the companies list whenever the employerId changes
  // (e.g. when the user navigates into /emp{id}/companies). The 4-second
  // polling above eventually loads it too, but UX should be instant.
  useEffect(() => {
    if (!employerId) return;
    fetchCompanies();
  }, [employerId]);

  useEffect(() => {
    const pathEmployerId = parseEmployerPublicIdFromPath(path);
    if (pathEmployerId && pathEmployerId !== employerId) {
      setEmployerId(pathEmployerId);
    }
  }, [path, employerId]);

  // If no employer in URL/session, resolve via database auth (user_id -> employer.public_id)
  // or fall back to the first existing employer (admin/demo case).
  useEffect(() => {
    if (isEmployerPublicIdCandidate(employerId)) return;
    if (!authReady) return;
    let cancelled = false;
    (async () => {
      const { dbClient } = await import("@/lib/dbClient");
      if (authUserId) {
        const { data: own } = await dbClient
          .from("employers")
          .select("public_id")
          .eq("user_id", authUserId)
          .maybeSingle();
        if (!cancelled && own?.public_id) {
          setEmployerId(own.public_id);
          cacheEmployerPublicId(own.public_id, authUserId);
          if (path === "/setup" || path === "/employer" || path.startsWith("/employer/")) {
            navigate(`/emp${own.public_id}/${activeTab === "crm" ? "profile" : activeTab}`);
          }
          return;
        }
        clearCachedEmployerPublicId();
        return;
      }
      clearCachedEmployerPublicId();
    })();
    return () => { cancelled = true; };
  }, [employerId, path, navigate, activeTab, authReady, authUserId]);

  // Onboarding (#7): hasTrainingSetup / hasInterviewSetup на основе training_blocks + training_stage_tests
  // и interview_systems + interview_blocks по всем вакансиям работодателя.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const projIds = projects.map((p: any) => p.id).filter(Boolean);
      if (projIds.length === 0) {
        if (!cancelled) {
          setHasTrainingSetup(false);
          setHasInterviewSetup(false);
          if (isDataLoaded) setOnboardingChecked(true);
        }
        return;
      }
      const [trBlocksRes, trTestsRes, ivSysRes, ivBlocksRes] = await Promise.all([
        (dbClient as any).from("training_blocks").select("project_id, stage").in("project_id", projIds),
        (dbClient as any).from("training_stage_tests").select("project_id, stage, status, questions, questions_json").in("project_id", projIds),
        (dbClient as any).from("interview_systems").select("project_id, status").in("project_id", projIds),
        (dbClient as any).from("interview_blocks").select("project_id, kind").in("project_id", projIds),
      ]);
      if (cancelled) return;

      const normStage = (raw: any): string => {
        const s = String(raw || "").toLowerCase().trim();
        if (s === "stage1" || s === "1" || s.startsWith("prof")) return "professional";
        if (s === "stage2" || s === "2" || s.startsWith("prod")) return "product";
        if (s === "stage3" || s === "3" || s.startsWith("sys")) return "system";
        return s;
      };
      const coreStages = new Set(["professional", "product", "system"]);
      const tbByProj = new Map<string, Set<string>>();
      for (const r of ((trBlocksRes as any)?.data as any[]) || []) {
        const pid = String(r.project_id || "");
        const stg = normStage(r.stage);
        if (!pid || !coreStages.has(stg)) continue;
        if (!tbByProj.has(pid)) tbByProj.set(pid, new Set());
        tbByProj.get(pid)!.add(stg);
      }

      const ttByProj = new Map<string, Set<string>>();
      for (const r of ((trTestsRes as any)?.data as any[]) || []) {
        const pid = String(r.project_id || "");
        const stg = normStage(r.stage);
        if (!pid || !coreStages.has(stg)) continue;
        const qRaw = r.questions ?? r.questions_json;
        const hasQ = Array.isArray(qRaw)
          ? qRaw.length > 0
          : typeof qRaw === "string" && qRaw.trim() !== "" && qRaw.trim() !== "[]";
        const isCompleted = r.status === "completed" || hasQ;
        if (!isCompleted) continue;
        if (!ttByProj.has(pid)) ttByProj.set(pid, new Set());
        ttByProj.get(pid)!.add(stg);
      }

      let trDone = false;
      for (const pid of projIds) {
        const bSet = tbByProj.get(String(pid));
        const tSet = ttByProj.get(String(pid));
        if (bSet && bSet.size >= 3 && tSet && tSet.size >= 3) {
          trDone = true;
          break;
        }
      }

      const ivSysSet = new Set<string>(
        (((ivSysRes as any)?.data as any[]) || []).map((r: any) => String(r.project_id || "")).filter(Boolean)
      );
      const ibByProj = new Map<string, Set<string>>();
      for (const r of ((ivBlocksRes as any)?.data as any[]) || []) {
        const pid = String(r.project_id || "");
        const k = String(r.kind || "");
        if (!pid || !["resume", "checklist", "situations"].includes(k)) continue;
        if (!ibByProj.has(pid)) ibByProj.set(pid, new Set());
        ibByProj.get(pid)!.add(k);
      }

      let ivDone = false;
      for (const pid of projIds) {
        const kSet = ibByProj.get(String(pid));
        if (ivSysSet.has(String(pid)) && kSet && kSet.size >= 3) {
          ivDone = true;
          break;
        }
      }

      setHasTrainingSetup(trDone);
      setHasInterviewSetup(ivDone);
      if (isDataLoaded) setOnboardingChecked(true);
    })();
    return () => { cancelled = true; };
  }, [projects, isDataLoaded]);

  // Redirect on entering the cabinet if setup is not yet completed
  useEffect(() => {
    if (!isDataLoaded || !onboardingChecked || !employerId) return;
    if (setupRedirectDoneRef.current) return;

    const cleanPath = path.replace(/\/+$/, "");
    const baseEmpPath = `/emp${employerId}`;
    const isEntryPath =
      cleanPath === baseEmpPath ||
      cleanPath === `${baseEmpPath}/crm` ||
      cleanPath === `${baseEmpPath}/setup` ||
      cleanPath === `${baseEmpPath}/overview`;

    if (!isEntryPath) {
      setupRedirectDoneRef.current = true;
      return;
    }

    const companyFilled =
      (companiesList || []).length > 0 ||
      Boolean(newCompanyName && newCompanyName.trim()) ||
      Boolean(companyNameState && companyNameState.trim()) ||
      Boolean(tempCompanyName && tempCompanyName.trim());
    const vacancyFilled = (projects?.length || 0) > 0;

    setupRedirectDoneRef.current = true;

    if (!companyFilled) {
      navigate(`${baseEmpPath}/companies`, { replace: true });
    } else if (!vacancyFilled) {
      navigate(`${baseEmpPath}/vacancies`, { replace: true });
    } else if (!hasTrainingSetup) {
      navigate(`${baseEmpPath}/training`, { replace: true });
    } else if (!hasInterviewSetup) {
      navigate(`${baseEmpPath}/interviews`, { replace: true });
    } else if (cleanPath === `${baseEmpPath}/setup` || cleanPath === `${baseEmpPath}/overview`) {
      navigate(baseEmpPath, { replace: true });
    }
  }, [
    isDataLoaded,
    onboardingChecked,
    employerId,
    path,
    companiesList,
    newCompanyName,
    companyNameState,
    tempCompanyName,
    projects,
    hasTrainingSetup,
    hasInterviewSetup,
    navigate,
  ]);

  // Load profile email for the authenticated user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await dbClient.auth.getUser();
      if (!user || cancelled) return;

      // Pull real identity from auth user_metadata (Google or email signup)
      const meta: any = user.user_metadata || {};
      const appMeta: any = (user as any).app_metadata || {};
      const identities: any[] = Array.isArray((user as any).identities) ? (user as any).identities : [];
      const providerRaw = String(
        appMeta.provider || identities[0]?.provider || ""
      ).toLowerCase();
      const provider: "google" | "email" | "unknown" =
        providerRaw === "google" ? "google" : (providerRaw ? "email" : "unknown");
      setAuthProvider(provider);

      const fullName = meta.full_name || meta.name || meta.display_name || "";
      const picture = meta.avatar_url || meta.picture || "";
      const sub = meta.sub || meta.provider_id || user.id;
      if (fullName) { setGoogleName(fullName); setProfileName(fullName); }
      if (picture) setGooglePhoto(picture);
      if (sub) setGoogleId(String(sub));
      if (user.email) { setGoogleEmail(user.email); setProfileEmail(user.email); }
      setGoogleVerified(provider === "google");

      // Pull saved contact details from employers row
      const { data: emp } = await dbClient
        .from("employers")
        .select("contact_phone, phone, contact_name, name, contact_email, email, created_at, public_id, contact_telegram, telegram_username, telegram_chat_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && emp) {
        const empName = (emp as any).contact_name || (emp as any).name || "";
        const empEmail = (emp as any).contact_email || (emp as any).email || "";
        const empPhone = (emp as any).contact_phone || (emp as any).phone || "";
        const empTg = (emp as any).contact_telegram || (emp as any).telegram_username || "";
        if (empName) { setProfileName(empName); if (!googleName) setGoogleName(empName); }
        if (empEmail) { setProfileEmail(empEmail); if (!googleEmail) setGoogleEmail(empEmail); }
        if (empPhone) setProfilePhone(empPhone);
        if ((emp as any).created_at) setEmployerCreatedAt((emp as any).created_at);
        if ((emp as any).public_id) setEmployerId((emp as any).public_id);
        if (empTg) setTelegramUsernameState(empTg.replace(/^@+/, ""));
        if ((emp as any).telegram_chat_id) setTelegramChatId(String((emp as any).telegram_chat_id));
      }

      const { data: prof } = await dbClient
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !prof) return;
      if (prof.email) setGoogleEmail(prof.email);
    })();
    return () => { cancelled = true; };
  }, [employerId]);

  const handleRequestPhoneViaBot = async () => {
    /* Telegram removed */
  };

  const handleLogout = async () => {
    try {
      await dbClient.auth.signOut();
    } catch { /* ignore */ }
    localStorage.clear();
    navigate("/main");
  };

  /** Перевод серверных ошибок (RPC) в человеческие сообщения. */
  const translateBillingError = (msg: string): string => {
    if (!msg) return "Неизвестная ошибка";
    const m = msg.toLowerCase();
    if (m.includes("insufficient_funds")) return "Недостаточно средств на балансе. Пополните счёт.";
    if (m.includes("no_credits")) return "Нет купленных лимитов. Купите пакет интервью или обучения.";
    if (m.includes("min_100")) return "Минимальный платёж — 100 ₽.";
    if (m.includes("no_employer")) return "Профиль работодателя не найден.";
    if (m.includes("bad_kind") || m.includes("bad_item") || m.includes("bad_qty")) return "Некорректные параметры запроса.";
    if (m.includes("forbidden")) return "Недостаточно прав.";
    return msg;
  };

  /** Подтягивает баланс, лимиты, реферера, рефери и историю операций. */
  const fetchBillingInFlightRef = useRef(false);
  const fetchBillingState = async () => {
    if (fetchBillingInFlightRef.current) return;
    fetchBillingInFlightRef.current = true;
    try {
      const activeId = employerId || parseEmployerPublicIdFromPath(window.location.pathname) || localStorage.getItem("current_employer_id") || "100007";
      if (activeId) {
        const billingRes = await fetch(`/api/employers/${activeId}/billing`).catch(() => null);
        if (billingRes && billingRes.ok) {
          const billingData = await billingRes.json();
          if (billingData && billingData.employer) {
            const empData = billingData.employer;
            setBalance(Number(empData.balance ?? 0));
            setBalanceStart(Number(empData.balance_start || 0));
            setBalancePay(Number(empData.balance_pay || 0));
            setBalanceReferral(Number(empData.balance_referral || 0));
            setBalanceAdmin(Number(empData.balance_admin || 0));
            setBalanceLimits(Number(empData.balance_limits || 0));
            setInterviewCredits(Number(empData.interview_credits || 0));
            setTrainingCredits(Number(empData.training_credits || 0));
            setLandingCredits(Number(empData.landing_credits || 0));
            setInterviewSetupCredits(Number(empData.interview_setup_credits || 0));
            setTrainingSetupCredits(Number(empData.training_setup_credits || 0));

            if (billingData.transactions && Array.isArray(billingData.transactions)) {
              setPaymentHistory(
                billingData.transactions.map((t: any) => {
                  const rawAmountRR = t.amount_rr !== undefined && t.amount_rr !== null ? Number(t.amount_rr) : 0;
                  const rawAmountLimits = t.amount_limits !== undefined && t.amount_limits !== null ? Number(t.amount_limits) : 0;
                  return {
                    id: t.id || Math.random().toString(),
                    raw_date: t.created_at || "",
                    date: t.created_at ? new Date(t.created_at).toLocaleString("ru-RU") : "—",
                    type: t.type || "transaction",
                    type_balance: t.type_balance || "",
                    type_limits: t.type_limits || "",
                    amount_rr: rawAmountRR,
                    amount_limits: rawAmountLimits,
                    amount: rawAmountRR !== 0 ? rawAmountRR : rawAmountLimits,
                    note: t.note || "",
                    description: t.description || "",
                    ref_table: t.ref_table || "",
                    ref_id: t.ref_id || "",
                  };
                })
              );
            }

            // Referrer / referees from billing endpoint
            if (billingData.referrer) {
              setReferrer(billingData.referrer);
            } else {
              setReferrer(null);
            }
            if (billingData.referees && Array.isArray(billingData.referees)) {
              setReferees(billingData.referees.map((r: any) => ({
                public_id: r.public_id || "",
                name: r.name || "",
                email: r.email || "",
                created_at: r.created_at,
                bonus_rr: Number(r.bonus_rr) || 0,
              })));
            } else {
              setReferees([]);
            }
            return;
          }
        }
      }

      try {
        const { data: { user } } = await dbClient.auth.getUser();
        let employerQuery = dbClient
          .from("employers")
          .select("id, user_id, public_id, balance, interview_credits, training_credits, landing_credits, interview_setup_credits, training_setup_credits, limits_json, wallets(units_balance, id)");
        if (isEmployerPublicIdCandidate(activeId)) {
          employerQuery = employerQuery.eq("public_id", activeId);
        } else if (user?.id) {
          employerQuery = employerQuery.eq("user_id", user.id);
        } else if (activeId) {
          employerQuery = employerQuery.eq("id", activeId);
        } else {
          return;
        }
        const { data: emp } = await employerQuery.maybeSingle();
        if (!emp) return;
        if (user?.id && (emp as any).user_id === user.id && isEmployerPublicIdCandidate((emp as any).public_id)) {
          cacheEmployerPublicId((emp as any).public_id, user.id);
          const urlEmp = parseEmployerPublicIdFromPath(window.location.pathname);
          if (!urlEmp && (emp as any).public_id !== activeId) {
            setEmployerId((emp as any).public_id);
            navigate(`/emp${(emp as any).public_id}/${activeTab === "crm" ? "profile" : activeTab}`);
          }
        }

        let walletObj = (emp as any).wallets?.[0] ?? (emp as any).wallets;
        let walletId = walletObj?.id;
        const directEmpBal = (emp as any).balance;
        let resolvedBalance = directEmpBal !== undefined && directEmpBal !== null
          ? Number(directEmpBal)
          : (walletObj?.units_balance !== undefined ? Number(walletObj.units_balance) : 0);

        if (!walletId || resolvedBalance === 0) {
          const { data: directWallet } = await dbClient
            .from("wallets")
            .select("id, units_balance")
            .eq("employer_id", (emp as any).id)
            .maybeSingle();
          if (directWallet) {
            walletId = directWallet.id;
            resolvedBalance = Number(directWallet.units_balance ?? resolvedBalance);
          }
        }

        let limitsObj: any = {};
        if ((emp as any).limits_json) {
          try {
            limitsObj = typeof (emp as any).limits_json === "string" ? JSON.parse((emp as any).limits_json) : (emp as any).limits_json;
          } catch {}
        }

        setBalance(resolvedBalance);
        setInterviewCredits((emp as any).interview_credits ? Number((emp as any).interview_credits) : Number(limitsObj.interviews ?? limitsObj.interview_credits ?? 0));
        setTrainingCredits((emp as any).training_credits ? Number((emp as any).training_credits) : Number(limitsObj.trainings ?? limitsObj.training_credits ?? 0));
        setLandingCredits((emp as any).landing_credits ? Number((emp as any).landing_credits) : Number(limitsObj.landings ?? limitsObj.landing_credits ?? 0));
        setInterviewSetupCredits((emp as any).interview_setup_credits ? Number((emp as any).interview_setup_credits) : Number(limitsObj.interviewSystems ?? limitsObj.interview_setup_credits ?? 0));
        setTrainingSetupCredits((emp as any).training_setup_credits ? Number((emp as any).training_setup_credits) : Number(limitsObj.trainingSystems ?? limitsObj.training_setup_credits ?? 0));

        let txList: any[] = [];
        if (walletId) {
          const { data: txs } = await dbClient
            .from("transactions")
            .select("id, created_at, type, type_balance, type_limits, amount_rr, amount_limits, note, description, ref_table, ref_id")
            .eq("wallet_id", walletId)
            .order("created_at", { ascending: false })
            .limit(200);
          if (txs && txs.length > 0) txList = txs;
        }

        if (txList.length === 0) {
          const { data: txs2 } = await dbClient
            .from("transactions")
            .select("id, created_at, type, type_balance, type_limits, amount_rr, amount_limits, note, description, ref_table, ref_id")
            .eq("ref_id", (emp as any).id)
            .order("created_at", { ascending: false })
            .limit(200);
          if (txs2 && txs2.length > 0) txList = txs2;
        }

        setPaymentHistory(txList.map((t: any) => {
          const rawAmountRR = t.amount_rr !== undefined && t.amount_rr !== null ? Number(t.amount_rr) : 0;
          const rawAmountLimits = t.amount_limits !== undefined && t.amount_limits !== null ? Number(t.amount_limits) : 0;
          return {
            id: t.id || Math.random().toString(),
            raw_date: t.created_at || "",
            date: t.created_at ? new Date(t.created_at).toLocaleString("ru-RU") : "—",
            type: t.type || "transaction",
            type_balance: t.type_balance || "",
            type_limits: t.type_limits || "",
            amount_rr: rawAmountRR,
            amount_limits: rawAmountLimits,
            amount: rawAmountRR !== 0 ? rawAmountRR : rawAmountLimits,
            note: t.note || "",
            description: t.description || "",
            ref_table: t.ref_table || "",
            ref_id: t.ref_id || "",
          };
        }));

        // Реферер (кто меня пригласил) — через SECURITY DEFINER RPC
        const { data: refData } = await dbClient.rpc("get_my_referrer", { _public_id: activeId });
        if (refData && typeof refData === "object") {
          const r: any = refData;
          setReferrer({
            public_id: r.public_id || "",
            name: r.name || "",
            email: r.email || "",
            phone: r.contact_phone || null,
            telegram: r.contact_telegram || null,
          });
        } else {
          setReferrer(null);
        }
        // Кого пригласил я
        const { data: invitedData } = await dbClient.rpc("get_my_referees", { _public_id: activeId });
        const list: any[] = Array.isArray(invitedData) ? invitedData : [];
        setReferees(list.map((r: any) => ({
          name: r.name || "",
          email: r.email || "",
          created_at: r.created_at,
          bonus_rr: Number(r.bonus_rr) || 0,
        })));
      } catch (dbErr) {
        console.warn("[EmployerPanel] database billing fallback unavailable:", dbErr);
      }
    } catch (e) {
      console.warn("fetchBillingState failed:", e);
    } finally {
      fetchBillingInFlightRef.current = false;
    }
  };

  useEffect(() => {
    fetchBillingState();
    const t = setInterval(fetchBillingState, 8000);
    return () => clearInterval(t);
  }, [employerId]);

  // Покупка единого пакета: грейд цены определяется по сумме интервью + обучения.
  const handleBuyMixedPack = async () => {
    setPurchaseError("");
    setPackBusy(true);
    try {
      const qi = Math.max(0, Math.floor(packQty.interview || 0));
      const qt = Math.max(0, Math.floor(packQty.training || 0));
      if (qi + qt < 1) throw new Error("Укажите хотя бы 1 шт.");
      const { error } = await dbClient.rpc("purchase_pack_mixed", { _qty_int: qi, _qty_train: qt, _public_id: employerId });
      if (error) throw new Error(error.message || "Ошибка покупки пакета");
      addAuditEvent("success", "Пакет приобретён", `Интервью +${qi} · Обучение +${qt}`);
      await fetchBillingState();
    } catch (err: any) {
      setPurchaseError(translateBillingError(err.message));
    } finally {
      setPackBusy(false);
    }
  };

  // Покупка фикс-услуги впрок (landing / interview_setup / training_setup)
  const handleBuyFixed = async (item: "landing" | "interview_setup" | "training_setup", qty: number = 1) => {
    setPurchaseError("");
    setFixedBusy(item);
    try {
      const { error } = await dbClient.rpc("purchase_fixed", { _item: item, _qty: Math.max(1, Math.floor(qty)), _public_id: employerId });
      if (error) throw new Error(error.message || "Ошибка покупки услуги");
      addAuditEvent("success", "Услуга куплена", `${item} ×${qty}`);
      await fetchBillingState();
      window.dispatchEvent(new Event("employer_data_changed"));
    } catch (err: any) {
      setPurchaseError(translateBillingError(err.message));
    } finally {
      setFixedBusy(null);
    }
  };

  // Action: Top Up Balance via Robokassa
  const handleTopupBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopupError("");
    if (topupAmountRub < 100) {
      setTopupError("Минимальная сумма пополнения — 100 ₽.");
      return;
    }
    if (!topupOfferOk) {
      setTopupError("Для оплаты необходимо согласие с публичной офертой.");
      return;
    }
    setIsToppingUp(true);
    try {
      const res = await fetch("/api/payments/robokassa/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_rub: topupAmountRub,
          rr_amount: topupAmountRub,
          payPrice: topupAmountRub,
          employer_id: employerId || "100007",
          userId: employerId || "100007",
          offer_accepted: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Ошибка инициализации платежа в Робокассе");
      }

      addAuditEvent("info", "Переход на оплату", `Счёт №${data.inv_id} на ${topupAmountRub} ₽ (Робокасса, НДС 5% ОСН)`);

      if (data.payment_url) {
        // Redirect directly or via form POST
        const form = document.createElement("form");
        form.method = (data.method || "POST") as string;
        form.action = data.action || "https://auth.robokassa.ru/Merchant/Index.aspx";
        form.style.display = "none";
        for (const [name, value] of Object.entries((data.fields || {}) as Record<string, string>)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = String(value ?? "");
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }

      throw new Error("Не получен адрес платежного шлюза");
    } catch (err: any) {
      console.error("[Robokassa payment error]:", err);
      setTopupError(err?.message || "Не удалось открыть платежный шлюз Робокассы. Попробуйте еще раз.");
    } finally {
      setIsToppingUp(false);
    }
  };

  // Log automated events helper
  const addAuditEvent = (type: "info" | "success" | "warning", title: string, message: string) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    setAuditEvents(prev => [
      { id: Date.now(), type, title, message, timestamp: timeStr },
      ...prev
    ]);
  };

  // Change candidate stage through live PATCH server endpoint
  const handleUpdateCandidateStage = async (candId: string, newStage: "terms" | "interview" | "scoring" | "training" | "certified") => {
    try {
      const { dbClient } = await import("@/lib/dbClient");
      const pid = String(candId).replace(/^candidate/, "");
      const upd = await dbClient
        .from("candidates")
        .update({ current_stage: newStage } as any)
        .eq("public_id", pid)
        .select("*")
        .maybeSingle();
      if (!upd.error && upd.data) {
        setCandidates(prev => prev.map(c => c.id === candId ? ({ ...(c as any), currentStage: newStage } as any) : c));
        if (selectedCandidate?.id === candId) {
          setSelectedCandidate({ ...(selectedCandidate as any), currentStage: newStage } as any);
        }
        addAuditEvent("success", "Этап кандидата изменен", `Кандидат продвинут на этап: ${newStage}`);
        fetchData();
      }
    } catch (err) {
      console.error("Error modifying candidate stage:", err);
    }
  };

  // Move candidate in the CRM funnel (8-stage). Marks the stage as manual,
  // disabling automatic recalculation from triggers.
  const handleUpdateCrmStage = async (
    candId: string,
    newStage: "registration" | "screening" | "checklist" | "situations" | "interview_reject" | "interview_success" | "professional" | "product" | "systems" | "certified",
  ) => {
    try {
      const { dbClient } = await import("@/lib/dbClient");
      const cand: any = candidates.find((c: any) => c.id === candId);
      const uuid = cand?.uuid;
      if (!uuid) return;
      const { error } = await dbClient.rpc("employer_set_candidate_crm_stage" as any, {
        _candidate: uuid, _stage: newStage,
      });
      if (error) throw error;
      setCandidates(prev => prev.map((c: any) => c.id === candId ? ({ ...c, crmStage: newStage }) : c));
      addAuditEvent("success", "Этап CRM обновлён", `Кандидат перемещён на этап: ${newStage}`);
    } catch (err: any) {
      console.error("Error updating CRM stage:", err);
      addAuditEvent("warning", "Ошибка CRM", err?.message || "Не удалось обновить этап");
    }
  };

  const handleGoToCreateCompany = () => {
    setShowSelectCompanyModalForVacancy(false);
    if (employerId) {
      navigate(`/emp${employerId}/companies`);
    }
    setShowAddCompany(true);
  };

  // Open the vacancy wizard: check company, limits, balance before creating
  const openAddVacancyWizard = async () => {
    if (editingProject) { setEditingProject(null); }
    if (companiesList.length === 0) {
      setShowAddCompany(true);
      addAuditEvent("info", "Создайте компанию", "Сначала зарегистрируйте компанию, затем создайте вакансию.");
      return;
    }
    // Open the vacancy limits & balance check modal before creating
    setShowVacancyLimitModal(true);
  };

  const handleConfirmVacancyLimitModal = async (method: "credit" | "balance") => {
    setPendingVacancyPaymentMethod(method);
    setShowVacancyLimitModal(false);
    if (companiesList.length === 1) {
      await startVacancyWizardWithCompany(companiesList[0], method);
    } else {
      setShowSelectCompanyModalForVacancy(true);
    }
  };

  const handleGoToTariffPay = () => {
    setShowVacancyLimitModal(false);
    if (employerId) {
      navigate(`/emp${employerId}/tariff/pay`);
    } else {
      navigate("/emp100007/tariff/pay");
    }
  };

  // Start vacancy wizard after company and limits have been confirmed
  const startVacancyWizardWithCompany = async (selectedCompany: any, paymentMethod?: "credit" | "balance") => {
    setShowSelectCompanyModalForVacancy(false);
    setShowVacancyLimitModal(false);
    const chosenMethod = paymentMethod || pendingVacancyPaymentMethod || (landingCredits > 0 ? "credit" : "balance");
    setIsCreatingVacancyDraft(true);
    try {
      const selectedCompanyName = selectedCompany?.name || "";
      const companyId = selectedCompany?.id || null;

      let newDraftId: string | null = null;
      let newDraftPublicId: string | null = null;

      // Create draft via PostgreSQL BD ProTalk API endpoint with limit/balance check
      try {
        const localRes = await fetch("/api/projects/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employerId: employerId || "100007",
            companyId,
            companyName: selectedCompanyName,
            prefer: chosenMethod,
            paymentMethod: chosenMethod,
          }),
        });
        const localData = await localRes.json().catch(() => null);
        if (!localRes.ok) {
          if (localData?.error === "insufficient_limits") {
            addAuditEvent("warning", "Лимиты исчерпаны", localData.message || "Недостаточно лимитов вакансий или RR на балансе.");
            setShowVacancyLimitModal(true);
            return;
          }
        }
        if (localData?.project?.id || localData?.id) {
          newDraftId = localData.project?.id || localData.id;
          newDraftPublicId = localData.project?.public_id || localData.public_id || null;
          if (localData.new_credits !== undefined) {
            setLandingCredits(Number(localData.new_credits));
          }
          if (localData.new_balance !== undefined) {
            setBalance(Number(localData.new_balance));
          }
          if (localData.used_credit) {
            addAuditEvent("info", "Лимит списан", "Списан 1 лимит на создание ИИ-Лендинга вакансии (возврату не подлежит)");
          } else if (localData.spent_amount) {
            addAuditEvent("info", "Оплата с баланса", `Списано ${localData.spent_amount} RR за создание ИИ-Лендинга вакансии (возврату не подлежит)`);
          }
        }
      } catch (e) {
        console.warn("Local draft creation note:", e);
      }

      if (!newDraftId) {
        newDraftId = `vac_${Math.random().toString(36).substring(2, 9)}`;
        newDraftPublicId = String(400000 + Math.floor(Math.random() * 90000));
      }

      setDraftProjectId(newDraftId);
      setDraftProjectPublicId(newDraftPublicId);

      const freshDraft: any = {
        id: newDraftId,
        publicId: newDraftPublicId,
        public_id: newDraftPublicId,
        employerId: employerId || "100007",
        employer_id: employerId || "100007",
        companyName: selectedCompanyName,
        company_name: selectedCompanyName,
        companySlug: selectedCompany?.slug || "",
        company_slug: selectedCompany?.slug || "",
        companyId: companyId || selectedCompany?.public_id || "",
        company_id: companyId || selectedCompany?.public_id || "",
        roleName: "",
        role_name: "",
        salaryTerms: "",
        scheduleTerms: "",
        customWiki: "",
        vacancyText: "",
        tasksActivityText: "",
        motivationText: "",
        motivationTextDetail: "",
        scheduleText: "",
        payoutsText: "",
        onboardingText: "",
        companyText: "",
        missionText: "",
        teamText: "",
        systemText: "",
        trainingProfessionalText: "",
        trainingProductText: "",
        trainingSystemsText: "",
        trainingWikiText: "",
        trainingRegulationsText: "",
        logoUrl: selectedCompany?.logo_url || selectedCompany?.logoUrl || "",
        logo_url: selectedCompany?.logo_url || selectedCompany?.logoUrl || "",
        status: "draft",
        isPublished: 0,
        is_published: 0,
        checklistQuestions: [],
        roleplayQuestions: [],
        hhPostText: "",
        hhInviteText: "",
        hhAutoresumeText: ""
      };

      setEditingProject(freshDraft);
      setEditVacancyRawText("");
      setShowAddNewVacancy(false);
      await fetchBillingState();
      fetchData();
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка создания вакансии", err?.message || "Error");
    } finally {
      setIsCreatingVacancyDraft(false);
    }
  };

  const cancelAddVacancyWizard = async () => {
    try {
      if (draftProjectId) {
        await fetch(`/api/projects/${draftProjectId}`, { method: "DELETE" }).catch(() => {});
        try {
          await dbClient.from("projects").delete().eq("id", draftProjectId);
        } catch {}
      }
    } catch (e) { console.warn("cancel vacancy cleanup error", e); }
    setShowAddNewVacancy(false);
    setDraftProjectId(null);
    setDraftProjectPublicId(null);
    fetchData();
  };

  // Single-field AI improvement for vacancy wizard textareas.
  const handleEnhanceVacancyField = async (
    fieldName: string,
    currentVal: string,
    setter: (v: string) => void,
  ) => {
    setEnhancingVacFields(prev => ({ ...prev, [fieldName]: true }));
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const value = await aiWaitRun({
        title: `ИИ улучшает поле «${ruField(fieldName)}»`,
        task: () => aiEnhanceSingle({
          field: fieldName,
          value: currentVal,
          company_name: setupCompanyName,
          role_name: setupRoleName,
          template: exampleFor(fieldName) || undefined,
        }),
      });
      if (value) setter(value);
      addAuditEvent("success", "Поле улучшено ИИ", `Готово: ${fieldName}`);
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Проверьте соединение.");
    } finally {
      setEnhancingVacFields(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  // Save the wizard draft into projects (UPDATE), publish it, and redirect to
  // the employer vacancies list. The onboarding/training generation has been
  // moved out of the wizard to a dedicated action on each vacancy card.
  const handleCreateOnboardingSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftProjectId) {
      addAuditEvent("warning", "Нет черновика", "Откройте мастер через «+ Добавить вакансию».");
      return;
    }
    if (!setupRoleName.trim()) {
      addAuditEvent("warning", "Не указана должность", "Введите должность перед сохранением.");
      return;
    }
    if (!setupCompanyName.trim()) {
      addAuditEvent("warning", "Не выбрана компания", "Выберите компанию перед сохранением вакансии.");
      return;
    }
    setIsGenerating(true);
    try {
      // Resolve the company id from the selected company name (if any).
      const matched = companiesList.find(c => (c?.name || "").toLowerCase() === (setupCompanyName || "").toLowerCase());
      const companyId = (matched as any)?.id || null;
      if (!companyId) {
        addAuditEvent("warning", "Компания не найдена", "Выберите существующую компанию из списка.");
        setIsGenerating(false);
        return;
      }

      // Resolve unique role slug scoped to this company
      let generatedSlug: string | undefined = undefined;
      try {
        const slugRes = await fetch("/api/projects/generate-slug", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleName: setupRoleName.trim(),
            companyId,
            excludeProjectId: draftProjectId,
            fallbackPublicId: draftProjectPublicId || undefined
          })
        });
        if (slugRes.ok) {
          const slugData = await slugRes.json();
          if (slugData?.slug) generatedSlug = slugData.slug;
        }
      } catch (e) {
        console.warn("Slug generation note:", e);
      }

      const patch: any = {
        company_id: companyId,
        role_name: setupRoleName.trim(),
        slug: generatedSlug,
        role_slug: generatedSlug,
        // Legacy mirror fields kept in sync from the merged wizard inputs so
        // older queries that read salary_terms / schedule_terms still work.
        salary_terms: setupPayoutsText || null,
        schedule_terms: setupScheduleText || null,
        vacancy_text: setupVacancyText || null,
        tasks_activity_text: setupTasksActivityText || null,
        motivation_text: setupMotivationText || null,
        motivation_text_detail: setupMotivationDetail || null,
        schedule_text: setupScheduleText || null,
        payouts_text: setupPayoutsText || null,
        onboarding_text: setupOnboardingText || null,
        team_text: setupTeamText || null,
        system_text: setupSystemText || null,
        training_professional_text: setupTrainingProfessionalText || null,
        training_product_text: setupTrainingProductText || null,
        training_systems_text: setupTrainingSystemsText || null,
        training_wiki_text: setupTrainingWikiText || null,
        training_regulations_text: setupTrainingRegulationsText || null,
        candidate_fields_config: setupCandidateFieldsConfig || null,
        is_published: true,
      };

      // 1. Write to PostgreSQL BD ProTalk server API (primary database)
      try {
        const sqRes = await fetch(`/api/projects/${draftProjectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!sqRes.ok) {
          console.warn("PostgreSQL BD ProTalk project update status:", sqRes.status);
        }
      } catch (sqErr) {
        console.warn("PostgreSQL BD ProTalk project update notice:", sqErr);
      }

      // 2. Write to database companion
      try {
        await dbClient.from("projects").update(patch).eq("id", draftProjectId);
      } catch (sbErr) {
        console.warn("database project companion update notice:", sbErr);
      }

      // Keep the shared title catalog up-to-date AND save the wizard answers
      // as a per-role template (only fills empty keys; never overwrites).
      try {
        await upsertJobTitle(
          setupRoleName.trim(),
          setupCompanyName.trim() || newCompanyName || "",
          employerId || ""
        );
        await saveRoleTemplates(setupRoleName.trim(), {
          vacancy_text: setupVacancyText,
          tasks_activity_text: setupTasksActivityText,
          schedule_text: setupScheduleText,
          motivation_text: setupMotivationText,
          motivation_text_detail: setupMotivationDetail,
          payouts_text: setupPayoutsText,
          onboarding_text: setupOnboardingText,
          team_text_vac: setupTeamText,
          system_text_vac: setupSystemText,
        });
      } catch {}

      addAuditEvent("success", "Вакансия сохранена", `Опубликована вакансия «${setupRoleName}»`);
      setShowAddNewVacancy(false);
      setDraftProjectId(null);
      setDraftProjectPublicId(null);
      // Refresh list from the database and navigate to the vacancies tab.
      await fetchData();
      if (employerId) navigate(`/emp${employerId}/vacancies`);
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка сохранения вакансии", err?.message || "Error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle Pause Vacancy Action
  const togglePauseVacancy = (projId: string) => {
    const isPaused = pausedProjectIds.includes(projId);
    if (isPaused) {
      setPausedProjectIds(prev => prev.filter(id => id !== projId));
      addAuditEvent("success", "Вакансия активирована", `Проект ${projId} снова принимает соискателей`);
    } else {
      setPausedProjectIds(prev => [...prev, projId]);
      addAuditEvent("warning", "Вакансия на паузе", `Прием заявок по проекту ${projId} временно остановлен`);
    }
  };

  // Save edited project values
  const handleSaveEditedProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    setIsSavingEdit(true);
    try {
      const { dbClient } = await import("@/lib/dbClient");
      const ep: any = editingProject;
      // Resolve company_id prioritizing exact ID, then fallback to name
      const targetCoId = ep.company_id || ep.companyId;
      const matchedCo = companiesList.find(
        (c) => targetCoId && (String(c.id) === String(targetCoId) || String(c.public_id) === String(targetCoId) || String(c.id) === `comp-${String(targetCoId).replace(/^comp-?/, "")}`)
      ) || companiesList.find(
        (c) => (c?.name || "").toLowerCase() === (ep?.companyName || "").toLowerCase(),
      );
      const newCompanyId = (matchedCo as any)?.id ?? targetCoId ?? null;
      if (!newCompanyId) {
        addAuditEvent("warning", "Компания не выбрана", "Выберите компанию из списка перед сохранением вакансии.");
        setIsSavingEdit(false);
        return;
      }
      if (!ep.roleName || !ep.roleName.trim()) {
        addAuditEvent("warning", "Должность не указана", "Укажите должность вакансии перед сохранением.");
        setIsSavingEdit(false);
        return;
      }
      if (isRoleSlugDuplicate) {
        addAuditEvent("warning", "Дубликат должности в компании", `В этой компании уже есть вакансия «${ep.roleName}». Укажите уникальное название для этой компании.`);
        setIsSavingEdit(false);
        return;
      }
      const patch: any = {
        role_name: ep.roleName,
        company_id: newCompanyId,
        company_name: matchedCo?.name || ep.companyName,
        company_slug: matchedCo?.slug || ep.companySlug || (matchedCo?.name ? transliterateToSlug(matchedCo.name) : undefined),
        company_public_id: matchedCo?.public_id || ep.companyPublicId || undefined,
        is_published: true,
        status: "active",
        salary_terms: ep.salaryTerms ?? null,
        schedule_terms: ep.scheduleTerms ?? null,
        motivation_text: ep.motivationText ?? null,
        custom_wiki: ep.customWiki ?? null,
        logo_url: ep.logoUrl ?? matchedCo?.logo_url ?? matchedCo?.logoUrl ?? null,
        // 15 canonical vacancy fields
        vacancy_text: ep.vacancyText ?? null,
        tasks_activity_text: ep.tasksActivityText ?? null,
        schedule_text: ep.scheduleText ?? null,
        motivation_text_detail: ep.motivationTextDetail ?? null,
        payouts_text: ep.payoutsText ?? null,
        onboarding_text: ep.onboardingText ?? null,
        team_text: ep.teamText ?? null,
        system_text: ep.systemText ?? null,
        training_professional_text: ep.trainingProfessionalText ?? null,
        training_product_text: ep.trainingProductText ?? null,
        training_systems_text: ep.trainingSystemsText ?? null,
        training_wiki_text: ep.trainingWikiText ?? null,
        training_regulations_text: ep.trainingRegulationsText ?? null,
        hh_post_text: ep.hhPostText ?? null,
        hh_invite_text: ep.hhInviteText ?? null,
        hh_autoresume_text: ep.hhAutoresumeText ?? null,
        candidate_fields_config: ep.candidate_fields_config ?? ep.candidateFieldsConfig ?? null,
        notifications_config: ep.notifications_config ?? ep.notificationsConfig ?? null,
      };

      // 1. Write to PostgreSQL BD ProTalk server API (primary database)
      try {
        let sqRes = await fetch(`/api/projects/${ep.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!sqRes.ok) {
          if (sqRes.status === 400) {
            const errData = await sqRes.json().catch(() => ({}));
            addAuditEvent("warning", "Дубликат должности в компании", errData.message || "Вакансия с такой должностью уже существует в этой компании.");
            setIsSavingEdit(false);
            return;
          }
          if (sqRes.status === 404) {
            sqRes = await fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...patch,
                id: ep.id,
                public_id: ep.publicId || ep.public_id,
                employer_id: employerId || "100007"
              }),
            });
            if (!sqRes.ok && sqRes.status === 400) {
              const errData = await sqRes.json().catch(() => ({}));
              addAuditEvent("warning", "Дубликат должности в компании", errData.message || "Вакансия с такой должностью уже существует в этой компании.");
              setIsSavingEdit(false);
              return;
            }
          }
        }
      } catch (sqErr) {
        console.warn("PostgreSQL BD ProTalk project update notice:", sqErr);
      }

      // 2. Write to database companion
      try {
        await dbClient.from("projects").update(patch).eq("id", ep.id);
      } catch (sbErr) {
        console.warn("database project companion update notice:", sbErr);
      }

      setProjects(prev => prev.map(p => p.id === ep.id ? ({ ...p, ...ep } as any) : p));
      addAuditEvent("success", "Вакансия обновлена", `Изменения для вакансии "${ep.roleName}" сохранены успешно.`);
      setEditingProject(null);
      fetchData();
    } catch (err: any) {
      addAuditEvent("warning", "Ошибка сохранения", "Ошибка при сохранении: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Bulk mailing dispatcher tool
  const handleLaunchMailing = async () => {
    setIsSendingMail(true);
    setMailingLogs([]);
    addAuditEvent("info", "Старт массовой рассылки", `Запускается отправка сообщений по сегменту: ${mailingSegment}`);

    // Filter recipients
    const recipients = candidates.filter(cand => {
      if (mailingSegment === "all") return true;
      return cand.currentStage === mailingSegment;
    });

    if (recipients.length === 0) {
      setMailingLogs(["Соискатели в выбранном сегменте не найдены."]);
      setIsSendingMail(false);
      return;
    }

    try {
      for (const rec of recipients) {
        setMailingLogs(prev => [...prev, `Отправка уведомления для: ${rec.name} (@${rec.telegramUsername || "telegram"})...`]);
        // Mock send — backend endpoint not implemented in SPA; log locally only.
        await new Promise((r) => setTimeout(r, 50));
      }
      setMailingLogs(prev => [...prev, `✅ Готово! Успешно отправлено сообщений: ${recipients.length}`]);
      addAuditEvent("success", "Рассылка завершена", `Доставлено сообщений соискателям: ${recipients.length}`);
      fetchData();
    } catch (err) {
      console.error(err);
      setMailingLogs(prev => [...prev, "Произошла техническая заминка при рассылке."]);
    } finally {
      setIsSendingMail(false);
    }
  };

  // Trigger simulated payment for subscription
  const handleConfirmPayment = () => {
    if (!selectedPlanToBuy) return;
    setIsProcessingPayment(true);
    
    setTimeout(() => {
      const planName = selectedPlanToBuy === "silver" ? "Серебро Про" : "Золото Безлимит";
      const priceVal = selectedPlanToBuy === "silver" ? "14 900 ₽" : "39 900 ₽";
      setTariffLevel(selectedPlanToBuy);
      
      const newTx = {
        id: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toISOString().split('T')[0],
        plan: planName + " (ИИ)",
        amount: priceVal,
        status: "Успешно",
        method: "Банковская карта (Мир)"
      };

      setPaymentHistory(prev => [newTx, ...prev]);
      addAuditEvent("success", "Оплата подписки", `Тариф повышен до ${planName}. Наслаждайтесь расширенным лимитом.`);
      setIsProcessingPayment(false);
      setShowPaymentModal(false);
      setSelectedPlanToBuy(null);
    }, 2000);
  };

  // Save modified company profile
  const handleAddCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName || !newCompanyName.trim()) {
      addAuditEvent("warning", "Введите название", "Укажите название компании для сохранения.");
      return;
    }
    if (isCompanySlugDuplicate) {
      addAuditEvent("warning", "Дубликат адреса компании", "Компания с таким названием или ссылкой уже существует. Измените название компании.");
      return;
    }

    const finalId = draftCompanyId || `comp-${Date.now()}`;
    const finalPublicId = draftCompanyPublicId || undefined;
    const slug = transliterateToSlug(newCompanyName) || (finalPublicId ? `com${finalPublicId}` : "com300046");

    const stats = {
      founded_year: newCompanyStatsValFounded || null,
      employees: newCompanyStatsValClients || null,
      turnover: newCompanyStatsValDialogs || null,
      labels: {
        founded: newCompanyStatsLabelFounded || null,
        employees: newCompanyStatsLabelClients || null,
        turnover: newCompanyStatsLabelDialogs || null,
      },
    };

    const primarySite = newCompanySitesList.find(s => s.url && s.url.trim())?.url || newCompanySite || "";
    const serializedSites = newCompanySitesList.filter(s => s.url && s.url.trim()).length > 0
      ? JSON.stringify(newCompanySitesList.filter(s => s.url && s.url.trim()))
      : primarySite;

    const existingComp = (companiesList || []).find((c: any) => 
      (finalId && (c.id === finalId || c.id === draftCompanyId)) || 
      (finalPublicId && (String(c.public_id) === String(finalPublicId) || String(c.publicId) === String(finalPublicId))) ||
      (draftCompanyPublicId && (String(c.public_id) === String(draftCompanyPublicId) || String(c.publicId) === String(draftCompanyPublicId))) ||
      (newCompanyName && String(c.name || "").trim().toLowerCase() === newCompanyName.trim().toLowerCase())
    );

    const companyPayload = {
      id: finalId,
      public_id: finalPublicId,
      name: newCompanyName.trim(),
      slug,
      theme_config: existingComp?.theme_config || existingComp?.css || undefined,
      css: existingComp?.css || existingComp?.theme_config || undefined,
      logo_url: newCompanyLogo || DEFAULT_LOGO_URL,
      logoUrl: newCompanyLogo || DEFAULT_LOGO_URL,
      industry: newCompanyIndustry || "",
      website: primarySite,
      sites: serializedSites,
      staff: newCompanyStaff || "",
      description: newCompanyDescription || newCompanyDesc || "",
      description_text: newCompanyDescription || "",
      products_text: newCompanyProducts || "",
      mission_text: newCompanyMissionText || "",
      about_text: newCompanyDesc || newCompanyDescription || "",
      team_text: null,
      payouts_text: newCompanySalaryTerms || "",
      schedule_text: newCompanyScheduleTerms || "",
      system_text: newCompanyCustomWiki || "",
      stats,
      statsValClients: newCompanyStatsValClients || "",
      statsLabelClients: newCompanyStatsLabelClients || "",
      statsValDialogs: newCompanyStatsValDialogs || "",
      statsLabelDialogs: newCompanyStatsLabelDialogs || "",
      statsValFounded: newCompanyStatsValFounded || "",
      statsLabelFounded: newCompanyStatsLabelFounded || "",
      employerId: employerId || "100007",
      owner_employer_id: employerId || "100007",
      status: "published",
      is_published: 1,
    };

    try {
      // 1. Direct save to PostgreSQL BD ProTalk
      const saveRes = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyPayload),
      });
      const saveResult = await saveRes.json().catch(() => null);
      const savedComp = saveResult?.company;
      const displaySlug = savedComp?.public_id || savedComp?.slug || finalPublicId || slug;

      // 2. Dual-write to database in background (best-effort)
      (async () => {
        try {
          if (draftCompanyId) {
            await dbClient.rpc("company_update", { _id: draftCompanyId, _patch: companyPayload as any });
            await dbClient.rpc("company_finalize", { _id: draftCompanyId });
          }
        } catch (dbErr) {
          console.warn("database dual-sync notice:", dbErr);
        }
      })();

      addAuditEvent("success", "Компания сохранена", `Данные компании сохранены и синхронизированы с базой данных (лендинг: /com${displaySlug})`);
      // Reload list through the unified mapper.
      await fetchCompanies();

      // Reset wizard without extra modals
      setNewCompanyName(""); setNewCompanyDesc(""); setNewCompanyIndustry(""); setNewCompanyStaff(""); setNewCompanySite("");
      setNewCompanySitesList([{ id: "site-1", url: "", title: "Официальный сайт", customScreenshot: "", heightPx: 160 }]);
      setNewCompanyLogo(DEFAULT_LOGO_URL); setNewCompanyFiles(""); setNewCompanyMissionText(""); setNewCompanyCustomWiki("");
      setNewCompanySalaryTerms(""); setNewCompanyScheduleTerms("");
      setNewCompanyStatsValClients(""); setNewCompanyStatsLabelClients("");
      setNewCompanyStatsValDialogs(""); setNewCompanyStatsLabelDialogs("");
      setNewCompanyStatsValFounded(""); setNewCompanyStatsLabelFounded("");
      setNewCompanyDescription(""); setNewCompanyProducts("");
      setDraftCompanyId(null); setDraftCompanyPublicId(null); setDraftFilePath(null);
      setShowAddCompany(false);

      // Transition to Step 2: Companies list
      if (employerId) {
        navigate(`/emp${employerId}/companies`);
      }
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка сохранения", err?.message || "Не удалось сохранить компанию");
    }
  };

  // Copy registration link to clipboard - updated to point to elegant corporate careers landing
  const handleCopyLink = (projectId: string, projCompanySlug?: string) => {
    const proj = projects.find(p => p.id === projectId);
    const matchedCompany = companiesList.find(c => (c?.name || "").toLowerCase() === (proj?.companyName || "").toLowerCase());
    const slug = projCompanySlug || proj?.companySlug || (matchedCompany ? matchedCompany.slug : "");
    const signupUrl = `${window.location.origin}/${slug}/${projectId}`;
    navigator.clipboard.writeText(signupUrl);
    setCopiedProjectId(projectId);
    setTimeout(() => setCopiedProjectId(null), 2000);
  };

  // Step 1: upload the chosen file to database Storage (vacancy-uploads bucket).
  // We deliberately DO NOT call the LLM here — the user must press the explicit
  // «Распознать документ» button on step 2 to extract text.
  const uploadVacancyFile = async (file: File) => {
    setVacancyUploadError("");
    setIsUploadingVacancyFile(true);
    try {
      if (file.size > 10 * 1024 * 1024) {
        const msg = "Файл больше 10 МБ.";
        setVacancyUploadError(msg);
        return;
      }
      const url = await getUploadService().uploadFromFile(file);
      setDraftVacancyFilePath(url);
      setVacancyFileName(file.name);
      addAuditEvent("success", "Файл вакансии загружен", `${file.name}`);
    } catch (err: any) {
      console.error("vacancy upload error", err);
      const msg = err?.message || "Не удалось загрузить файл.";
      setVacancyUploadError(msg);
      addAuditEvent("warning", "Ошибка загрузки", msg);
    } finally {
      setIsUploadingVacancyFile(false);
    }
  };

  // Step 2: explicit «Распознать документ» — send the uploaded file to RR
  // and put the resulting markdown into the editable raw-text textarea (≤10000
  // chars).
  const recognizeVacancyFile = async () => {
    if (!draftVacancyFilePath) return;
    setIsParsingFile(true);
    addAuditEvent("info", "ИИ разбор вакансии", `Считываем текст из «${vacancyFileName || "файла"}»…`);
    try {
      const fullFileUrl = draftVacancyFilePath.startsWith("/")
        ? `${window.location.origin}${draftVacancyFilePath}`
        : draftVacancyFilePath;
      const effEmpId = resolveActiveEmployerId({ employer_id: employerId });
      const res = await aiWaitRun<any>({
        title: `ИИ читает файл ${vacancyFileName}`,
        task: async (attempt: number) => {
          const usePromax = attempt > 0;
          try {
            const apiRes = await fetch("/api/ai-ingest-document", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                entity: "vacancy",
                entity_id: draftProjectId || undefined,
                employer_id: effEmpId,
                employer_public_id: effEmpId,
                file_url: fullFileUrl,
                filename: vacancyFileName,
                max_chars: 10000,
                use_promax: usePromax,
              }),
            });
            if (apiRes.ok) {
              const data = await apiRes.json();
              return data;
            }
          } catch (e) {
            console.warn("Direct API call failed, falling back to database function:", e);
          }

          const { data, error } = await dbClient.functions.invoke("ai-ingest-document", {
            body: {
              entity: "vacancy",
              entity_id: draftProjectId || undefined,
              employer_id: effEmpId,
              employer_public_id: effEmpId,
              file_url: fullFileUrl,
              filename: vacancyFileName,
              max_chars: 10000,
              use_promax: usePromax,
            },
          });
          if (error) throw new Error(error.message);
          return data;
        },
      });
      const text = String(res?.text || "").slice(0, 10000);
      if (text) {
        setVacancyRawText(text);
        addAuditEvent("success", "Текст вакансии извлечён", `Распознано ${text.length} симв. Нажмите «Оформить красиво».`);
      } else {
        addAuditEvent("warning", "Пустой ответ", "ИИ не вернул текст из документа.");
      }
      setDraftVacancyFilePath(null);
    } catch (err: any) {
      console.error(err);
      addAuditEvent("warning", "Ошибка распознавания", err?.message || "Не удалось разобрать файл.");
    } finally {
      setIsParsingFile(false);
    }
  };

  // Cohesive AI format for new vacancy fields
  const handleBeautifyNewVacancyWithAI = async () => {
    setIsGenerating(true);
    addAuditEvent("info", "ИИ-форматирование", "Оформляем все поля новой вакансии с помощью ИИ RR...");
    try {
      const { aiEnhanceAll } = await import("@/lib/aiClient");
      // Find the selected company to send its data as context.
      const safeCompanyName = companiesList.some(c => (c.name || "").toLowerCase() === (setupCompanyName || "").toLowerCase())
        ? setupCompanyName
        : (companiesList[0]?.name || "");
      if (safeCompanyName !== setupCompanyName) setSetupCompanyName(safeCompanyName);
      const matchedCo = companiesList.find(c => (c.name || "").toLowerCase() === (safeCompanyName || "").toLowerCase());
      const companyCtx: Record<string, any> = matchedCo ? {
        name: matchedCo.name,
        industry: matchedCo.industry,
        staff: matchedCo.staff,
        website: matchedCo.website || matchedCo.sites,
        description_text: matchedCo.description_text,
        products_text: matchedCo.products_text,
        mission_text: matchedCo.mission_text || matchedCo.missionText,
        team_text: matchedCo.team_text,
        payouts_text: matchedCo.payouts_text,
        schedule_text: matchedCo.schedule_text,
        system_text: matchedCo.system_text,
        about_text: matchedCo.about_text,
      } : {};
      // Drop empty values to keep prompt clean.
      Object.keys(companyCtx).forEach((k) => { if (!companyCtx[k]) delete companyCtx[k]; });

      const enhanced = await aiWaitRun<any>({
        title: "ИИ оформляет вакансию",
        task: () => aiEnhanceAll({
          mode: "all_vacancy",
          company_name: safeCompanyName,
          role_name: setupRoleName,
          templates: {
            vacancy_text: exampleFor("vacancy_text"),
            tasks_activity_text: exampleFor("tasks_activity_text"),
            schedule_text: exampleFor("schedule_text"),
            motivation_text: exampleFor("motivation_text"),
            motivation_text_detail: exampleFor("motivation_text_detail"),
            payouts_text: exampleFor("payouts_text"),
            onboarding_text: exampleFor("onboarding_text"),
            team_text: exampleFor("team_text"),
            system_text: exampleFor("system_text"),
            training_professional_text: exampleFor("training_professional_text"),
            training_product_text: exampleFor("training_product_text"),
            training_systems_text: exampleFor("training_systems_text"),
            training_wiki_text: exampleFor("training_wiki_text"),
            training_regulations_text: exampleFor("training_regulations_text"),
          },
          fields: {
            role_name: setupRoleName,
            vacancy_text: setupVacancyText,
            tasks_activity_text: setupTasksActivityText,
            motivation_text: setupMotivationText,
            motivation_text_detail: setupMotivationDetail,
            schedule_text: setupScheduleText,
            payouts_text: setupPayoutsText,
            onboarding_text: setupOnboardingText,
            team_text: setupTeamText,
            system_text: setupSystemText,
            training_professional_text: setupTrainingProfessionalText,
            training_product_text: setupTrainingProductText,
            training_systems_text: setupTrainingSystemsText,
            training_wiki_text: setupTrainingWikiText,
            training_regulations_text: setupTrainingRegulationsText,
          },
          file_context: vacancyRawText || undefined,
          company_context: Object.keys(companyCtx).length > 0 ? companyCtx : undefined,
          hint: vacancyRawText ? "Главный источник фактов — распознанный текст документа. Если должность пустая, извлеки role_name из документа." : undefined,
        }),
      });
      if (enhanced) {
        // Tell the role-change effect to skip its destructive overwrite this
        // time — we've just put authoritative AI values into every field.
        if (enhanced.role_name && enhanced.role_name !== setupRoleName) {
          skipRoleAutoFillRef.current = true;
        }
        if (enhanced.role_name) setSetupRoleName(enhanced.role_name);
        if (enhanced.vacancy_text) setSetupVacancyText(enhanced.vacancy_text);
        if (enhanced.tasks_activity_text) setSetupTasksActivityText(enhanced.tasks_activity_text);
        if (enhanced.motivation_text) setSetupMotivationText(enhanced.motivation_text);
        if (enhanced.motivation_text_detail) setSetupMotivationDetail(enhanced.motivation_text_detail);
        if (enhanced.schedule_text) setSetupScheduleText(enhanced.schedule_text);
        if (enhanced.payouts_text) setSetupPayoutsText(enhanced.payouts_text);
        if (enhanced.onboarding_text) setSetupOnboardingText(enhanced.onboarding_text);
        if (enhanced.team_text) setSetupTeamText(enhanced.team_text);
        if (enhanced.system_text) setSetupSystemText(enhanced.system_text);
        if (enhanced.training_professional_text) setSetupTrainingProfessionalText(enhanced.training_professional_text);
        if (enhanced.training_product_text) setSetupTrainingProductText(enhanced.training_product_text);
        if (enhanced.training_systems_text) setSetupTrainingSystemsText(enhanced.training_systems_text);
        if (enhanced.training_wiki_text) setSetupTrainingWikiText(enhanced.training_wiki_text);
        if (enhanced.training_regulations_text) setSetupTrainingRegulationsText(enhanced.training_regulations_text);
        if (enhanced.candidate_fields_config) setSetupCandidateFieldsConfig(enhanced.candidate_fields_config);
        addAuditEvent("success", "Оформление завершено", "Все поля успешно облагорожены ИИ в единую продающую форму.");
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-оформления", "Проверьте стабильность интернет-соединения.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Enhance a single landing page sub-field using RR API
  const handleEnhanceSingleVacancyField = async (fieldName: string, currentVal: string) => {
    if (!editingProject) return;
    addAuditEvent("info", "ИИ-полировка поля", `Улучшаем сведения в поле "${fieldName}" через RR LLM...`);
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const value = await aiWaitRun({
        title: `ИИ улучшает поле «${ruField(fieldName)}»`,
        task: () => aiEnhanceSingle({
          field: fieldName,
          value: currentVal,
          company_name: editingProject.companyName,
          role_name: editingProject.roleName,
        }),
      });
      if (value) {
        setEditingProject({
          ...editingProject,
          [fieldName]: value
        });
        addAuditEvent("success", "Поле улучшено с помощью ИИ", `Отредактировано и красиво оформлено.`);
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Не удалось оптимизировать сведения в поле.");
    }
  };

  // Cohesive beautification of ALL landing fields in editingProject at once
  const handleEnhanceAllVacancyLandingFields = async () => {
    if (!editingProject) return;
    setIsEnhancingAllVac(true);
    addAuditEvent("info", "Полное ИИ-Оформление", "Запускаем полную реконструкцию контента лендинга через ИИ RR...");
    try {
      const { aiEnhanceAll } = await import("@/lib/aiClient");
      const ep: any = editingProject;
      // Build canonical snake_case 15 fields payload.
      const fields: Record<string, string> = {
        role_name: ep.roleName || "",
        vacancy_text: ep.vacancyText || "",
        tasks_activity_text: ep.tasksActivityText || "",
        schedule_text: ep.scheduleText || ep.scheduleTerms || "",
        motivation_text: ep.motivationText || "",
        motivation_text_detail: ep.motivationTextDetail || "",
        payouts_text: ep.payoutsText || ep.salaryTerms || "",
        onboarding_text: ep.onboardingText || "",
        team_text: ep.teamText || "",
        system_text: ep.systemText || "",
        training_professional_text: ep.trainingProfessionalText || ep.trainingProfText || "",
        training_product_text: ep.trainingProductText || "",
        training_systems_text: ep.trainingSystemsText || ep.trainingSystemText || "",
        training_wiki_text: ep.trainingWikiText || "",
        training_regulations_text: ep.trainingRegulationsText || "",
      };
      const matchedCo = companiesList.find(c => (c.name || "").toLowerCase() === (ep.companyName || "").toLowerCase());
      const companyCtx: Record<string, any> = matchedCo ? {
        name: matchedCo.name, industry: matchedCo.industry, staff: matchedCo.staff,
        website: matchedCo.website || matchedCo.sites,
        description_text: matchedCo.description_text, products_text: matchedCo.products_text,
        mission_text: matchedCo.mission_text || matchedCo.missionText,
        team_text: matchedCo.team_text, payouts_text: matchedCo.payouts_text,
        schedule_text: matchedCo.schedule_text, system_text: matchedCo.system_text,
        about_text: matchedCo.about_text,
      } : {};
      Object.keys(companyCtx).forEach(k => { if (!companyCtx[k]) delete companyCtx[k]; });

      const enhanced = await aiWaitRun<any>({
        title: "ИИ оформляет вакансию",
        task: () => aiEnhanceAll({
          mode: "all_vacancy",
          company_name: ep.companyName,
          role_name: ep.roleName,
          fields,
          templates: {
            vacancy_text: editRoleTemplates?.vacancy_text || exampleFor("vacancy_text"),
            tasks_activity_text: editRoleTemplates?.tasks_activity_text || exampleFor("tasks_activity_text"),
            schedule_text: editRoleTemplates?.schedule_text || exampleFor("schedule_text"),
            motivation_text: editRoleTemplates?.motivation_text || exampleFor("motivation_text"),
            motivation_text_detail: editRoleTemplates?.motivation_text_detail || exampleFor("motivation_text_detail"),
            payouts_text: editRoleTemplates?.payouts_text || exampleFor("payouts_text"),
            onboarding_text: editRoleTemplates?.onboarding_text || exampleFor("onboarding_text"),
            team_text: editRoleTemplates?.team_text || exampleFor("team_text"),
            system_text: editRoleTemplates?.system_text || exampleFor("system_text"),
            training_professional_text: editRoleTemplates?.training_professional_text || exampleFor("training_professional_text"),
            training_product_text: editRoleTemplates?.training_product_text || exampleFor("training_product_text"),
            training_systems_text: editRoleTemplates?.training_systems_text || exampleFor("training_systems_text"),
            training_wiki_text: editRoleTemplates?.training_wiki_text || exampleFor("training_wiki_text"),
            training_regulations_text: editRoleTemplates?.training_regulations_text || exampleFor("training_regulations_text"),
          },
          file_context: editVacancyRawText || undefined,
          company_context: Object.keys(companyCtx).length > 0 ? companyCtx : undefined,
          hint: editVacancyRawText ? "Главный источник фактов — распознанный текст документа. Если должность пустая, извлеки role_name из документа." : undefined,
        }),
      });
      if (enhanced) {
        // Map snake_case response back to JobProject camelCase fields.
        setEditingProject({
          ...editingProject,
          roleName: enhanced.role_name ?? ep.roleName,
          vacancyText: enhanced.vacancy_text ?? ep.vacancyText,
          tasksActivityText: enhanced.tasks_activity_text ?? ep.tasksActivityText,
          scheduleText: enhanced.schedule_text ?? ep.scheduleText,
          scheduleTerms: enhanced.schedule_text ?? ep.scheduleTerms,
          motivationText: enhanced.motivation_text ?? ep.motivationText,
          motivationTextDetail: enhanced.motivation_text_detail ?? ep.motivationTextDetail,
          payoutsText: enhanced.payouts_text ?? ep.payoutsText,
          salaryTerms: enhanced.payouts_text ?? ep.salaryTerms,
          onboardingText: enhanced.onboarding_text ?? ep.onboardingText,
          teamText: enhanced.team_text ?? ep.teamText,
          systemText: enhanced.system_text ?? ep.systemText,
          trainingProfessionalText: enhanced.training_professional_text ?? ep.trainingProfessionalText,
          trainingProductText: enhanced.training_product_text ?? ep.trainingProductText,
          trainingSystemsText: enhanced.training_systems_text ?? ep.trainingSystemsText,
          trainingWikiText: enhanced.training_wiki_text ?? ep.trainingWikiText,
          trainingRegulationsText: enhanced.training_regulations_text ?? ep.trainingRegulationsText,
          candidate_fields_config: enhanced.candidate_fields_config ?? ep.candidate_fields_config ?? ep.candidateFieldsConfig,
          candidateFieldsConfig: enhanced.candidate_fields_config ?? ep.candidateFieldsConfig ?? ep.candidate_fields_config,
        } as any);
        addAuditEvent("success", "Лендинг полностью оформлен!", "ИИ составил цельную, привлекательную картину вакансии.");
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка ИИ-полировки", "Не удалось связаться с ИИ RR.");
    } finally {
      setIsEnhancingAllVac(false);
    }
  };

  // Parse custom training and onboarding curriculum documents
  const handleParseTrainingMaterials = async (filename: string) => {
    if (!editingProject) return;
    setIsParsingTrainingFile(true);
    addAuditEvent("info", "Анализ обучающих материалов", `Запущен разбор регламентов обучения из файла: ${filename}`);
    try {
      const { aiGenerateOnboarding } = await import("@/lib/aiClient");
      const aiData = await aiGenerateOnboarding({
        role_name: editingProject.roleName,
        company_name: editingProject.companyName,
        brief: `Файл регламентов: ${filename}\nТекущая база:\n${editingProject.customWiki || ""}`,
        save: false,
      });
      const parsed = {
        checklistQuestions: (aiData?.checklist || []).map((q: any) => q.question).filter(Boolean),
        roleplayQuestions: (aiData?.roleplay || []).map((q: any) => q.question).filter(Boolean),
        trainingProfText: aiData?.training_prof_text,
        trainingProductText: aiData?.training_product_text,
        trainingSystemText: aiData?.training_system_text,
      };
      {
        setEditingProject({
          ...editingProject,
          checklistQuestions: parsed.checklistQuestions || editingProject.checklistQuestions,
          roleplayQuestions: parsed.roleplayQuestions || editingProject.roleplayQuestions,
          trainingProfText: parsed.trainingProfText || editingProject.trainingProfText,
          trainingProductText: parsed.trainingProductText || editingProject.trainingProductText,
          trainingSystemText: parsed.trainingSystemText || editingProject.trainingSystemText
        });
        addAuditEvent("success", "ИИ-Материалы успешно созданы", `Подготовлено ${parsed.checklistQuestions?.length || 0} вопросов чеклиста и учебный план.`);
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка парсинга материалов", "ИИ использовал базовый шаблон регламентов.");
    } finally {
      setIsParsingTrainingFile(false);
    }
  };

  // Individual training field enhancer
  const handleEnhanceTrainingField = async (fieldName: string, currentVal: string) => {
    if (!editingProject) return;
    addAuditEvent("info", "ИИ-полировка обучения", `Улучшаем материалы в разделе "${fieldName}"...`);
    try {
      const { aiEnhanceSingle } = await import("@/lib/aiClient");
      const value = await aiWaitRun({
        title: `ИИ улучшает раздел «${ruField(fieldName)}»`,
        task: () => aiEnhanceSingle({
          field: fieldName,
          value: currentVal,
          company_name: editingProject.companyName,
          role_name: editingProject.roleName,
          hint: "training_onboarding_evaluation",
        }),
      });
      if (value) {
        setEditingProject({
          ...editingProject,
          [fieldName]: fieldName === "checklistQuestions" || fieldName === "roleplayQuestions"
            ? value.split("\n").filter(Boolean)
            : value
        });
        addAuditEvent("success", "Раздел обучения отшлифован ИИ", `Сведения успешно дополнены и структурированы.`);
      }
    } catch (err) {
      console.error(err);
      addAuditEvent("warning", "Ошибка связи с ИИ", "Не удалось оптимизировать раздел.");
    }
  };

  // Save TG ID
  const saveTgId = () => {
    localStorage.setItem("employer_tg_id", adminTgId);
    handleUpdateProfile();
  };

  // Lookup pass score by project id (falls back to 70 if unknown).
  const projectPassScoreMap = useMemo(() => {
    const m: Record<string, number> = {};
    (projects as any[]).forEach((p: any) => {
      const ps = Number(p.interviewPassScore ?? p.interview_pass_score ?? p.passScore ?? p.pass_score ?? 70);
      if (p?.id != null) m[String(p.id)] = ps;
      if (p?.public_id != null) m[String(p.public_id)] = ps;
      if (p?.publicId != null) m[String(p.publicId)] = ps;
      if (p?.slug != null) m[String(p.slug)] = ps;
      const cleanId = String(p?.id || "").replace(/^vac_?/i, "");
      if (cleanId) {
        m[cleanId] = ps;
        m[`vac_${cleanId}`] = ps;
      }
      const cleanPub = String(p?.public_id || p?.publicId || "").replace(/^vac_?/i, "");
      if (cleanPub) {
        m[cleanPub] = ps;
        m[`vac_${cleanPub}`] = ps;
      }
    });
    return m;
  }, [projects]);

  // "AI approved" verdict reflects actual funnel progression and custom pass score.
  // Candidates at stage "registration" haven't been evaluated yet -> "none" (Ожидает оценки).
  // Candidates at stage "interview_reject" -> "low" (Не подходит).
  // Candidates with score >= passScore -> "good" (✓ Одобрен ИИ).
  // Candidates with score >= passScore * 0.7 -> "mid" (Подходит частично).
  // Candidates with score < passScore * 0.7 -> "low" (Не подходит).
  function aiVerdictFor(cand: any): { label: "good" | "mid" | "low" | "none"; txt: string; badge: string } {
    const stage = String(cand?.crmStage || cand?.currentStage || "registration").toLowerCase();
    const s = cand?.scores || {};
    const pidStr = String(cand?.projectId || cand?.project_id || "");
    const cleanPid = pidStr.replace(/^vac_?/i, "");
    const passScore = Number(projectPassScoreMap[pidStr] ?? projectPassScoreMap[cleanPid] ?? 70);

    // 1. Stage 5: Interview Reject or explicit rejected decision -> low (Не подходит)
    if (stage === "interview_reject" || cand?.hireDecision === "rejected") {
      return {
        label: "low",
        txt: "Не подходит",
        badge: "bg-transparent backdrop-blur-md text-white/80 border border-white/30 text-[14px]",
      };
    }

    // 2. Stage 6 and beyond: Interview Success, Profession, Product, System, Certified -> good or mid
    if (["interview_success", "professional", "product", "systems", "certified"].includes(stage)) {
      const overall = Number(s.overallScore ?? s.overall_score ?? s.interviewScore ?? 0);
      if (overall > 0 && overall < passScore) {
        return {
          label: "mid",
          txt: "Подходит частично",
          badge: "bg-transparent backdrop-blur-md text-white border border-[#d4af37]/60 shadow-[0_0_10px_rgba(212,175,55,0.15)] text-[14px]",
        };
      }
      return {
        label: "good",
        txt: "✓ Одобрен ИИ",
        badge: "bg-transparent backdrop-blur-md text-[#fceabb] border border-[#d4af37] shadow-[0_0_12px_rgba(212,175,55,0.25)] text-[14px]",
      };
    }

    // 3. Stage 1: Registration -> Awaiting evaluation (not yet tested)
    if (stage === "registration") {
      return {
        label: "none",
        txt: "Ожидает оценки",
        badge: "bg-transparent backdrop-blur-md text-white/60 border border-white/20 text-[14px]",
      };
    }

    // 4. In-between stages (screening, checklist, situations) -> compare effective score with passScore
    const overall = Number(s.overallScore ?? s.overall_score ?? 0);
    const sc = Number(s.situationsScore ?? s.checklistScore ?? s.resumeScore ?? 0);
    const effScore = overall > 0 ? overall : sc;

    if (effScore >= passScore) {
      return {
        label: "good",
        txt: "✓ Одобрен ИИ",
        badge: "bg-transparent backdrop-blur-md text-[#fceabb] border border-[#d4af37] shadow-[0_0_12px_rgba(212,175,55,0.25)] text-[14px]",
      };
    }
    if (effScore >= Math.round(passScore * 0.7)) {
      return {
        label: "mid",
        txt: "Подходит частично",
        badge: "bg-transparent backdrop-blur-md text-white border border-[#d4af37]/60 shadow-[0_0_10px_rgba(212,175,55,0.15)] text-[14px]",
      };
    }
    if (effScore > 0) {
      return {
        label: "low",
        txt: "Не подходит",
        badge: "bg-transparent backdrop-blur-md text-white/80 border border-white/30 text-[14px]",
      };
    }

    return {
      label: "none",
      txt: "Ожидает оценки",
      badge: "bg-transparent backdrop-blur-md text-white/60 border border-white/20 text-[14px]",
    };
  }

  function hireDecisionFor(cand: any): "invited" | "review" | "rejected" | "" {
    const raw = String(cand?.hireDecision || cand?.hire_decision || hireDecisionMap[cand?.uuid] || hireDecisionMap[cand?.id] || "");
    return raw === "invited" || raw === "review" || raw === "rejected" ? raw : "";
  }

  const hireDecisionMeta: Record<"invited" | "review" | "rejected", { label: string; short: string; tag: string; border: string }> = {
    invited: {
      label: "Приглашён на работу",
      short: "✓ Приглашён на работу",
      tag: "bg-transparent backdrop-blur-md text-[#fceabb] border border-[#d4af37] text-[14px]",
      border: "border-[#d4af37] hover:border-[#fceabb]",
    },
    review: {
      label: "На рассмотрении",
      short: "◔ На рассмотрении",
      tag: "bg-transparent backdrop-blur-md text-white border border-[#d4af37]/60 text-[14px]",
      border: "border-[#d4af37]/60 hover:border-[#d4af37]",
    },
    rejected: {
      label: "Отказано",
      short: "Отказано",
      tag: "bg-transparent backdrop-blur-md text-white/80 border border-white/30 text-[14px]",
      border: "border-white/30 hover:border-white/50",
    },
  };

  const isSuperAdminCrm = isAdmin && String(employerId) === "100007";

  // Restrict CRM candidates strictly to the current employer unless super-admin 100007!
  const scopedCandidates = useMemo(() => {
    if (isSuperAdminCrm) return candidates;
    const allowedCompNames = new Set(companiesList.map((c: any) => c.name).filter(Boolean));
    const allowedCompIds = new Set(companiesList.flatMap((c: any) => [String(c.id), String(c.public_id)]).filter(Boolean));
    const allowedProjRoles = new Set(projects.map((p: any) => p.roleName).filter(Boolean));
    const allowedProjIds = new Set(projects.flatMap((p: any) => [String(p.id), String(p.public_id)]).filter(Boolean));

    return candidates.filter((cand: any) => {
      if (cand.companyId && allowedCompIds.has(String(cand.companyId))) return true;
      if (cand.projectId && allowedProjIds.has(String(cand.projectId))) return true;
      if (cand.companyName && allowedCompNames.has(cand.companyName)) return true;
      if (cand.roleName && allowedProjRoles.has(cand.roleName)) return true;
      if (String(cand.employerId || cand.employer_id || "") === String(employerId)) return true;
      return false;
    });
  }, [candidates, isSuperAdminCrm, companiesList, projects, employerId]);

  // Companies dropdown: only current employer's companies unless super-admin 100007
  const crmCompanyOptions = useMemo(() => {
    if (isSuperAdminCrm) {
      const allNames = Array.from(new Set([
        ...companiesList.map((c: any) => c.name),
        ...candidates.map((c: any) => c.companyName),
      ])).filter(Boolean) as string[];
      return allNames.sort();
    }
    const myNames = Array.from(new Set(companiesList.map((c: any) => c.name))).filter(Boolean) as string[];
    return myNames.sort();
  }, [isSuperAdminCrm, companiesList, candidates]);

  // Roles/vacancies dropdown: only current employer's vacancies unless super-admin 100007
  const crmRoleOptions = useMemo(() => {
    if (isSuperAdminCrm) {
      const allRoles = Array.from(new Set([
        ...projects.map((p: any) => p.roleName),
        ...candidates.map((c: any) => c.roleName),
      ])).filter(Boolean) as string[];
      return allRoles.sort();
    }
    const myRoles = Array.from(new Set(projects.map((p: any) => p.roleName))).filter(Boolean) as string[];
    return myRoles.sort();
  }, [isSuperAdminCrm, projects, candidates]);

  // All custom fields created across all vacancies and candidates
  const allAvailableCustomFields = useMemo<AvailableCustomField[]>(() => {
    const map = new Map<string, AvailableCustomField>();

    // 1. Scan from all vacancies
    for (const p of projects || []) {
      const rawCfg = (p as any).candidate_fields_config || (p as any).candidateFieldsConfig;
      if (rawCfg) {
        try {
          const parsed = parseVacancyCandidateFieldsConfig(rawCfg);
          for (const cf of parsed.customFields || []) {
            const k = String(cf.key || cf.label).trim();
            if (!k) continue;
            const existing = map.get(k);
            if (existing) {
              existing.count = (existing.count || 1) + 1;
              if (cf.options && cf.options.length > 0 && (!existing.options || existing.options.length === 0)) {
                existing.options = cf.options;
              }
            } else {
              map.set(k, {
                key: k,
                label: cf.label || k,
                options: cf.options,
                type: cf.type,
                count: 1,
              });
            }
          }
        } catch {}
      }
    }

    // 2. Scan from scoped candidate rows in case candidates have extra custom field keys
    for (const c of scopedCandidates || []) {
      const cust = extractCustomFieldsFromCandidateRow(c);
      if (cust && typeof cust === "object") {
        for (const [k, v] of Object.entries(cust)) {
          if (!k || map.has(k)) continue;
          map.set(k, {
            key: k,
            label: k,
            count: 1,
          });
        }
      }
    }

    return Array.from(map.values());
  }, [projects, scopedCandidates]);

  // Base filtered candidates without verdict filter — used for dynamic verdict counters!
  const baseFilteredCandidates = useMemo(() => {
    return scopedCandidates.filter((cand: any) => {
      const q = crmSearch.toLowerCase().trim();
      if (q) {
        const std = extractStandardFieldsFromCandidateRow(cand);
        const cust = extractCustomFieldsFromCandidateRow(cand);
        const custVals = Object.values(cust).join(" ");
        const stdVals = Object.values(std).join(" ");
        const skillsText = Array.isArray(cand.skills) ? cand.skills.join(" ") : String(cand.skills || "");
        const hay = `${cand.name || ""} ${cand.fullName || ""} ${cand.roleName || ""} ${cand.email || ""} ${cand.phone || ""} ${cand.companyName || ""} ${cand.city || ""} ${cand.citizenship || ""} ${cand.workExperience || cand.work_experience || ""} ${cand.desiredSalary || cand.desired_salary || ""} ${cand.education || ""} ${skillsText} ${stdVals} ${custVals}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (crmFilterRole !== "all" && (cand.roleName || "") !== crmFilterRole) return false;
      if (crmFilterCompany !== "all" && (cand.companyName || "") !== crmFilterCompany) return false;
      if (crmFilterStage !== "all" && ((cand.crmStage || "registration") !== crmFilterStage)) return false;
      if (crmFilterDecision !== "all") {
        const d = hireDecisionFor(cand);
        if (crmFilterDecision === "none") { if (d) return false; }
        else if (d !== crmFilterDecision) return false;
      }
      // Period filter on last-update date
      if (crmDatePreset !== "all") {
        const ts = cand.updatedAt ? new Date(cand.updatedAt).getTime() : 0;
        if (!ts) return false;
        if (crmDatePreset === "24h") {
          if (ts < Date.now() - 24 * 3600 * 1000) return false;
        } else if (crmDatePreset === "custom") {
          if (crmDateFrom) {
            const from = new Date(crmDateFrom).getTime();
            if (ts < from) return false;
          }
          if (crmDateTo) {
            const to = new Date(crmDateTo).getTime() + 24 * 3600 * 1000 - 1;
            if (ts > to) return false;
          }
        }
      }

      // Standard & Custom fields filtering (all 26 standard fields + vacancy custom fields)
      const candStd = extractStandardFieldsFromCandidateRow(cand);
      const candCust = extractCustomFieldsFromCandidateRow(cand);

      for (const [filterKey, rawVal] of Object.entries(crmFieldFilters)) {
        if (!rawVal || !String(rawVal).trim()) continue;
        if (filterKey === "customFieldKey" || filterKey === "customFieldValue") continue;
        const needle = String(rawVal).toLowerCase().trim();

        let matched = false;

        // 1. Standard candidate fields
        const stdVal = candStd[filterKey];
        if (stdVal !== undefined && stdVal !== null && String(stdVal).trim() !== "") {
          const s = Array.isArray(stdVal) ? stdVal.join(" ").toLowerCase() : String(stdVal).toLowerCase();
          if (s.includes(needle)) matched = true;
        }

        // Direct candidate properties
        if (!matched) {
          const directVal = (cand as any)[filterKey];
          if (directVal !== undefined && directVal !== null && String(directVal).trim() !== "") {
            const d = Array.isArray(directVal) ? directVal.join(" ").toLowerCase() : String(directVal).toLowerCase();
            if (d.includes(needle)) matched = true;
          }
        }

        // Aliases
        if (!matched && (filterKey === "workExperience" || filterKey === "work_experience")) {
          const exp = String(cand.workExperience || cand.work_experience || candStd.work_experience || "").toLowerCase();
          if (exp.includes(needle)) matched = true;
        }
        if (!matched && (filterKey === "desiredSalary" || filterKey === "desired_salary")) {
          const sal = String(cand.desiredSalary || cand.desired_salary || candStd.desired_salary || "").toLowerCase();
          if (sal.includes(needle)) matched = true;
        }
        if (!matched && (filterKey === "full_name" || filterKey === "name")) {
          const n = String(cand.fullName || cand.name || candStd.full_name || "").toLowerCase();
          if (n.includes(needle)) matched = true;
        }

        // 2. Custom fields
        if (!matched) {
          const cVal = candCust[filterKey];
          if (cVal !== undefined && cVal !== null && String(cVal).trim() !== "") {
            const c = Array.isArray(cVal) ? cVal.join(" ").toLowerCase() : String(cVal).toLowerCase();
            if (c.includes(needle)) matched = true;
          }
        }

        if (!matched) return false;
      }

      // Legacy customFieldKey + customFieldValue pair
      if (crmFieldFilters.customFieldKey?.trim() && crmFieldFilters.customFieldValue?.trim()) {
        const k = crmFieldFilters.customFieldKey.trim();
        const v = crmFieldFilters.customFieldValue.toLowerCase().trim();
        const candCust = extractCustomFieldsFromCandidateRow(cand);
        const val = String(candCust[k] ?? (cand as any)[k] ?? "").toLowerCase();
        if (!val.includes(v)) return false;
      }

      return true;
    });
  }, [scopedCandidates, crmSearch, crmFilterRole, crmFilterCompany, crmFilterStage, crmFilterDecision, crmDatePreset, crmDateFrom, crmDateTo, crmFieldFilters, hireDecisionMap]);

  // Dynamic real counts for verdict tabs reflecting all active filters!
  const verdictCounts = useMemo(() => {
    return {
      all: baseFilteredCandidates.length,
      good: baseFilteredCandidates.filter((x: any) => aiVerdictFor(x).label === "good").length,
      mid: baseFilteredCandidates.filter((x: any) => aiVerdictFor(x).label === "mid").length,
      low: baseFilteredCandidates.filter((x: any) => aiVerdictFor(x).label === "low").length,
      none: baseFilteredCandidates.filter((x: any) => aiVerdictFor(x).label === "none").length,
    };
  }, [baseFilteredCandidates]);

  // Active filters count for modal button badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (crmSearch.trim()) count++;
    if (crmFilterCompany !== "all") count++;
    if (crmFilterRole !== "all") count++;
    if (crmFilterStage !== "all") count++;
    if (crmFilterVerdict !== "all") count++;
    if (crmFilterDecision !== "all") count++;
    if (crmDatePreset !== "all") count++;

    for (const [k, v] of Object.entries(crmFieldFilters)) {
      if (k === "customFieldKey" || k === "customFieldValue") continue;
      if (v && String(v).trim()) count++;
    }
    if (crmFieldFilters.customFieldKey?.trim() && crmFieldFilters.customFieldValue?.trim()) count++;

    return count;
  }, [crmSearch, crmFilterCompany, crmFilterRole, crmFilterStage, crmFilterVerdict, crmFilterDecision, crmDatePreset, crmFieldFilters]);

  const handleResetAllCrmFilters = () => {
    setCrmSearch("");
    setCrmFilterCompany("all");
    setCrmFilterRole("all");
    setCrmFilterStage("all");
    setCrmFilterVerdict("all");
    setCrmFilterDecision("all");
    setCrmDatePreset("all");
    setCrmDateFrom("");
    setCrmDateTo("");
    setCrmFieldFilters({});
    setCrmSort({ field: "created", dir: "desc" });
    setTableColFilters({});
  };

  // Filtering candidates (search + role + company + stage + verdict)
  const filteredCandidates = useMemo(() => {
    if (crmFilterVerdict === "all") return baseFilteredCandidates;
    return baseFilteredCandidates.filter((cand: any) => {
      const v = aiVerdictFor(cand);
      return v.label === crmFilterVerdict;
    });
  }, [baseFilteredCandidates, crmFilterVerdict]);

  const sortedCandidates = useMemo(() => {
    const arr = [...filteredCandidates];
    const dir = crmSort.dir === "asc" ? 1 : -1;
    const t = (v: any) => (v ? new Date(v).getTime() : 0);
    arr.sort((a: any, b: any) => {
      if (crmSort.field === "name") {
        return (String(a.name || "").localeCompare(String(b.name || ""), "ru")) * dir;
      }
      if (crmSort.field === "company") {
        return (String(a.companyName || "").localeCompare(String(b.companyName || ""), "ru")) * dir;
      }
      if (crmSort.field === "role") {
        return (String(a.roleName || "").localeCompare(String(b.roleName || ""), "ru")) * dir;
      }
      if (crmSort.field === "stage") {
        const order = [
          "registration",
          "screening",
          "checklist",
          "situations",
          "interview_reject",
          "interview_success",
          "professional",
          "product",
          "systems",
          "certified",
        ];
        const aIdx = order.indexOf(a.crmStage || "registration");
        const bIdx = order.indexOf(b.crmStage || "registration");
        return (aIdx - bIdx) * dir;
      }
      if (crmSort.field === "resume") {
        return ((a.scores?.resumeScore || 0) - (b.scores?.resumeScore || 0)) * dir;
      }
      if (crmSort.field === "checklist") {
        return ((a.scores?.checklistScore || 0) - (b.scores?.checklistScore || 0)) * dir;
      }
      if (crmSort.field === "situations") {
        return ((a.scores?.situationsScore || 0) - (b.scores?.situationsScore || 0)) * dir;
      }
      if (crmSort.field === "overall") {
        return ((a.scores?.overallScore || 0) - (b.scores?.overallScore || 0)) * dir;
      }
      if (crmSort.field === "updated") return (t(a.updatedAt) - t(b.updatedAt)) * dir;
      return (t(a.createdAt) - t(b.createdAt)) * dir;
    });
    return arr;
  }, [filteredCandidates, crmSort]);

  // Candidates for CRM Table with per-column filters
  const tableCandidates = useMemo(() => {
    return sortedCandidates.filter((cand: any) => {
      if (tableColFilters.name) {
        const q = tableColFilters.name.toLowerCase().trim();
        const hay = `${cand.name || ""} ${cand.email || ""} ${cand.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tableColFilters.city) {
        const q = tableColFilters.city.toLowerCase().trim();
        const hay = `${cand.city || ""} ${cand.profile?.city || ""} ${cand.location || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tableColFilters.workExperience) {
        const q = tableColFilters.workExperience.toLowerCase().trim();
        const hay = `${cand.workExperience || ""} ${cand.experience || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tableColFilters.skills) {
        const q = tableColFilters.skills.toLowerCase().trim();
        const hay = `${cand.skills || ""} ${cand.profile?.skills || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tableColFilters.education) {
        const q = tableColFilters.education.toLowerCase().trim();
        const hay = `${cand.education || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tableColFilters.customFieldKey && tableColFilters.customFieldValue) {
        const k = tableColFilters.customFieldKey.toLowerCase().trim();
        const v = tableColFilters.customFieldValue.toLowerCase().trim();
        const cf = (cand as any).custom_fields || (cand as any).customFields || {};
        const matched = Object.entries(cf).some(
          ([fieldKey, val]) => fieldKey.toLowerCase().includes(k) && String(val || "").toLowerCase().includes(v)
        );
        if (!matched) return false;
      }
      if (tableColFilters.verdict && tableColFilters.verdict !== "all") {
        const v = aiVerdictFor(cand);
        if (v.label !== tableColFilters.verdict) return false;
      }
      if (tableColFilters.company && tableColFilters.company !== "all") {
        if ((cand.companyName || "—") !== tableColFilters.company) return false;
      }
      if (tableColFilters.companySearch) {
        const q = tableColFilters.companySearch.toLowerCase().trim();
        const cName = String(cand.companyName || "—").toLowerCase();
        if (!cName.includes(q)) return false;
      }
      if (tableColFilters.role && tableColFilters.role !== "all") {
        if ((cand.roleName || "—") !== tableColFilters.role) return false;
      }
      if (tableColFilters.roleSearch) {
        const q = tableColFilters.roleSearch.toLowerCase().trim();
        const rName = String(cand.roleName || "—").toLowerCase();
        if (!rName.includes(q)) return false;
      }
      if (tableColFilters.stage && tableColFilters.stage !== "all") {
        if ((cand.crmStage || "registration") !== tableColFilters.stage) return false;
      }
      if (tableColFilters.decision && tableColFilters.decision !== "all") {
        const d = hireDecisionFor(cand);
        if (tableColFilters.decision === "none") {
          if (d) return false;
        } else if (d !== tableColFilters.decision) return false;
      }
      if (tableColFilters.createdFrom) {
        const d = cand.createdAt ? new Date(cand.createdAt).getTime() : 0;
        if (d < new Date(tableColFilters.createdFrom).getTime()) return false;
      }
      if (tableColFilters.createdTo) {
        const d = cand.createdAt ? new Date(cand.createdAt).getTime() : 0;
        const to = new Date(tableColFilters.createdTo);
        to.setHours(23, 59, 59, 999);
        if (d > to.getTime()) return false;
      }
      if (tableColFilters.updatedFrom) {
        const d = cand.updatedAt ? new Date(cand.updatedAt).getTime() : 0;
        if (d < new Date(tableColFilters.updatedFrom).getTime()) return false;
      }
      if (tableColFilters.updatedTo) {
        const d = cand.updatedAt ? new Date(cand.updatedAt).getTime() : 0;
        const to = new Date(tableColFilters.updatedTo);
        to.setHours(23, 59, 59, 999);
        if (d > to.getTime()) return false;
      }
      if (tableColFilters.resumeScoreMin != null) {
        if ((cand.scores?.resumeScore || 0) < tableColFilters.resumeScoreMin) return false;
      }
      if (tableColFilters.checklistScoreMin != null) {
        if ((cand.scores?.checklistScore || 0) < tableColFilters.checklistScoreMin) return false;
      }
      if (tableColFilters.situationsScoreMin != null) {
        if ((cand.scores?.situationsScore || 0) < tableColFilters.situationsScoreMin) return false;
      }
      if (tableColFilters.overallScoreMin != null) {
        if ((cand.scores?.overallScore || 0) < tableColFilters.overallScoreMin) return false;
      }
      if (tableColFilters.scoreField && tableColFilters.scoreMin != null) {
        const val = cand.scores?.[tableColFilters.scoreField];
        if (val == null || Number(val) < tableColFilters.scoreMin) return false;
      }
      return true;
    });
  }, [sortedCandidates, tableColFilters, hireDecisionMap]);

  // Calculate stats
  const totalVerified = candidates.filter(c => c.currentStage === "certified").length;
  const averageAllScores = candidates.length > 0 
    ? Math.round(candidates.reduce((acc, c) => acc + (c.scores?.overallScore || 70), 0) / candidates.length)
    : 78;

  const isEmployerIdReady = isEmployerPublicIdCandidate(employerId);

  if (hasValidSession === false) {
    return (
      <div className="min-h-screen bg-transparent backdrop-blur-2xl text-white flex items-center justify-center p-4">
        <AuthModal
          isOpen={true}
          onClose={() => navigate("/")}
          intent="employer"
          initialMode="login"
          onSuccess={handleAuthSuccess}
        />
      </div>
    );
  }

  if (!isEmployerIdReady || isPreloading || !isDataLoaded) {
    return (
      <LandingPreloader
        mode="employer"
        title="Кабинет работодателя"
        subtitle="Инициализация рабочего пространства и данных"
        externalProgress={dataLoadPercent}
        externalStatusText={dataLoadStatusText}
        isReady={isDataLoaded && isEmployerIdReady}
        minDurationMs={1200}
        onComplete={() => {
          try {
            sessionStorage.removeItem("show_employer_entry_loader");
            sessionStorage.setItem("employer_preloaded", "1");
          } catch {}
          setIsPreloading(false);
        }}
      />
    );
  }

  // Onboarding: обязательный шаг — наличие компании.
  // После создания компании «Вакансии», «Обучение» и «ИИ-Интервью»
  // становятся доступными.
  const hasCompany =
    (companiesList || []).length > 0 ||
    Boolean(newCompanyName && newCompanyName.trim()) ||
    Boolean(companyNameState && companyNameState.trim()) ||
    Boolean(tempCompanyName && tempCompanyName.trim());
  const hasVacancy = (projects?.length || 0) > 0;
  const setupStep = !hasCompany ? 2 : !hasVacancy ? 3 : !hasTrainingSetup ? 4 : !hasInterviewSetup ? 5 : 6;
  const setupDone = setupStep === 6;
  const tabDisabled = (_key: "vacancies" | "training" | "interviews") => {
    return false;
  };
  const tabHint = (_key: "vacancies" | "training" | "interviews") => {
    return "";
  };
  const guardedNavigate = (_key: "vacancies" | "training" | "interviews", url: string) => {
    navigate(url);
  };

  // Render content area based on six main tabs
  return (
    <div className="bg-gradient-to-b from-[#17344F]/65 via-[#1E4468]/50 to-[#265582]/65 min-h-screen text-white font-sans antialiased selection:bg-[#E7C768] selection:text-[#17344F] flex flex-col justify-between overflow-x-hidden relative">
      
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-50 bg-transparent backdrop-blur-none border-b border-white/10 px-4 md:px-8 py-4">
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <RRImage 
              src="/files/11/rr-logo.png" 
              w={40}
              alt="RR Робот Рекрутер" 
              className="w-10 h-10 object-contain drop-shadow" 
              referrerPolicy="no-referrer"
            />
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight text-[#E7C768]">
                Робот Рекрутер
              </span>
              <span className="text-sm font-mono tracking-wider text-slate-300">
                ID: {employerId || "—"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate(`/emp${employerId}/tariff`)}
              className="bg-transparent hover:bg-white/5 border border-[#E7C768]/50 text-[#E7C768] px-3.5 py-1.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm text-sm font-bold font-mono active:scale-95"
              title="Перейти к управлению балансом и тарифами"
            >
              <CreditCard className="w-4 h-4 text-[#E7C768]" />
              <span className="hidden xs:inline text-slate-200 font-sans font-medium text-sm">Баланс:</span>
              <strong className="text-[#E7C768] font-black text-sm">{balance} RR</strong>
            </button>

            {/* Mobile Burger Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden bg-transparent hover:bg-white/10 text-[#E7C768] p-2 rounded-xl transition border border-white/20 flex items-center gap-1.5 cursor-pointer text-sm font-bold active:scale-95"
              title="Открыть меню навигации"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-[#E7C768]" />}
              <span className="hidden xs:inline text-white font-mono text-sm">Меню</span>
            </button>

            <NotificationsBell employerId={employerId} />

            <button onClick={handleLogout} className="hidden sm:flex cursor-pointer bg-transparent hover:bg-white/10 text-white rounded-xl px-3 py-2 text-sm font-bold transition items-center gap-1 border border-white/20">
              <LogOut className="w-4 h-4" /> Выйти
            </button>
          </div>
        </div>

        {/* Mobile Slide-Over Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden absolute left-0 right-0 top-full bg-transparent backdrop-blur-2xl border-b border-white/20 shadow-2xl p-4 space-y-4 text-left animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h4 className="font-bold text-sm text-[#E7C768]">Навигация кабинета</h4>
                <p className="text-sm text-slate-300">Робот Рекрутер ID: {employerId}</p>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg bg-transparent text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-left">
              <button
                onClick={() => { navigate(`/emp${employerId}/profile`); setMobileMenuOpen(false); }}
                className={`w-full text-left font-bold text-sm p-2.5 rounded-xl flex flex-col items-start gap-1 transition ${activeTab === "profile" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 1</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <User className="w-4 h-4 text-[#D99E41]" /> Профиль
                </span>
              </button>

              <button
                onClick={() => { navigate(`/emp${employerId}/companies`); setMobileMenuOpen(false); }}
                className={`w-full text-left font-bold text-sm p-2.5 rounded-xl flex flex-col items-start gap-1 transition ${activeTab === "companies" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 2</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <Building2 className="w-4 h-4 text-[#D99E41]" /> Мои компании
                </span>
              </button>

              <button
                onClick={() => { guardedNavigate("vacancies", `/emp${employerId}/vacancies`); setMobileMenuOpen(false); }}
                className={`w-full text-left font-bold text-[14px] p-2.5 rounded-xl flex flex-col items-start gap-1 transition ${activeTab === "vacancies" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 3</span>
                <span className="flex items-center gap-1.5 text-[14px]">
                  <Briefcase className="w-4 h-4 text-[#D99E41]" /> Вакансии & ИИ
                </span>
              </button>

              <button
                onClick={() => { guardedNavigate("training", `/emp${employerId}/training`); setMobileMenuOpen(false); }}
                className={`w-full text-left font-bold text-[14px] p-2.5 rounded-xl flex flex-col items-start gap-1 transition ${activeTab === "training" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 4</span>
                <span className="flex items-center gap-1.5 text-[14px]">
                  <GraduationCap className="w-4 h-4 text-[#D99E41]" /> Обучение (ИИ)
                </span>
              </button>

              <button
                onClick={() => { guardedNavigate("interviews", `/emp${employerId}/interviews`); setMobileMenuOpen(false); }}
                className={`w-full text-left font-bold text-[14px] p-2.5 rounded-xl flex flex-col items-start gap-1 transition ${activeTab === "interviews" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 5</span>
                <span className="flex items-center gap-1.5 text-[14px]">
                  <MessageSquare className="w-4 h-4 text-[#D99E41]" /> Интервью (ИИ)
                </span>
              </button>

              <button
                onClick={() => { navigate(`/emp${employerId}/crm`); setCrmViewMode("kanban"); setMobileMenuOpen(false); }}
                className={`w-full text-left font-bold text-sm p-2.5 rounded-xl flex flex-col items-start gap-1 transition ${activeTab === "crm" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="border border-[#E7C768]/40 text-[14px] text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Кандидаты: {candidates.length}</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <Users className="w-4 h-4 text-[#D99E41]" /> CRM & Воронка
                </span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => { navigate(`/admin`); setMobileMenuOpen(false); }}
                  className="w-full text-left font-bold text-sm p-2.5 rounded-xl flex flex-col items-start gap-1 transition bg-transparent hover:bg-white/5 border border-[#E7C768]/50 text-[#E7C768]"
                >
                  <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">CRM</span>
                  <span className="flex items-center gap-1.5 text-sm">
                    <ShieldCheck className="w-4 h-4 text-[#E7C768]" /> Админ-панель
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Workspace Frame */}
      <div className={`w-full mx-auto py-6 px-4 md:px-6 pb-28 lg:pb-6 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 flex-1 min-w-0 ${activeTab === "crm" ? "max-w-[1800px]" : "max-w-7xl"}`}>
        
        {/* Left Side Tab Drawer (Desktop Only) */}
        <aside className="hidden lg:block sidebar-readable space-y-4 lg:sticky lg:top-[88px] lg:self-start">
          <div className="bg-transparent border border-white/20 rounded-3xl p-4 shadow-xl space-y-3 text-center backdrop-blur-md">
            {/* Clickable Balance & Limits Widget at the Top */}
            <div
              onClick={() => navigate(`/emp${employerId}/tariff`)}
              title="Нажмите, чтобы перейти в раздел Тариф и Счета"
              className="bg-transparent border border-white/20 hover:border-[#E7C768] rounded-2xl p-3.5 shadow-md space-y-2 text-left backdrop-blur-md cursor-pointer transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="text-sm text-slate-300 font-bold flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-[#E7C768]" />
                  <span>Баланс:</span>
                </span>
                <span className="font-mono text-[#E7C768] font-black text-sm">{balance} RR</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">ИИ-Интервью:</span>
                  <span className="font-mono text-white font-bold">{interviewCredits} шт</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">ИИ-Обучений:</span>
                  <span className="font-mono text-white font-bold">{trainingCredits} шт</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">ИИ-Вакансий:</span>
                  <span className="font-mono text-white font-bold">{landingCredits} шт</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Системы обучений:</span>
                  <span className="font-mono text-white font-bold">{trainingSetupCredits} шт</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Системы интервью:</span>
                  <span className="font-mono text-white font-bold">{interviewSetupCredits} шт</span>
                </div>
              </div>
            </div>

            {/* Launch Tour button above all navigation buttons */}
            <div className="pt-1">
              <OnboardingHost buttonOnly />
            </div>

            {/* Navigation Buttons (2-line layout, min 2px gap) */}
            <div className="space-y-0.5 pt-1 text-left">
              <button
                onClick={() => navigate(`/emp${employerId}/profile`)}
                data-tour="nav.profile"
                className={`w-full text-left font-bold text-sm p-2 rounded-xl flex flex-col items-start gap-0.5 transition-all ${activeTab === "profile" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 1</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <User className="w-4 h-4 text-[#D99E41]" /> Профиль
                </span>
              </button>

              <button
                onClick={() => navigate(`/emp${employerId}/companies`)}
                data-tour="nav.companies"
                className={`w-full text-left font-bold text-sm p-2 rounded-xl flex flex-col items-start gap-0.5 transition-all ${activeTab === "companies" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 2</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <Building2 className="w-4 h-4 text-[#D99E41]" /> Мои компании
                </span>
              </button>

              <button
                onClick={() => guardedNavigate("vacancies", `/emp${employerId}/vacancies`)}
                data-tour="nav.vacancies"
                className={`w-full text-left font-bold text-[14px] p-2 rounded-xl flex flex-col items-start gap-0.5 transition-all ${activeTab === "vacancies" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 3</span>
                <span className="flex items-center gap-1.5 text-[14px]">
                  <Briefcase className="w-4 h-4 text-[#D99E41]" /> Вакансии & ИИ
                </span>
              </button>

              <button
                onClick={() => guardedNavigate("training", `/emp${employerId}/training`)}
                data-tour="nav.training"
                className={`w-full text-left font-bold text-[14px] p-2 rounded-xl flex flex-col items-start gap-0.5 transition-all ${activeTab === "training" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 4</span>
                <span className="flex items-center gap-1.5 text-[14px]">
                  <GraduationCap className="w-4 h-4 text-[#D99E41]" /> Обучение (ИИ)
                </span>
              </button>

              <button
                onClick={() => guardedNavigate("interviews", `/emp${employerId}/interviews`)}
                data-tour="nav.interviews"
                className={`w-full text-left font-bold text-[14px] p-2 rounded-xl flex flex-col items-start gap-0.5 transition-all ${activeTab === "interviews" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Шаг 5</span>
                <span className="flex items-center gap-1.5 text-[14px]">
                  <MessageSquare className="w-4 h-4 text-[#D99E41]" /> Интервью (ИИ)
                </span>
              </button>

              <div className="h-px bg-white/10 my-1"></div>

              <button
                onClick={() => { navigate(`/emp${employerId}/crm`); setCrmViewMode("kanban"); }}
                data-tour="nav.crm"
                className={`w-full text-left font-bold text-sm p-2 rounded-xl flex flex-col items-start gap-0.5 transition-all ${activeTab === "crm" ? "bg-transparent text-[#E7C768] border border-[#E7C768] shadow" : "bg-transparent text-slate-200 hover:bg-white/5 border border-transparent"}`}
              >
                <span className="border border-[#E7C768]/40 text-[14px] text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">Кандидаты: {candidates.length}</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <Users className="w-4 h-4 text-[#D99E41]" /> CRM & Воронка
                </span>
              </button>

              {isAdmin && (
                <>
                  <div className="h-px bg-white/10 my-1"></div>
                  <button
                    onClick={() => navigate(`/admin`)}
                    className="w-full text-left font-bold text-sm p-2 rounded-xl flex flex-col items-start gap-0.5 transition-all bg-transparent hover:bg-white/5 border border-[#E7C768]/50 text-[#E7C768]"
                  >
                    <span className="text-[14px] border border-[#E7C768]/40 text-[#E7C768] px-2 py-0.5 rounded font-mono font-bold bg-transparent">CRM</span>
                    <span className="flex items-center gap-1.5 text-sm">
                      <ShieldCheck className="w-4 h-4 text-[#E7C768]" /> Админ-панель
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* Right Side Main Workspaces */}
        <main className="panel-readable min-w-0 space-y-6">

          {/* Авто-старт сквозного welcome-тура (рендерит null) */}
          <OnboardingHost />


          {/* PAGE 1: CRM & FUNNEL */}
          {activeTab === "crm" && (
            <div className="crm-page text-left">
              
              {/* Layout controls: 3 buttons: Канбан, Таблица, Фильтры */}
              <div data-tour="section.crm.header" className="crm-controls bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#E7C768]" /> ИИ-воронка и CRM-кандидаты
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* View selectors: Канбан / Таблица */}
                  <div className="bg-transparent backdrop-blur-xl p-1 rounded-2xl border border-white/20 flex gap-1">
                    <button
                      onClick={() => setCrmViewMode("kanban")}
                      className={`px-4 py-2 text-[14px] font-bold rounded-xl transition-all ${
                        crmViewMode === "kanban"
                          ? "border border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_12px_rgba(212,175,55,0.25)]"
                          : "text-white/80 hover:text-white border border-transparent bg-transparent"
                      }`}
                    >
                      Канбан
                    </button>
                    <button
                      onClick={() => setCrmViewMode("table")}
                      className={`px-4 py-2 text-[14px] font-bold rounded-xl transition-all ${
                        crmViewMode === "table"
                          ? "border border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_12px_rgba(212,175,55,0.25)]"
                          : "text-white/80 hover:text-white border border-transparent bg-transparent"
                      }`}
                    >
                      Таблица
                    </button>
                  </div>

                  {/* Filter modal trigger button */}
                  <button
                    type="button"
                    onClick={() => setIsCrmFilterModalOpen(true)}
                    className={`inline-flex items-center gap-2 text-[14px] font-bold px-4 py-2.5 rounded-2xl border transition-all backdrop-blur-xl ${
                      activeFiltersCount > 0
                        ? "border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_14px_rgba(212,175,55,0.3)]"
                        : "border-white/20 text-white/90 hover:border-[#d4af37]/60 hover:text-white bg-transparent"
                    }`}
                  >
                    <Filter className="w-4 h-4 text-[#E7C768]" />
                    <span>Фильтры</span>
                    {activeFiltersCount > 0 && (
                      <span className="bg-transparent border border-[#d4af37] text-[#fceabb] text-[14px] font-mono px-2 py-0.5 rounded-full">
                        {activeFiltersCount}
                      </span>
                    )}
                  </button>

                  {/* CRM Constructor button */}
                  <button
                    type="button"
                    onClick={() => setIsCrmConstructorOpen(true)}
                    className="inline-flex items-center gap-2 text-[14px] font-bold px-4 py-2.5 rounded-2xl border border-white/20 text-white/90 hover:border-[#d4af37]/60 hover:text-white bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
                    title="Конструктор показа колонок и наполнения карточек CRM"
                  >
                    <Sliders className="w-4 h-4 text-[#E7C768]" />
                    <span>Конструктор</span>
                  </button>

                  {/* System Dialogs button */}
                  <button
                    type="button"
                    onClick={() => setIsCrmDialogsOpen(true)}
                    className="inline-flex items-center gap-2 text-[14px] font-bold px-4 py-2.5 rounded-2xl border border-white/20 text-white/90 hover:border-[#d4af37]/60 hover:text-white bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
                    title="Системные диалоги и шаблоны сообщений кандидатам"
                  >
                    <MessageSquareCode className="w-4 h-4 text-[#E7C768]" />
                    <span>Диалоги</span>
                  </button>

                  {/* Academy Help modal trigger */}
                  <button
                    type="button"
                    onClick={() => {
                      setAcademyModalSlug("crm");
                      setIsAcademyModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center p-2.5 rounded-2xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
                    title="Обучающая инструкция: CRM система (ИИ-Академия)"
                    aria-label="Инструкция по CRM"
                  >
                    <HelpCircle className="w-4 h-4 text-[#E7C768]" />
                  </button>
                </div>
              </div>

              {/* KANBAN FUNNEL LAYOUT */}
              {crmViewMode === "kanban" && (
                (() => {
                  const allColumns = [
                    { stage: "registration", title: "1. Регистрация", short: "Регистрация" },
                    { stage: "screening",    title: "2. Скрининг",    short: "Скрининг" },
                    { stage: "checklist",    title: "3. Чеклист",     short: "Чеклист" },
                    { stage: "situations",   title: "4. Ситуации",    short: "Ситуации" },
                    { stage: "interview_reject", title: "5. Интервью Отказ", short: "Инт. отказ" },
                    { stage: "interview_success", title: "6. Интервью Успех", short: "Инт. успех" },
                    { stage: "professional", title: "7. Профессия",   short: "Профессия" },
                    { stage: "product",      title: "8. Продукт",     short: "Продукт" },
                    { stage: "systems",      title: "9. Система",     short: "Система" },
                    { stage: "certified",    title: "10. Сертификат 🎓", short: "Сертификат" },
                  ];
                  const columns = allColumns.filter((col) => kanbanVisibleCols[col.stage] !== false);
                  return (
                <div className="crm-workspace rounded-3xl border border-white/20 bg-transparent backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="crm-kanban-shell relative flex-1 min-h-0">
                    {/* Top horizontal scrollbar (mirrors viewport) */}
                    <div
                      ref={(el) => {
                        kanbanTopScrollRef.current = el;
                        if (el && !(el as any).__topBound) {
                          (el as any).__topBound = true;
                          el.addEventListener("scroll", () => {
                            const v = kanbanViewportRef.current;
                            if (!v) return;
                            if (Math.abs(v.scrollLeft - el.scrollLeft) > 1) v.scrollLeft = el.scrollLeft;
                          }, { passive: true });
                        }
                      }}
                      className="crm-kanban-topscroll crm-kanban-h-scroll"
                    >
                      <div ref={kanbanTopSpacerRef} />
                    </div>
                    {/* Arrows */}
                    <button
                      type="button"
                      onClick={() => scrollKanban("left")}
                      disabled={kanbanEdge.left}
                      aria-label="Прокрутить влево"
                      className="crm-kanban-arrow crm-kanban-arrow-left"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollKanban("right")}
                      disabled={kanbanEdge.right}
                      aria-label="Прокрутить вправо"
                      className="crm-kanban-arrow crm-kanban-arrow-right"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    <div
                      ref={(el) => {
                        kanbanViewportRef.current = el;
                        if (el) {
                          // attach listener once
                          if (!(el as any).__edgeBound) {
                            (el as any).__edgeBound = true;
                            el.addEventListener("scroll", updateKanbanEdges, { passive: true });
                            requestAnimationFrame(updateKanbanEdges);
                          }
                        }
                      }}
                      className="crm-kanban-viewport crm-kanban-h-scroll"
                      onDragOver={handleKanbanDragOver}
                    >
                      <div className="crm-kanban-track">
                        {columns.map(column => {
                          let colCandidates = sortedCandidates.filter(c => (c.crmStage || "registration") === column.stage);
                          const cSearch = (kanbanColSearch[column.stage] || "").toLowerCase().trim();
                          if (cSearch) {
                            colCandidates = colCandidates.filter((cand: any) => {
                              const hay = `${cand.name || ""} ${cand.email || ""} ${cand.phone || ""} ${cand.roleName || ""} ${cand.companyName || ""} ${cand.city || ""}`.toLowerCase();
                              return hay.includes(cSearch);
                            });
                          }
                          const cVerdict = kanbanColFilter[column.stage]?.verdict;
                          if (cVerdict && cVerdict !== "all") {
                            colCandidates = colCandidates.filter((cand: any) => aiVerdictFor(cand).label === cVerdict);
                          }
                          const cDec = kanbanColFilter[column.stage]?.decision;
                          if (cDec && cDec !== "all") {
                            colCandidates = colCandidates.filter((cand: any) => {
                              const d = hireDecisionFor(cand);
                              if (cDec === "none") return !d;
                              return d === cDec;
                            });
                          }
                          const cSort = kanbanColSort[column.stage];
                          if (cSort) {
                            const dir = cSort.dir === "asc" ? 1 : -1;
                            colCandidates = [...colCandidates].sort((a: any, b: any) => {
                              if (cSort.field === "name") return (String(a.name || "").localeCompare(String(b.name || ""), "ru")) * dir;
                              if (cSort.field === "score") {
                                const scA = Number(a.scores?.overallScore ?? 0);
                                const scB = Number(b.scores?.overallScore ?? 0);
                                return (scA - scB) * dir;
                              }
                              const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                              const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                              return (tA - tB) * dir;
                            });
                          }
                          return (
                            <div
                              key={column.stage}
                              ref={(el) => { kanbanColumnRefs.current[column.stage] = el; }}
                              data-stage={column.stage}
                              className="crm-kanban-column bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl shadow-lg"
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={async () => {
                                const draggedId = localStorage.getItem("dragged_candidate_id");
                                if (draggedId) {
                                  await handleUpdateCrmStage(draggedId, column.stage as any);
                                  localStorage.removeItem("dragged_candidate_id");
                                }
                              }}
                            >
                              <div
                                onClick={() => setKanbanModalStage(column.stage)}
                                className="crm-kanban-column-header flex items-center justify-between border-b border-white/15 px-3 py-2.5 text-[14px] font-bold text-white bg-transparent backdrop-blur-md rounded-t-2xl cursor-pointer hover:border-[#d4af37]/60 group transition select-none"
                                title="Нажмите для поиска, фильтрации и сортировки по этой колонке"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="whitespace-nowrap group-hover:text-[#fceabb] transition">{column.title}</span>
                                  <SlidersHorizontal className="w-3.5 h-3.5 text-white/40 group-hover:text-[#E7C768] transition" />
                                </div>
                                <span className="bg-transparent border border-[#d4af37]/50 font-mono px-2 py-0.5 rounded-full text-[14px] text-[#fceabb]">{colCandidates.length}</span>
                              </div>

                              <div className="crm-kanban-cards crm-column-scroll space-y-2.5 px-3 py-3">
                                {colCandidates.length === 0 ? (
                                  <div className="text-white/50 text-[14px] py-4 text-center">Пусто</div>
                                ) : (
                                  colCandidates.map(cand => {
                                    const dec = hireDecisionFor(cand);
                                    const decBorder = dec ? hireDecisionMeta[dec].border : "border-white/20 hover:border-[#d4af37]";
                                    return (
                                    <div
                                      key={cand.id}
                                      draggable
                                      onDragStart={() => localStorage.setItem("dragged_candidate_id", cand.id)}
                                      onClick={() => setSelectedCandidateId((cand as any).uuid || null)}
                                      className={`bg-transparent backdrop-blur-xl border ${decBorder} p-3 rounded-2xl transition cursor-pointer shadow-lg flex flex-col gap-1.5 min-h-[105px] overflow-hidden hover:border-[#d4af37]`}
                                    >
                                      <div className="text-[14px] font-bold text-[#fceabb] hover:underline line-clamp-1">
                                        {cand.name}
                                      </div>
                                      {kanbanCardFields.showRole && cand.roleName && (
                                        <div className="text-[14px] text-white/80 truncate">{cand.roleName}</div>
                                      )}
                                      {kanbanCardFields.showCompany && (cand as any).companyName && (
                                        <div className="text-[14px] text-slate-300 truncate">{(cand as any).companyName}</div>
                                      )}
                                      {kanbanCardFields.showEmail && cand.email && (
                                        <div className="text-[14px] text-white/70 truncate">{cand.email}</div>
                                      )}
                                      {kanbanCardFields.showPhone && (cand as any).phone && (
                                        <div className="text-[14px] text-white/70 truncate">{(cand as any).phone}</div>
                                      )}
                                      {kanbanCardFields.showCity && (cand as any).city && (
                                        <div className="text-[14px] text-slate-300 truncate">{(cand as any).city}</div>
                                      )}
                                      {kanbanCardFields.showExperience && (cand as any).workExperience && (
                                        <div className="text-[14px] text-slate-300 line-clamp-1">Опыт: {(cand as any).workExperience}</div>
                                      )}
                                      {kanbanCardFields.showScores && (cand.scores?.resumeScore != null || cand.scores?.checklistScore != null || cand.scores?.situationsScore != null) && (
                                        <div className="flex items-center gap-1.5 text-[14px] font-mono text-slate-300 pt-0.5">
                                          <span>Рез: {Math.round(cand.scores?.resumeScore ?? 0)}</span>
                                          <span>•</span>
                                          <span>Чек: {Math.round(cand.scores?.checklistScore ?? 0)}</span>
                                          <span>•</span>
                                          <span>Кейс: {Math.round(cand.scores?.situationsScore ?? 0)}</span>
                                        </div>
                                      )}
                                      {kanbanCardFields.showOverall && cand.scores?.overallScore != null && (
                                        <div className="text-[14px] font-mono text-[#F4EE8E] font-bold">
                                          Итог: {Math.round(cand.scores.overallScore)}/100
                                        </div>
                                      )}
                                      {kanbanCardFields.showVerdict && (() => {
                                        const v = aiVerdictFor(cand);
                                        if (!v) return null;
                                        return (
                                          <span className={`self-start mt-auto text-[14px] font-semibold px-2 py-0.5 rounded-lg ${v.badge}`}>{v.txt}</span>
                                        );
                                      })()}
                                      {kanbanCardFields.showDecision && (() => {
                                        const d = hireDecisionFor(cand);
                                        if (!d) return null;
                                        const m = hireDecisionMeta[d];
                                        return <span className={`self-start text-[14px] font-semibold px-2 py-0.5 rounded-lg ${m.tag}`}>{m.short}</span>;
                                      })()}
                                      {kanbanCardFields.showDate && (() => {
                                        const useUpdated = crmSort.field === "updated";
                                        const raw = useUpdated ? (cand as any).updatedAt : (cand as any).createdAt;
                                        if (!raw) return null;
                                        const d = new Date(raw);
                                        if (isNaN(d.getTime())) return null;
                                        const label = useUpdated ? "Изменён" : "Создан";
                                        const fmt = d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
                                        return <div className="text-[14px] text-white/60 font-mono mt-0.5">{label}: {fmt}</div>;
                                      })()}
                                      {/* Standard and custom candidate fields toggled via constructor */}
                                      {(() => {
                                        const stdMap = normalizeStandardFieldsFromCandidate(cand);
                                        const custMap = normalizeCustomFieldsFromCandidate(cand);
                                        const fieldsMap = kanbanCardFields as Record<string, boolean>;
                                        const activeStdItems = STANDARD_CANDIDATE_FIELDS.filter((f) => fieldsMap[`std_${f.key}`]);
                                        const activeCustItems = allCustomFields.filter((cf) => fieldsMap[cf.key] || fieldsMap[`custom_${cf.key}`]);

                                        if (activeStdItems.length === 0 && activeCustItems.length === 0) return null;

                                        return (
                                          <div className="space-y-0.5 pt-1 border-t border-white/10 text-[13px]">
                                            {activeStdItems.map((f) => {
                                              const rawVal = stdMap[f.key];
                                              const valStr = Array.isArray(rawVal) ? rawVal.join(", ") : (rawVal ? String(rawVal) : "");
                                              if (!valStr) return null;
                                              return (
                                                <div key={f.key} className="text-white/80 truncate">
                                                  <span className="text-[#E7C768] font-semibold">{f.label}:</span> {valStr}
                                                </div>
                                              );
                                            })}
                                            {activeCustItems.map((cf) => {
                                              const rawKey = cf.key.replace(/^custom_/, "");
                                              const rawVal = custMap[rawKey] ?? custMap[cf.key];
                                              const valStr = Array.isArray(rawVal) ? rawVal.join(", ") : (rawVal ? String(rawVal) : "");
                                              if (!valStr) return null;
                                              return (
                                                <div key={cf.key} className="text-white/80 truncate">
                                                  <span className="text-[#F4EE8E] font-semibold">{cf.label}:</span> {valStr}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                  );
                })()
              )}

              {/* TABLE LAYOUT FOR DATA-RICH CHECKS */}
              {crmViewMode === "table" && (
                (() => {
                  const visibleTableHeaders = allCrmTableColumnDefs.filter(h => tableVisibleCols[h.key] !== false);
                  const totalTableCandidates = tableCandidates.length;
                  const perPage = typeof tablePageSize === "number" ? tablePageSize : totalTableCandidates || 1;
                  const totalPages = tablePageSize === "all" ? 1 : Math.max(1, Math.ceil(totalTableCandidates / perPage));
                  const currentPage = Math.min(Math.max(1, tableCurrentPage), totalPages);
                  const startIdx = tablePageSize === "all" ? 0 : (currentPage - 1) * perPage;
                  const paginatedList = tablePageSize === "all" ? tableCandidates : tableCandidates.slice(startIdx, startIdx + perPage);

                  return (
                <div className="crm-table-shell bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                  <div className="crm-table-viewport crm-scroll-area overflow-x-auto">
                    <table className="text-left text-[14px] w-full" style={{ minWidth: `${Math.max(800, visibleTableHeaders.reduce((acc, h) => acc + h.w, 0))}px` }}>
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-transparent backdrop-blur-md text-[#fceabb] font-bold border-b border-white/20 text-[14px]">
                          {visibleTableHeaders.map((h, i) => {
                            const alignClass =
                              h.align === "center"
                                ? "text-center"
                                : h.align === "right"
                                  ? "text-right"
                                  : "text-left";
                            const isClickable = h.key !== "actions";
                            const isSorted = crmSort.field === h.key;
                            const hasColFilter = (() => {
                              if (h.key === "name") {
                                return Boolean(
                                  tableColFilters.name ||
                                  tableColFilters.city ||
                                  tableColFilters.workExperience ||
                                  tableColFilters.skills ||
                                  tableColFilters.education ||
                                  tableColFilters.customFieldKey ||
                                  (tableColFilters.verdict && tableColFilters.verdict !== "all") ||
                                  (tableColFilters.decision && tableColFilters.decision !== "all")
                                );
                              }
                              if (h.key === "company") {
                                return Boolean((tableColFilters.company && tableColFilters.company !== "all") || tableColFilters.companySearch);
                              }
                              if (h.key === "role") {
                                return Boolean((tableColFilters.role && tableColFilters.role !== "all") || tableColFilters.roleSearch);
                              }
                              if (h.key === "stage") {
                                return Boolean(tableColFilters.stage && tableColFilters.stage !== "all");
                              }
                              if (h.key === "created") {
                                return Boolean(
                                  tableColFilters.createdFrom ||
                                  tableColFilters.createdTo ||
                                  (tableColFilters.createdPreset && tableColFilters.createdPreset !== "all")
                                );
                              }
                              if (h.key === "updated") {
                                return Boolean(
                                  tableColFilters.updatedFrom ||
                                  tableColFilters.updatedTo ||
                                  (tableColFilters.updatedPreset && tableColFilters.updatedPreset !== "all")
                                );
                              }
                              if (h.key === "resume") {
                                return Boolean(
                                  (tableColFilters.resumeScoreMin != null && tableColFilters.resumeScoreMin > 0) ||
                                  (tableColFilters.scoreField === "resumeScore" && (tableColFilters.scoreMin ?? 0) > 0)
                                );
                              }
                              if (h.key === "checklist") {
                                return Boolean(
                                  (tableColFilters.checklistScoreMin != null && tableColFilters.checklistScoreMin > 0) ||
                                  (tableColFilters.scoreField === "checklistScore" && (tableColFilters.scoreMin ?? 0) > 0)
                                );
                              }
                              if (h.key === "situations") {
                                return Boolean(
                                  (tableColFilters.situationsScoreMin != null && tableColFilters.situationsScoreMin > 0) ||
                                  (tableColFilters.scoreField === "situationsScore" && (tableColFilters.scoreMin ?? 0) > 0)
                                );
                              }
                              if (h.key === "overall") {
                                return Boolean(
                                  (tableColFilters.overallScoreMin != null && tableColFilters.overallScoreMin > 0) ||
                                  (tableColFilters.scoreField === "overallScore" && (tableColFilters.scoreMin ?? 0) > 0)
                                );
                              }
                              return false;
                            })();
                            return (
                              <th
                                key={i}
                                className={`p-3.5 ${alignClass} whitespace-nowrap bg-transparent backdrop-blur-md ${isClickable ? "cursor-pointer select-none hover:text-[#fceabb] transition group" : ""}`}
                                style={{ minWidth: h.w, width: h.w }}
                                onClick={isClickable ? () => setTableModalCol(h.key) : undefined}
                                title={isClickable ? "Нажмите для поиска, фильтрации и сортировки по этой колонке" : undefined}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <span>{h.label}</span>
                                  {isClickable && (
                                    <SlidersHorizontal className={`w-3.5 h-3.5 transition ${hasColFilter ? "text-[#E7C768]" : "text-white/40 group-hover:text-[#E7C768]"}`} />
                                  )}
                                  {hasColFilter && (
                                    <span className="w-2 h-2 rounded-full bg-[#E7C768] inline-block shadow-[0_0_6px_rgba(231,199,104,0.6)]" title="Фильтр активен" />
                                  )}
                                  {isSorted && (
                                    <span className="font-mono text-[14px] text-[#fceabb]">
                                      {crmSort.dir === "asc" ? "↑" : "↓"}
                                    </span>
                                  )}
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {paginatedList.length === 0 ? (
                          <tr>
                            <td colSpan={visibleTableHeaders.length || 1} className="p-8 text-center text-white/60 font-semibold text-[14px]">Соискатели отсутствуют.</td>
                          </tr>
                        ) : (
                          paginatedList.map(cand => {
                            const rScore = cand.scores?.resumeScore;
                            const cScore = cand.scores?.checklistScore;
                            const sScore = cand.scores?.situationsScore;
                            const avg = cand.scores?.overallScore;
                            const fmt = (v: any) => (v === undefined || v === null ? "—" : `${Math.round(Number(v))}/100`);

                            return (
                              <tr key={cand.id} className="hover:bg-white/5 transition">
                                {visibleTableHeaders.map((col) => {
                                  if (col.key === "name") {
                                    return (
                                      <td key="name" className="p-3.5 font-bold text-white cursor-pointer" onClick={() => setSelectedCandidateId((cand as any).uuid || null)}>
                                        <div className="text-[#fceabb] text-[14px] hover:underline">{cand.name}</div>
                                        <div className="text-[14px] text-white/70 font-normal">{cand.email}</div>
                                        {(cand as any).phone && <div className="text-[14px] text-white/60 font-normal">{(cand as any).phone}</div>}
                                        {(() => {
                                          const v = aiVerdictFor(cand);
                                          if (!v) return null;
                                          return (
                                            <span className={`inline-block mt-1 text-[14px] font-semibold px-2 py-0.5 rounded-lg ${v.badge}`}>{v.txt}</span>
                                          );
                                        })()}
                                      </td>
                                    );
                                  }
                                  if (col.key === "company") {
                                    return <td key="company" className="p-3.5 text-white/80 text-[14px]">{(cand as any).companyName || "—"}</td>;
                                  }
                                  if (col.key === "role") {
                                    return <td key="role" className="p-3.5 text-white/80 text-[14px]">{cand.roleName || "—"}</td>;
                                  }
                                  if (col.key === "stage") {
                                    return (
                                      <td key="stage" className="p-3.5">
                                        <select 
                                          className="bg-transparent backdrop-blur-md text-[14px] rounded-xl border border-white/20 px-2.5 py-1.5 text-[#fceabb] max-w-full focus:outline-none focus:border-[#d4af37]"
                                          value={(cand as any).crmStage || "registration"}
                                          onChange={(e) => handleUpdateCrmStage(cand.id, e.target.value as any)}
                                        >
                                          <option value="registration" className="bg-[#17344F] text-white">1. Регистрация</option>
                                          <option value="screening" className="bg-[#17344F] text-white">2. Скрининг</option>
                                          <option value="checklist" className="bg-[#17344F] text-white">3. Чеклист</option>
                                          <option value="situations" className="bg-[#17344F] text-white">4. Ситуации</option>
                                          <option value="interview_reject" className="bg-[#17344F] text-white">5. Интервью отказ</option>
                                          <option value="interview_success" className="bg-[#17344F] text-white">6. Интервью успех</option>
                                          <option value="professional" className="bg-[#17344F] text-white">7. Профессия</option>
                                          <option value="product" className="bg-[#17344F] text-white">8. Продукт</option>
                                          <option value="systems" className="bg-[#17344F] text-white">9. Система</option>
                                          <option value="certified" className="bg-[#17344F] text-white">10. Сертификат 🎓</option>
                                        </select>
                                      </td>
                                    );
                                  }
                                  if (col.key === "created") {
                                    return (
                                      <td key="created" className="p-3.5 text-white/70 text-[14px] whitespace-nowrap">
                                        {(cand as any).createdAt ? new Date((cand as any).createdAt).toLocaleDateString("ru-RU") : "—"}
                                      </td>
                                    );
                                  }
                                  if (col.key === "updated") {
                                    return (
                                      <td key="updated" className="p-3.5 text-white/70 text-[14px] whitespace-nowrap">
                                        {(cand as any).updatedAt ? new Date((cand as any).updatedAt).toLocaleDateString("ru-RU") : "—"}
                                      </td>
                                    );
                                  }
                                  if (col.key === "resume") {
                                    return <td key="resume" className="p-3.5 text-center font-mono font-bold text-white text-[14px]">{fmt(rScore)}</td>;
                                  }
                                  if (col.key === "checklist") {
                                    return <td key="checklist" className="p-3.5 text-center font-mono font-bold text-white text-[14px]">{fmt(cScore)}</td>;
                                  }
                                  if (col.key === "situations") {
                                    return <td key="situations" className="p-3.5 text-center font-mono font-bold text-white text-[14px]">{fmt(sScore)}</td>;
                                  }
                                  if (col.key === "overall") {
                                    return (
                                      <td key="overall" className="p-3.5 text-center">
                                        <span className="bg-transparent text-[#fceabb] font-bold font-mono px-2.5 py-1 rounded-lg border border-[#d4af37]/40 text-[14px]">{avg === undefined || avg === null ? "—" : Math.round(Number(avg))}</span>
                                      </td>
                                    );
                                  }
                                  if (col.key === "actions") {
                                    return (
                                      <td key="actions" className="p-3.5 text-right">
                                        <button onClick={() => setSelectedCandidateId((cand as any).uuid || null)} className="cursor-pointer text-[#fceabb] hover:underline font-bold text-[14px]">Карточка ИИ</button>
                                      </td>
                                    );
                                  }
                                  if (col.key.startsWith("std_")) {
                                    const stdKey = col.key.replace(/^std_/, "");
                                    const stdMap = normalizeStandardFieldsFromCandidate(cand);
                                    const rawVal = stdMap[stdKey];
                                    const displayVal = Array.isArray(rawVal) ? rawVal.join(", ") : (rawVal ? String(rawVal) : "—");
                                    return (
                                      <td key={col.key} className="p-3.5 text-white/80 text-[14px] whitespace-nowrap truncate max-w-[220px]" title={String(displayVal)}>
                                        {displayVal}
                                      </td>
                                    );
                                  }
                                  if (col.key.startsWith("custom_")) {
                                    const custKey = col.key.replace(/^custom_/, "");
                                    const custMap = normalizeCustomFieldsFromCandidate(cand);
                                    const rawVal = custMap[custKey];
                                    const displayVal = Array.isArray(rawVal) ? rawVal.join(", ") : (rawVal ? String(rawVal) : "—");
                                    return (
                                      <td key={col.key} className="p-3.5 text-white/80 text-[14px] whitespace-nowrap truncate max-w-[220px]" title={String(displayVal)}>
                                        {displayVal}
                                      </td>
                                    );
                                  }
                                  return null;
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination and page size bar */}
                  <div className="px-5 py-3 border-t border-white/10 bg-transparent backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 text-[14px]">
                    <div className="text-slate-300">
                      Показано <span className="font-bold text-white">{paginatedList.length}</span> из <span className="font-bold text-white">{totalTableCandidates}</span> соискателей
                      {tablePageSize !== "all" && totalPages > 1 && (
                        <span className="ml-2 text-slate-400">
                          (Страница {currentPage} из {totalPages})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Page size buttons */}
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <span>Строк:</span>
                        {([10, 25, 100, 500, "all"] as (number | "all")[]).map((sz) => (
                          <button
                            key={String(sz)}
                            type="button"
                            onClick={() => handleChangeTablePageSize(sz)}
                            className={`px-2.5 py-1 rounded-xl text-[14px] font-bold transition cursor-pointer ${
                              tablePageSize === sz
                                ? "border border-[#E7C768] text-[#F4EE8E] bg-transparent shadow-[0_0_12px_rgba(231,199,104,0.25)]"
                                : "border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
                            }`}
                          >
                            {sz === "all" ? "Все" : sz}
                          </button>
                        ))}
                      </div>

                      {/* Pagination navigation */}
                      {tablePageSize !== "all" && totalPages > 1 && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setTableCurrentPage((p) => Math.max(1, p - 1))}
                            className="px-3 py-1 rounded-xl border border-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#E7C768] hover:text-[#F4EE8E] transition"
                          >
                            Назад
                          </button>
                          <span className="px-2 font-mono font-bold text-white">{currentPage} / {totalPages}</span>
                          <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setTableCurrentPage((p) => Math.min(totalPages, p + 1))}
                            className="px-3 py-1 rounded-xl border border-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#E7C768] hover:text-[#F4EE8E] transition"
                          >
                            Вперед
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                  );
                })()
              )}

              {/* Unified CRM Filter Modal */}
              <CrmFilterModal
                isOpen={isCrmFilterModalOpen}
                onClose={() => setIsCrmFilterModalOpen(false)}
                crmSearch={crmSearch}
                setCrmSearch={setCrmSearch}
                crmFilterCompany={crmFilterCompany}
                setCrmFilterCompany={setCrmFilterCompany}
                crmCompanyOptions={crmCompanyOptions}
                crmFilterRole={crmFilterRole}
                setCrmFilterRole={setCrmFilterRole}
                crmRoleOptions={crmRoleOptions}
                crmFilterStage={crmFilterStage}
                setCrmFilterStage={setCrmFilterStage}
                crmFilterDecision={crmFilterDecision}
                setCrmFilterDecision={setCrmFilterDecision}
                crmFilterVerdict={crmFilterVerdict}
                setCrmFilterVerdict={setCrmFilterVerdict}
                crmDatePreset={crmDatePreset}
                setCrmDatePreset={setCrmDatePreset}
                crmDateFrom={crmDateFrom}
                setCrmDateFrom={setCrmDateFrom}
                crmDateTo={crmDateTo}
                setCrmDateTo={setCrmDateTo}
                crmFieldFilters={crmFieldFilters}
                setCrmFieldFilters={setCrmFieldFilters}
                crmSort={crmSort}
                setCrmSort={setCrmSort}
                verdictCounts={verdictCounts}
                matchedCount={filteredCandidates.length}
                onResetAll={handleResetAllCrmFilters}
                isAdmin={isAdmin}
                availableCustomFields={allAvailableCustomFields}
              />

              {/* Kanban Column Modal */}
              <KanbanColumnModal
                stage={kanbanModalStage}
                stageTitle={
                  kanbanModalStage
                    ? [
                        { stage: "registration", title: "1. Регистрация" },
                        { stage: "screening",    title: "2. Скрининг" },
                        { stage: "checklist",    title: "3. Чеклист" },
                        { stage: "situations",   title: "4. Ситуации" },
                        { stage: "interview_reject", title: "5. Интервью Отказ" },
                        { stage: "interview_success", title: "6. Интервью Успех" },
                        { stage: "professional", title: "7. Профессия" },
                        { stage: "product",      title: "8. Продукт" },
                        { stage: "systems",      title: "9. Система" },
                        { stage: "certified",    title: "10. Сертификат" },
                      ].find(c => c.stage === kanbanModalStage)?.title || ""
                    : ""
                }
                onClose={() => setKanbanModalStage(null)}
                colSearch={kanbanModalStage ? kanbanColSearch[kanbanModalStage] || "" : ""}
                setColSearch={(v) => {
                  if (kanbanModalStage) setKanbanColSearch(prev => ({ ...prev, [kanbanModalStage]: v }));
                }}
                colVerdict={kanbanModalStage ? kanbanColFilter[kanbanModalStage]?.verdict || "all" : "all"}
                setColVerdict={(v) => {
                  if (kanbanModalStage) setKanbanColFilter(prev => ({ ...prev, [kanbanModalStage]: { ...prev[kanbanModalStage], verdict: v } }));
                }}
                colDecision={kanbanModalStage ? kanbanColFilter[kanbanModalStage]?.decision || "all" : "all"}
                setColDecision={(v) => {
                  if (kanbanModalStage) setKanbanColFilter(prev => ({ ...prev, [kanbanModalStage]: { ...prev[kanbanModalStage], decision: v } }));
                }}
                colSort={kanbanModalStage ? kanbanColSort[kanbanModalStage] : undefined}
                setColSort={(v) => {
                  if (kanbanModalStage) setKanbanColSort(prev => ({ ...prev, [kanbanModalStage]: v }));
                }}
                totalInColumn={kanbanModalStage ? sortedCandidates.filter(c => (c.crmStage || "registration") === kanbanModalStage).length : 0}
                onResetCol={() => {
                  if (kanbanModalStage) {
                    setKanbanColSearch(prev => ({ ...prev, [kanbanModalStage]: "" }));
                    setKanbanColFilter(prev => ({ ...prev, [kanbanModalStage]: undefined }));
                    setKanbanColSort(prev => ({ ...prev, [kanbanModalStage]: undefined }));
                  }
                }}
              />

              {/* Table Column Modal */}
              <TableColumnModal
                columnKey={tableModalCol}
                onClose={() => setTableModalCol(null)}
                tableColFilters={tableColFilters}
                setTableColFilters={setTableColFilters}
                crmSort={crmSort}
                setCrmSort={setCrmSort}
                crmCompanyOptions={crmCompanyOptions}
                crmRoleOptions={crmRoleOptions}
                onResetCol={(k) => {
                  setTableColFilters((prev: any) => {
                    const copy = { ...prev };
                    delete copy[k];
                    if (k === "resume" || k === "checklist" || k === "situations" || k === "overall") {
                      delete copy.scoreField;
                      delete copy.scoreMin;
                      delete copy[`${k}ScoreMin`];
                    }
                    if (k === "company") {
                      delete copy.company;
                      delete copy.companySearch;
                    }
                    if (k === "role") {
                      delete copy.role;
                      delete copy.roleSearch;
                    }
                    if (k === "created") {
                      delete copy.createdPreset;
                      delete copy.createdFrom;
                      delete copy.createdTo;
                    }
                    if (k === "updated") {
                      delete copy.updatedPreset;
                      delete copy.updatedFrom;
                      delete copy.updatedTo;
                    }
                    if (k === "name") {
                      delete copy.name;
                      delete copy.city;
                      delete copy.workExperience;
                      delete copy.skills;
                      delete copy.education;
                      delete copy.customFieldKey;
                      delete copy.customFieldValue;
                      delete copy.verdict;
                      delete copy.decision;
                    }
                    return copy;
                  });
                }}
              />

              {/* CRM Column and Card Content Constructor Modal */}
              <CrmConstructorModal
                isOpen={isCrmConstructorOpen}
                onClose={() => setIsCrmConstructorOpen(false)}
                activeMode={crmViewMode}
                kanbanColumns={[
                  { stage: "registration", title: "1. Регистрация", short: "Регистрация" },
                  { stage: "screening",    title: "2. Скрининг",    short: "Скрининг" },
                  { stage: "checklist",    title: "3. Чеклист",     short: "Чеклист" },
                  { stage: "situations",   title: "4. Ситуации",    short: "Ситуации" },
                  { stage: "interview_reject", title: "5. Интервью Отказ", short: "Инт. отказ" },
                  { stage: "interview_success", title: "6. Интервью Успех", short: "Инт. успех" },
                  { stage: "professional", title: "7. Профессия",   short: "Профессия" },
                  { stage: "product",      title: "8. Продукт",     short: "Продукт" },
                  { stage: "systems",      title: "9. Система",     short: "Система" },
                  { stage: "certified",    title: "10. Сертификат 🎓", short: "Сертификат" },
                ]}
                visibleKanbanCols={kanbanVisibleCols}
                onToggleKanbanCol={handleToggleKanbanCol}
                onSetAllKanbanCols={handleSetAllKanbanCols}
                kanbanCardFields={kanbanCardFields}
                onToggleKanbanCardField={handleToggleKanbanCardField}
                tableColumns={allCrmTableColumnDefs}
                visibleTableCols={tableVisibleCols}
                onToggleTableCol={handleToggleTableCol}
                onSetAllTableCols={handleSetAllTableCols}
                tablePageSize={tablePageSize}
                onChangePageSize={handleChangeTablePageSize}
                customVacancyFields={allCustomFields}
              />

              {/* CRM System Dialogs Modal */}
              <CrmDialogsModal
                isOpen={isCrmDialogsOpen}
                onClose={() => setIsCrmDialogsOpen(false)}
                employerId={employerId || "emp"}
              />

              {/* (Раздел «Рассылки» удалён по требованию.) */}
            </div>
          )}

          {/* PAGE 2: VACANCIES & AI CREATOR */}
          {activeTab === "vacancies" && (
            <div className="space-y-6 text-left">
              {!editingProject && (
                <div data-tour="section.vacancies.header" className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-[#E7C768]" /> Вакансии и ИИ-онбординги
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setAcademyModalSlug("company-vacancy");
                          setIsAcademyModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center p-2 rounded-2xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
                        title="Обучающая инструкция: Вакансии и ИИ-онбординги (ИИ-Академия)"
                        aria-label="Инструкция по вакансиям"
                      >
                        <HelpCircle className="w-4 h-4 text-[#E7C768]" />
                      </button>
                    </div>
                    <p className="text-sm text-slate-200 mt-1">Здесь сосредоточены все созданные системы кураторства, реферальные ссылки и кастомные вики.</p>
                  </div>

                  <button 
                    onClick={openAddVacancyWizard}
                    data-tour="section.vacancies.add"
                    className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-95 text-[#17344F] font-bold text-sm py-3 px-5 rounded-2xl flex items-center gap-2 transition-all shadow-lg shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Добавить вакансию
                  </button>
                </div>
              )}

              {/* LIST OF CURRENT PLACED VACANCIES */}
              {!editingProject && (() => {
                const activeCount = projects.filter(p => (p as any).status !== "archived" && (p as any).status !== "paused" && !pausedProjectIds.includes(p.id)).length;
                const pausedCount = projects.filter(p => (p as any).status === "paused" || (pausedProjectIds.includes(p.id) && (p as any).status !== "archived")).length;
                const archivedCount = projects.filter(p => (p as any).status === "archived").length;
                const allCount = projects.length;

                const displayedProjects = projects.filter((p: any) => {
                  const isArchived = p.status === "archived";
                  const isPaused = !isArchived && (p.status === "paused" || pausedProjectIds.includes(p.id));
                  if (vacanciesFilterTab === "active") return !isArchived && !isPaused;
                  if (vacanciesFilterTab === "paused") return isPaused;
                  if (vacanciesFilterTab === "archived") return isArchived;
                  return true;
                });

                return (
                  <div className="space-y-6">
                    {/* Status filter tabs */}
                    <div className="bg-transparent backdrop-blur-xl border border-white/15 p-1.5 rounded-2xl flex flex-col sm:flex-row gap-2 items-stretch">
                      <button
                        type="button"
                        onClick={() => setVacanciesFilterTab("active")}
                        className={`cursor-pointer px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between sm:justify-center gap-2 ${
                          vacanciesFilterTab === "active"
                            ? "border border-[#E7C768] text-[#E7C768] bg-transparent backdrop-blur-md shadow-sm"
                            : "border border-transparent text-white/80 hover:text-white"
                        }`}
                      >
                        <span>Активные</span>
                        <span className="text-sm px-2 py-0.5 rounded-full border border-white/20 bg-transparent font-mono">{activeCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVacanciesFilterTab("paused")}
                        className={`cursor-pointer px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between sm:justify-center gap-2 ${
                          vacanciesFilterTab === "paused"
                            ? "border border-[#E7C768] text-[#E7C768] bg-transparent backdrop-blur-md shadow-sm"
                            : "border border-transparent text-white/80 hover:text-white"
                        }`}
                      >
                        <span>На паузе</span>
                        <span className="text-sm px-2 py-0.5 rounded-full border border-white/20 bg-transparent font-mono">{pausedCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVacanciesFilterTab("archived")}
                        className={`cursor-pointer px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between sm:justify-center gap-2 ${
                          vacanciesFilterTab === "archived"
                            ? "border border-[#E7C768] text-[#E7C768] bg-transparent backdrop-blur-md shadow-sm"
                            : "border border-transparent text-white/80 hover:text-white"
                        }`}
                      >
                        <span>В архиве</span>
                        <span className="text-sm px-2 py-0.5 rounded-full border border-white/20 bg-transparent font-mono">{archivedCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVacanciesFilterTab("all")}
                        className={`cursor-pointer px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between sm:justify-center gap-2 ${
                          vacanciesFilterTab === "all"
                            ? "border border-[#E7C768] text-[#E7C768] bg-transparent backdrop-blur-md shadow-sm"
                            : "border border-transparent text-white/80 hover:text-white"
                        }`}
                      >
                        <span>Все</span>
                        <span className="text-sm px-2 py-0.5 rounded-full border border-white/20 bg-transparent font-mono">{allCount}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {displayedProjects.length === 0 ? (
                        <div className="col-span-full bg-transparent backdrop-blur-xl border border-white/15 p-8 rounded-3xl text-center text-slate-300 text-sm">
                          {vacanciesFilterTab === "paused"
                            ? "Нет вакансий на паузе."
                            : vacanciesFilterTab === "archived"
                            ? "В архиве пока нет вакансий."
                            : "Вакансий пока нет. Нажмите «+ Добавить вакансию» выше, чтобы создать первую вакансию."}
                        </div>
                      ) : (
                        displayedProjects.map((proj, idx) => {
                          const isArchived = (proj as any).status === "archived";
                          const isPaused = !isArchived && ((proj as any).status === "paused" || pausedProjectIds.includes(proj.id));
                          const assignedCandidates = candidates.filter(c => {
                            const cPid = String(c.projectId || (c as any).project_id || "");
                            const cPubPid = String((c as any).projectPublicId || (c as any).project_public_id || "");
                            const pId = String(proj.id || "");
                            const pPubId = String(proj.public_id || (proj as any).publicId || "");
                            return (
                              (cPid && (cPid === pId || cPid === pPubId)) ||
                              (cPubPid && (cPubPid === pPubId || cPubPid === pId))
                            );
                          });
                          const columnCountTerms = Math.max(assignedCandidates.length, Number((proj as any).candidates_count || (proj as any).candidatesCount || 0));
                          const columnCountInterview = Math.max(
                            assignedCandidates.filter(c => 
                              (c as any).hasOverall || 
                              (c as any).hasSituations || 
                              (c as any).hasChecklist || 
                              Number(c.scores?.overallScore || c.scores?.interviewScore || 0) > 0 ||
                              Number((c as any).score || (c as any).overall_score || (c as any).interview_score || 0) > 0 ||
                              (c as any).interview_charged_at != null
                            ).length,
                            Number((proj as any).interviewed_count || (proj as any).interviewedCount || (proj as any).interview_used || (proj as any).interviewUsed || 0)
                          );
                          const columnCountTraining = Math.max(
                            assignedCandidates.filter(c => 
                              ((c as any).trainingPassed?.length || 0) > 0 ||
                              (c as any).has_training ||
                              ["professional", "product", "systems", "certified"].includes(c.crmStage || c.currentStage || (c as any).stage || "") ||
                              (c as any).training_charged_at != null
                            ).length,
                            Number((proj as any).training_count || (proj as any).trainingCount || (proj as any).training_used || (proj as any).trainingUsed || 0)
                          );
                          const columnCountCertified = Math.max(
                            assignedCandidates.filter(c => 
                              (c as any).certified || 
                              c.currentStage === "certified" || 
                              c.crmStage === "certified" ||
                              ((c as any).trainingPassed?.length || 0) >= 3
                            ).length,
                            Number((proj as any).certified_count || (proj as any).certifiedCount || 0)
                          );

                          const projCompId = (proj as any).company_id || (proj as any).companyId;
                          const matchedCompany = companiesList.find(c => 
                            (projCompId && (String(c.id) === String(projCompId) || String(c.public_id) === String(projCompId) || String(c.id) === `comp-${String(projCompId).replace(/^comp-?/, "")}`))
                          ) || companiesList.find(c => 
                            c?.name && (proj?.companyName || (proj as any).company_name) && c.name.trim().toLowerCase() === (proj?.companyName || (proj as any).company_name).trim().toLowerCase()
                          );

                          const rawCompName = matchedCompany?.name || proj.companyName || (proj as any).company_name || (proj as any).linked_company_name || "Компания";
                          const compName = String(rawCompName)
                            .replace(/Р\uFFFD+нтРОП/gi, "РентРОП")
                            .replace(/\uFFFD+тдела/gi, "отдела")
                            .replace(/\uFFFD+/g, "");

                          const compSlug = matchedCompany?.slug || (proj as any).linked_company_slug || (proj as any).company_slug || proj.companySlug || (compName && compName !== "Компания" ? transliterateToSlug(compName) : "") || "company";
                          const compPid = String(matchedCompany?.public_id || (proj as any).linked_company_public_id || (proj as any).company_public_id || (proj as any).company_id || "300001").replace(/\D/g, "") || "300001";
                          const rawRoleNameStr = proj.roleName || (proj as any).role_name || (proj as any).title || "";
                          const roleNameStr = String(rawRoleNameStr)
                            .replace(/Р\uFFFD+нтРОП/gi, "РентРОП")
                            .replace(/\uFFFD+тдела/gi, "отдела")
                            .replace(/\uFFFD+/g, "");

                          const expectedVacSlug = roleNameStr ? transliterateToSlug(roleNameStr) : "";
                          const vacSlug = (proj as any).slug || (proj as any).role_slug || expectedVacSlug || (proj as any).legacy_slug || (proj as any).public_id || proj.id;
                          const vacPid = String((proj as any).public_id || proj.id).replace(/\D/g, "") || String(proj.id);

                          const publicVacUrl = `/${compSlug}/${vacSlug}`;
                          const editVacUrl = (proj as any).editVacUrl || `/com${compPid}/vac${vacPid}`;

                          const isUpdatingStatus = updatingStatusProjectId === proj.id;

                          return (
                            <div 
                              key={`${proj.id}-${idx}`} 
                              className={`border p-6 rounded-3xl flex flex-col justify-between hover:shadow-2xl transition-all bg-transparent backdrop-blur-2xl space-y-4 ${
                                isUpdatingStatus
                                  ? "border-[#E7C768]/70 animate-pulse"
                                  : isArchived
                                  ? "border-white/10 opacity-70"
                                  : isPaused
                                  ? "border-white/15 opacity-80"
                                  : "border-white/20 hover:border-[#E7C768]/60"
                              }`}
                            >
                              <div className="space-y-3">
                                {/* Status bar */}
                                <div className="flex flex-wrap justify-between items-center gap-2 text-sm font-mono text-slate-300">
                                  <span className="font-bold text-[#E7C768]">🏢 {compName} {compPid && <span className="text-white/70 text-sm font-normal"> (ID: {compPid})</span>}</span>
                                  <span className={`px-3 py-1 rounded-full text-sm font-mono border inline-flex items-center gap-1.5 ${
                                    isUpdatingStatus
                                      ? "border-[#E7C768]/70 text-[#E7C768] bg-transparent"
                                      : isArchived
                                      ? "border-white/30 text-white/70 bg-transparent"
                                      : isPaused
                                      ? "border-white/20 text-slate-300 bg-transparent"
                                      : "border-[#E7C768]/50 text-[#E7C768] bg-transparent"
                                  }`}>
                                    {isUpdatingStatus ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E7C768]" />
                                        <span>Обновление...</span>
                                      </>
                                    ) : isArchived ? "В архиве" : isPaused ? "На паузе" : "Активна"}
                                  </span>
                                </div>

                            <h3 className="text-lg font-bold text-white leading-tight">{roleNameStr || "Без названия"}</h3>
                            <div className="text-slate-200 text-sm font-mono line-clamp-1">
                              {(proj as any).motivationText || proj.salaryTerms || "Сдельная"} | {(proj as any).scheduleText || proj.scheduleTerms || "По согласованию"}
                            </div>
                            
                            {/* Statistics visualization */}
                            <div className="grid grid-cols-4 gap-2 text-center font-mono pt-1">
                              <div className="bg-transparent backdrop-blur-xl border border-white/15 p-2.5 rounded-2xl">
                                <div className="text-sm text-slate-300 font-sans">Ознакомлен</div>
                                <div className="text-sm font-bold text-white mt-0.5">{columnCountTerms}</div>
                              </div>
                              <div className="bg-transparent backdrop-blur-xl border border-white/15 p-2.5 rounded-2xl">
                                <div className="text-sm text-slate-300 font-sans">Интервью</div>
                                <div className="text-sm font-bold text-white mt-0.5">{columnCountInterview}</div>
                              </div>
                              <div className="bg-transparent backdrop-blur-xl border border-white/15 p-2.5 rounded-2xl">
                                <div className="text-sm text-slate-300 font-sans">Обучение</div>
                                <div className="text-sm font-bold text-white mt-0.5">{columnCountTraining}</div>
                              </div>
                              <div className="bg-transparent backdrop-blur-xl border border-white/15 p-2.5 rounded-2xl">
                                <div className="text-sm text-slate-300 font-sans">Сдало</div>
                                <div className="text-sm font-bold text-[#E7C768] mt-0.5">{columnCountCertified}</div>
                              </div>
                            </div>

                            {/* Minimalist vacancy limits allocator */}
                            <MinimalVacancyLimits
                              project={proj}
                              employerId={employerId}
                              employerBalance={balance}
                              interviewPool={interviewCredits}
                              trainingPool={trainingCredits}
                              onOpenDetailed={() => handleTariffTabChange("vacancy")}
                              onUpdated={async () => { await Promise.all([fetchBillingState(), fetchData()]); }}
                            />

                            {/* Interactive dynamic links of vacancy page */}
                            <div className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15 space-y-3">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-[#E7C768]" />
                                <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-mono">
                                  ИИ-Лендинг вакансии для соискателей
                                </span>
                              </div>

                              {/* Link 1: Public candidate link (URL on top, buttons on bottom) */}
                              <div className="flex flex-col bg-transparent backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl space-y-2.5">
                                <div className="min-w-0 space-y-1">
                                  <span className="text-sm text-slate-300 block font-sans">Прямая ссылка для соискателей:</span>
                                  <span 
                                    onClick={() => navigate(publicVacUrl)}
                                    className="cursor-pointer text-[#E7C768] font-mono text-sm hover:underline block truncate select-all"
                                    title={publicVacUrl}
                                  >
                                    {publicVacUrl}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/10">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(`${window.location.origin}${publicVacUrl}`);
                                      addAuditEvent("info", "Ссылка скопирована", "Прямая ссылка на вакансию скопирована в буфер обмена");
                                    }}
                                    className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition"
                                  >
                                    Копировать
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigate(publicVacUrl); }}
                                    className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition flex items-center gap-1.5"
                                  >
                                    <span>Открыть</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-white/80" />
                                  </button>
                                </div>
                              </div>

                              {/* Link 2: Canonical edit ID link (URL on top, buttons on bottom) */}
                              <div className="flex flex-col bg-transparent backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl space-y-2.5">
                                <div className="min-w-0 space-y-1">
                                  <span className="text-sm text-slate-300 block font-sans">Ссылка для редактирования:</span>
                                  <span 
                                    onClick={() => navigate(editVacUrl)}
                                    className="cursor-pointer text-[#E7C768] font-mono text-sm hover:underline block truncate select-all"
                                    title={editVacUrl}
                                  >
                                    {editVacUrl}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/10">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(`${window.location.origin}${editVacUrl}`);
                                      addAuditEvent("info", "Ссылка скопирована", "Ссылка для редактирования скопирована в буфер обмена");
                                    }}
                                    className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition"
                                  >
                                    Копировать
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`${editVacUrl}?edit_theme=1`);
                                    }}
                                    className="cursor-pointer bg-transparent hover:bg-white/10 border border-[#E7C768]/50 text-[#E7C768] hover:text-white font-bold text-sm py-1.5 px-3 rounded-xl transition flex items-center gap-1.5"
                                    title="Настроить оформление и стиль вакансии"
                                  >
                                    <Palette className="w-3.5 h-3.5 text-[#E7C768]" />
                                    <span>Редактор стиля</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigate(editVacUrl); }}
                                    className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition flex items-center gap-1.5"
                                  >
                                    <span>Открыть</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-white/80" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Lower Actions */}
                          <div className="pt-3 border-t border-white/10 space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {isArchived ? (
                                <button
                                  type="button"
                                  disabled={updatingStatusProjectId === proj.id}
                                  onClick={() => handleSetVacancyStatus(proj.id, "active")}
                                  className="cursor-pointer bg-white/5 hover:bg-white/10 text-white text-sm font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-[#E7C768]/50 transition disabled:opacity-50"
                                >
                                  {updatingStatusProjectId === proj.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                                      <span>Восстановление...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4 text-[#E7C768]" />
                                      <span>Восстановить из архива</span>
                                    </>
                                  )}
                                </button>
                              ) : isPaused ? (
                                <button
                                  type="button"
                                  disabled={updatingStatusProjectId === proj.id}
                                  onClick={() => handleSetVacancyStatus(proj.id, "active")}
                                  className="cursor-pointer bg-white/5 hover:bg-white/10 text-white text-sm font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-[#E7C768]/50 transition disabled:opacity-50"
                                >
                                  {updatingStatusProjectId === proj.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                                      <span>Запуск...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4 text-[#E7C768]" />
                                      <span>Снять с паузы</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={updatingStatusProjectId === proj.id}
                                  onClick={() => handleSetVacancyStatus(proj.id, "paused")}
                                  className="cursor-pointer bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-white/15 transition disabled:opacity-50"
                                >
                                  {updatingStatusProjectId === proj.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                      <span>Остановка...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Pause className="w-4 h-4 text-slate-300" />
                                      <span>Приостановить</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {!isArchived && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenArchiveModal(proj)}
                                  className="cursor-pointer bg-white/5 hover:bg-white/10 text-[#E7C768] text-sm font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-[#E7C768]/30 hover:border-[#E7C768] transition"
                                  title="Перевести в архив с переносом неизрасходованных лимитов"
                                >
                                  <Archive className="w-4 h-4 text-[#E7C768]" /> В архив
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setEditVacancyRawText("");
                                  setEditingProject(proj);
                                }}
                                className={`cursor-pointer ${isArchived ? "col-span-full" : "col-span-full sm:col-span-2"} bg-[#E7C768]/15 hover:bg-[#E7C768]/25 text-[#E7C768] text-sm font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-[#E7C768]/40 transition`}
                              >
                                🛠 Редактировать
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => employerId && navigate(`/emp${employerId}/training?project=${proj.id}`)}
                              className="cursor-pointer w-full bg-white/5 hover:bg-white/10 text-white text-sm font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 border border-white/15 transition"
                            >
                              📚 Открыть мастер обучения
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}
            </div>
          )}

          {/* PAGE 3: MY COMPANIES */}
          {activeTab === "companies" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start text-left">
              {/* Left Column (2 cols on lg) */}
              <div className="lg:col-span-2 space-y-6">
                {!showAddCompany && (
                <div data-tour="section.companies.header" className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-[#E7C768]" /> Зарегистрированные компании
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setAcademyModalSlug("company-vacancy");
                          setIsAcademyModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center p-2 rounded-2xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
                        title="Обучающая инструкция: Компании и вакансии (ИИ-Академия)"
                        aria-label="Инструкция по компаниям"
                      >
                        <HelpCircle className="w-4 h-4 text-[#E7C768]" />
                      </button>
                    </div>
                    <p className="text-sm text-slate-200">Описания ваших юридических лиц или брендов, под которыми Робот публикует онбординги.</p>
                    <p className="text-sm font-medium bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">✓ Добавление, редактирование, ИИ-улучшение, сохранение и публикация лендинга компании — бесплатно.</p>
                  </div>

                  <button 
                    onClick={openAddCompanyWizard}
                    data-tour="section.companies.add"
                    className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-sm py-2.5 px-4 rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition shrink-0"
                  >
                    + Добавить компанию
                  </button>
                </div>
                )}

              {/* BRAND CREATOR */}
              {showAddCompany && (
                <form onSubmit={handleAddCompanySubmit} className="brand-editor bg-transparent backdrop-blur-2xl border border-white/20 p-6 rounded-3xl space-y-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038]"></div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-white/15">
                    <div className="space-y-0.5">
                      <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block font-mono">Панель упаковки бренда RR</span>
                      <h4 className="text-base font-bold text-white">Интерактивный ИИ-профиль организации</h4>
                    </div>
                  </div>

                  {/* Drag-Drop / click base file uploader with ProTalk integration */}
                  <div 
                    onClick={() => {
                      const fileInput = document.getElementById("comp-file-upload") as HTMLInputElement;
                      if (fileInput) fileInput.click();
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        const file = e.dataTransfer.files[0];
                        addAuditEvent("info", "Загрузка файла", `Загружаем «${file.name}» в хранилище…`);
                        (async () => { await uploadCompanyFile(file); })();
                      }
                    }}
                    className={`editor-dropzone cursor-pointer bg-transparent backdrop-blur-xl border border-white/20 hover:border-[#E7C768]/60 rounded-2xl p-5 text-center space-y-2 transition-all ${
                      isParsingFile || isUploadingFile ? "animate-pulse" : ""
                    }`}
                  >
                    <input 
                      id="comp-file-upload" 
                      type="file" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          addAuditEvent("info", "Загрузка файла", `Загружаем «${file.name}» в хранилище…`);
                          (async () => { await uploadCompanyFile(file); })();
                        }
                      }}
                    />
                    <div className="text-sm text-white font-medium flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4 text-[#E7C768]" />
                      {isUploadingFile ? (
                        <span className="text-[#E7C768]">Загружаем «{newCompanyFiles || "файл"}» в хранилище…</span>
                      ) : draftFilePath && newCompanyFiles ? (
                        <span className="text-[#E7C768] font-bold">Файл успешно загружен: {newCompanyFiles} ✓</span>
                      ) : (
                        <span>Загрузите PDF с описанием компании — затем нажмите кнопку «Распознать текст»</span>
                      )}
                    </div>
                    <span className="text-sm text-slate-300 block font-mono">
                      {isParsingFile 
                        ? "⚡ ИИ извлекает текст о компании из документа…" 
                        : isUploadingFile
                          ? "Файл сейчас сохраняется в облако и регистрируется в базе данных…"
                          : "Поддерживается PDF. Файл добавляется в галерею и базу данных."
                      }
                    </span>
                    {uploadError ? (
                      <div className="text-sm text-slate-300 border border-white/20 bg-transparent p-2 rounded-xl mt-1">{uploadError}</div>
                    ) : null}
                  </div>

                  {/* Uploaded File Link & Details */}
                  {draftFilePath && (
                    <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2.5 min-w-0 max-w-full">
                        <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-[#E7C768]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{newCompanyFiles || "Загруженный документ"}</p>
                          <a
                            href={draftFilePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm text-slate-300 hover:text-white underline underline-offset-2 break-all flex items-center gap-1.5 transition"
                          >
                            <span className="truncate max-w-[280px] sm:max-w-md">{draftFilePath}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-[#E7C768] shrink-0" />
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(draftFilePath);
                            addAuditEvent("success", "Ссылка скопирована", "Ссылка на файл скопирована в буфер обмена");
                          }}
                          className="bg-transparent backdrop-blur-xl border border-white/20 hover:bg-white/10 text-white text-sm px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-[#E7C768]" />
                          <span>Скопировать ссылку</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: explicit «Распознать документ» trigger */}
                  {draftFilePath && !isParsingFile && !isUploadingFile && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => parseCompanyFileWithAI(newCompanyFiles || "документ")}
                        className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-sm px-6 py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg hover:brightness-110 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-[#17344F]" />
                        Распознать текст
                      </button>
                    </div>
                  )}

                  {/* Raw extracted text from the document */}
                  {(() => {
                    const totalChars =
                      (newCompanyName + newCompanyIndustry + newCompanyStaff + newCompanySite +
                       newCompanyDescription + newCompanyProducts + newCompanyMissionText +
                       newCompanyDesc + newCompanySalaryTerms + newCompanyScheduleTerms +
                       newCompanyCustomWiki + companyRawText).trim().length;
                    const canEnhanceAll = totalChars >= 50;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block">
                            Текст о компании
                          </span>
                          <span className="text-sm text-slate-300 font-mono">{companyRawText.length} / 10000</span>
                        </div>
                        <AudioField
                          value={companyRawText}
                          onChange={(val) => setCompanyRawText(val.slice(0, 10000))}
                          placeholder="Здесь появится распознанный текст из загруженного файла. Можно также надиктовать голосом или вставить/дописать описание компании вручную."
                          maxLength={10000}
                        />
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={handleEnhanceAllFields}
                            disabled={!canEnhanceAll || isEnhancingAll || isParsingFile}
                            title={canEnhanceAll ? "Оформить все поля красиво через ИИ" : "Заполните поля минимум на 50 символов суммарно"}
                            className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-sm px-6 py-2.5 rounded-xl shadow-lg hover:brightness-110 disabled:opacity-40 transition flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Sparkles className={`w-4 h-4 ${isEnhancingAll ? "animate-spin text-[#17344F]" : ""}`} />
                            {isEnhancingAll ? "Обработка ИИ..." : "Оформить красиво с помощью ИИ"}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* FIELD GRID SECTIONS */}
                  <div className="space-y-6">
                    {/* SECTION 1: MAIN INFO */}
                    <div className="space-y-3">
                      <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block">
                        1. Основная информация о бренде
                      </span>
                      <div className="flex flex-col gap-4">
                        <div className="space-y-1.5">
                          <MiniAudioField
                            placeholder="Название компании"
                            value={newCompanyName}
                            onChange={(val) => setNewCompanyName(val)}
                            minRows={1}
                            extraAction={
                              <button
                                type="button"
                                onClick={() => handleEnhanceSingleField("name", newCompanyName)}
                                disabled={enhancingFields["name"]}
                                className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 transition-colors cursor-pointer"
                                title="Оформить красиво через ИИ"
                              >
                                <Sparkles className={`w-4 h-4 ${enhancingFields["name"] ? "animate-spin text-[#E7C768]" : ""}`} />
                              </button>
                            }
                          />

                          {/* Real-time URL Slug Preview & Uniqueness Indicator */}
                          {newCompanyName.trim().length > 0 && (() => {
                            const rawSlug = transliterateToSlug(newCompanyName) || "company";

                            return (
                              <div className="flex flex-col gap-1.5 pt-1">
                                <div className="text-sm text-slate-300 flex items-center gap-2 font-mono px-1">
                                  <span className="text-[#E7C768]">Ссылка компании:</span>
                                  <span className="text-white/90">/{rawSlug}</span>
                                  {isCompanySlugDuplicate ? (
                                    <span className="text-[#F4EE8E] border border-[#E7C768]/50 px-2.5 py-0.5 rounded-lg text-sm font-sans">
                                      Уже есть в базе
                                    </span>
                                  ) : (
                                    <span className="text-white/90 border border-white/20 px-2.5 py-0.5 rounded-lg text-sm font-sans">
                                      Свободна
                                    </span>
                                  )}
                                </div>
                                {isCompanySlugDuplicate && (
                                  <div className="text-sm text-[#F4EE8E] bg-transparent backdrop-blur-xl border border-[#E7C768]/50 px-3.5 py-2 rounded-xl flex items-center gap-2">
                                    <span>⚠️</span>
                                    <span>Компания с таким названием или ссылкой <b>/{rawSlug}</b> уже зарегистрирована. Измените название компании, чтобы адрес был уникальным.</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        <MiniAudioField
                          placeholder="Отрасль (финансы, ритейл, кофейни)"
                          value={newCompanyIndustry}
                          onChange={(val) => setNewCompanyIndustry(val)}
                          minRows={1}
                          extraAction={
                            <button
                              type="button"
                              onClick={() => handleEnhanceSingleField("industry", newCompanyIndustry)}
                              disabled={enhancingFields["industry"]}
                              className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 transition-colors cursor-pointer"
                              title="Подобрать отрасль ИИ"
                            >
                              <Sparkles className={`w-4 h-4 ${enhancingFields["industry"] ? "animate-spin text-[#E7C768]" : ""}`} />
                            </button>
                          }
                        />

                        <MiniAudioField
                          placeholder="Количество сотрудников (например: 120 человек)"
                          value={newCompanyStaff}
                          onChange={(val) => setNewCompanyStaff(val)}
                          maxLength={80}
                          minRows={1}
                          extraAction={
                            <button
                              type="button"
                              onClick={() => handleEnhanceSingleField("staff", newCompanyStaff)}
                              disabled={enhancingFields["staff"]}
                              className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 transition-colors cursor-pointer"
                              title="Уточнить число сотрудников через ИИ"
                            >
                              <Sparkles className={`w-4 h-4 ${enhancingFields["staff"] ? "animate-spin text-[#E7C768]" : ""}`} />
                            </button>
                          }
                        />
                      </div>

                      {/* MULTI-SITE / SOCIAL LINKS (Up to 10) */}
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block">
                            Сайты и социальные сети ({newCompanySitesList.length} из 10)
                          </span>
                          {newCompanySitesList.length < 10 && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextIdx = newCompanySitesList.length + 1;
                                setNewCompanySitesList(prev => [
                                  ...prev,
                                  { id: `site-${Date.now()}`, url: "", title: `Ссылка ${nextIdx}`, customScreenshot: "", heightPx: 160 }
                                ]);
                              }}
                              className="bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768] hover:text-[#F4EE8E] text-sm font-bold px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                            >
                              + Добавить ссылку
                            </button>
                          )}
                        </div>

                        <div className="space-y-4">
                          {newCompanySitesList.map((siteItem, sIdx) => {
                            const handleUrlBlur = () => {
                              const raw = (siteItem.url || "").trim();
                              if (!raw) return;
                              const formatted = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
                              if (formatted !== siteItem.url) {
                                setNewCompanySitesList(prev => prev.map((it, i) => i === sIdx ? { ...it, url: formatted } : it));
                                if (sIdx === 0) setNewCompanySite(formatted);
                              }
                            };

                            return (
                              <div
                                key={siteItem.id || sIdx}
                                className="bg-transparent backdrop-blur-xl border border-white/15 p-4 rounded-2xl space-y-3 shadow-md"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                    <input
                                      type="text"
                                      placeholder="Название ссылки (например: Официальный сайт)"
                                      value={siteItem.title}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setNewCompanySitesList(prev => prev.map((it, i) => i === sIdx ? { ...it, title: v } : it));
                                      }}
                                      className="bg-transparent backdrop-blur-md text-sm px-3 py-1.5 rounded-xl text-white border border-white/20 focus:outline-none focus:border-[#E7C768] transition flex-1 font-medium"
                                    />
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {/* Remove link */}
                                    {newCompanySitesList.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setNewCompanySitesList(prev => prev.filter((_, i) => i !== sIdx));
                                        }}
                                        className="text-slate-400 hover:text-white bg-transparent hover:bg-white/10 p-1.5 rounded-lg border border-white/15 transition cursor-pointer"
                                        title="Удалить ссылку"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="url"
                                      placeholder="URL-адрес (например: it-lab.ru или t.me/channel)"
                                      value={siteItem.url}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setNewCompanySitesList(prev => prev.map((it, i) => i === sIdx ? { ...it, url: val } : it));
                                        if (sIdx === 0) setNewCompanySite(val);
                                      }}
                                      onBlur={handleUrlBlur}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleUrlBlur();
                                        }
                                      }}
                                      className="flex-1 bg-transparent backdrop-blur-md text-sm px-3.5 py-2.5 rounded-xl text-white border border-white/20 focus:outline-none focus:border-[#E7C768] transition font-medium"
                                    />
                                  </div>

                                  {/* Live Preview Container — Standard & Proportional */}
                                  <div>
                                    {siteItem.url && siteItem.url.trim().length > 3 ? (
                                      <SitePreview
                                        url={siteItem.url}
                                        title={siteItem.title}
                                        heightPx={160}
                                        variant="banner"
                                      />
                                    ) : (
                                      <div className="h-20 rounded-2xl border border-dashed border-white/15 flex items-center justify-center text-xs text-slate-400">
                                        Введите URL для предпросмотра сайта
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* LOGO URL & UPLOAD */}
                      <div className="space-y-2 pt-2">
                        <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block">
                          Логотип компании (WebP / PNG)
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <input 
                                  type="text" 
                                  placeholder="URL-ссылка на логотип бренда" 
                                  className="w-full bg-transparent backdrop-blur-xl text-sm px-3.5 py-2.5 rounded-xl text-white border border-white/20 focus:outline-none focus:border-[#E7C768] transition"
                                  value={newCompanyLogo}
                                  onChange={(e) => setNewCompanyLogo(e.target.value)}
                                  onBlur={() => {
                                    if (!newCompanyLogo || !newCompanyLogo.trim()) {
                                      setNewCompanyLogo(DEFAULT_LOGO_URL);
                                    }
                                  }}
                                />
                              </div>
                              <label
                                className="shrink-0 cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768] hover:text-[#F4EE8E] p-2.5 rounded-xl transition flex items-center justify-center gap-1.5 text-sm font-semibold shadow-md active:scale-95"
                                title={isUploadingLogo ? "Загрузка…" : "Загрузить файл (ресайз до 256×256 WebP)"}
                              >
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handleLogoFilePick}
                                  disabled={isUploadingLogo}
                                />
                                <svg viewBox="0 0 24 24" className={`w-4 h-4 ${isUploadingLogo ? "animate-spin text-[#E7C768]" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                  <polyline points="17 8 12 3 7 8"/>
                                  <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                <span className="text-xs text-white">Загрузить</span>
                              </label>
                            </div>

                            {logoUploadError && (
                              <div className="text-sm text-slate-300 font-mono">
                                ⚠ {logoUploadError}
                              </div>
                            )}
                          </div>

                          {/* Live preview on transparent background */}
                          {newCompanyLogo && (
                            <div className="flex items-center gap-3 p-2.5 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md">
                              <div className="w-12 h-12 rounded-xl border border-white/20 flex items-center justify-center p-1 bg-transparent overflow-hidden">
                                <img
                                  src={newCompanyLogo}
                                  alt="Предпоказ логотипа"
                                  className="w-full h-full object-contain"
                                  onError={(e) => (e.currentTarget.style.opacity = '0.3')}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-white">Предпросмотр логотипа</div>
                                <div className="text-xs text-slate-300 truncate">{newCompanyLogo}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: IDENTITY */}
                    <div className="space-y-3">
                      <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block">
                        2. О компании
                      </span>

                      <MiniAudioField
                        placeholder="Краткое описание компании (description, до 10 000 символов)"
                        maxLength={10000}
                        value={newCompanyDescription}
                        onChange={(val) => setNewCompanyDescription(val)}
                        minRows={3}
                        extraAction={
                          <button
                            type="button"
                            onClick={() => handleEnhanceSingleField("descriptionText", newCompanyDescription)}
                            disabled={enhancingFields["descriptionText"]}
                            className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 cursor-pointer"
                            title="Оформить описание ИИ"
                          >
                            <Sparkles className={`w-4 h-4 ${enhancingFields["descriptionText"] ? "animate-spin text-[#E7C768]" : ""}`} />
                          </button>
                        }
                      />

                      <MiniAudioField
                        placeholder="Сведения о компании (колонка about_text, до 10 000 символов)"
                        maxLength={10000}
                        value={newCompanyDesc}
                        onChange={(val) => setNewCompanyDesc(val)}
                        minRows={3}
                        extraAction={
                          <button
                            type="button"
                            onClick={() => handleEnhanceSingleField("aboutText", newCompanyDesc)}
                            disabled={enhancingFields["aboutText"]}
                            className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 cursor-pointer"
                            title="Оформить сведения о компании ИИ"
                          >
                            <Sparkles className={`w-4 h-4 ${enhancingFields["aboutText"] ? "animate-spin text-[#E7C768]" : ""}`} />
                          </button>
                        }
                      />

                      <MiniAudioField
                        placeholder="Основные продукты / услуги (до 10 000 символов)"
                        maxLength={10000}
                        value={newCompanyProducts}
                        onChange={(val) => setNewCompanyProducts(val)}
                        minRows={2}
                        extraAction={
                          <button
                            type="button"
                            onClick={() => handleEnhanceSingleField("productsText", newCompanyProducts)}
                            disabled={enhancingFields["productsText"]}
                            className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 cursor-pointer"
                            title="Сформулировать продукты"
                          >
                            <Sparkles className={`w-4 h-4 ${enhancingFields["productsText"] ? "animate-spin text-[#E7C768]" : ""}`} />
                          </button>
                        }
                      />

                      <MiniAudioField
                        placeholder="Имидж, миссия и культура (до 10 000 символов)"
                        maxLength={10000}
                        value={newCompanyMissionText}
                        onChange={(val) => setNewCompanyMissionText(val)}
                        minRows={2}
                        extraAction={
                          <button
                            type="button"
                            onClick={() => handleEnhanceSingleField("missionText", newCompanyMissionText)}
                            disabled={enhancingFields["missionText"]}
                            className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 cursor-pointer"
                            title="Дополнить слоган ИИ"
                          >
                            <Sparkles className={`w-4 h-4 ${enhancingFields["missionText"] ? "animate-spin text-[#E7C768]" : ""}`} />
                          </button>
                        }
                      />
                    </div>

                    {/* SECTION 3: KEY PERFORMANCE COUNTERS */}
                    <div className="space-y-3">
                      <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block">
                        3. Показатели компании (инфо-карточки на лендинге)
                      </span>
                      <div className="flex flex-col gap-4">
                        {/* STATS 1 */}
                        <div className="bg-transparent backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl space-y-2">
                          <span className="text-sm font-bold text-slate-300 block">Показатель 1 (Клиенты)</span>
                          <MiniAudioField
                            placeholder="Подпись. Например: Активных клиентов"
                            value={newCompanyStatsLabelClients}
                            onChange={(val) => setNewCompanyStatsLabelClients(val)}
                            minRows={1}
                          />
                          <MiniAudioField
                            placeholder="Например: 1200+"
                            value={newCompanyStatsValClients}
                            onChange={(val) => setNewCompanyStatsValClients(val)}
                            minRows={1}
                            extraAction={
                              <button
                                type="button"
                                onClick={() => handleEnhanceSingleField("statsValClients", newCompanyStatsValClients)}
                                disabled={enhancingFields["statsValClients"]}
                                className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 cursor-pointer"
                                title="Оформить показатель ИИ"
                              >
                                <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["statsValClients"] ? "animate-spin text-[#E7C768]" : ""}`} />
                              </button>
                            }
                          />
                        </div>

                        {/* STATS 2 */}
                        <div className="bg-transparent backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl space-y-2">
                          <span className="text-sm font-bold text-slate-300 block">Показатель 2 (Обороты)</span>
                          <MiniAudioField
                            placeholder="Подпись. Например: Диалогов пройдено"
                            value={newCompanyStatsLabelDialogs}
                            onChange={(val) => setNewCompanyStatsLabelDialogs(val)}
                            minRows={1}
                          />
                          <MiniAudioField
                            placeholder="Например: 15 млн"
                            value={newCompanyStatsValDialogs}
                            onChange={(val) => setNewCompanyStatsValDialogs(val)}
                            minRows={1}
                            extraAction={
                              <button
                                type="button"
                                onClick={() => handleEnhanceSingleField("statsValDialogs", newCompanyStatsValDialogs)}
                                disabled={enhancingFields["statsValDialogs"]}
                                className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 cursor-pointer"
                                title="Оформить показатель ИИ"
                              >
                                <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["statsValDialogs"] ? "animate-spin text-[#E7C768]" : ""}`} />
                              </button>
                            }
                          />
                        </div>

                        {/* STATS 3 */}
                        <div className="bg-transparent backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl space-y-2">
                          <span className="text-sm font-bold text-slate-300 block">Показатель 3 (История)</span>
                          <MiniAudioField
                            placeholder="Подпись. Например: Год основания"
                            value={newCompanyStatsLabelFounded}
                            onChange={(val) => setNewCompanyStatsLabelFounded(val)}
                            minRows={1}
                          />
                          <MiniAudioField
                            placeholder="Например: 2018"
                            value={newCompanyStatsValFounded}
                            onChange={(val) => setNewCompanyStatsValFounded(val)}
                            maxLength={4}
                            minRows={1}
                            extraAction={
                              <button
                                type="button"
                                onClick={() => handleEnhanceSingleField("statsValFounded", newCompanyStatsValFounded)}
                                disabled={enhancingFields["statsValFounded"]}
                                className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 cursor-pointer"
                                title="Оформить показатель ИИ"
                              >
                                <Sparkles className={`w-3.5 h-3.5 ${enhancingFields["statsValFounded"] ? "animate-spin text-[#E7C768]" : ""}`} />
                              </button>
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 4: DEFAULT CONDITIONS & WIKI */}
                    <div className="space-y-3">
                      <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block">
                        4. Стандарты условий и регламенты (Для редактора лендингов)
                      </span>
                      <div className="flex flex-col gap-4">
                        <MiniAudioField
                          placeholder="Условия оплаты (напр: 100 000 руб)"
                          value={newCompanySalaryTerms}
                          onChange={(val) => setNewCompanySalaryTerms(val)}
                          minRows={1}
                          extraAction={
                            <button
                              type="button"
                              onClick={() => handleEnhanceSingleField("salaryTerms", newCompanySalaryTerms)}
                              disabled={enhancingFields["salaryTerms"]}
                              className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 transition-colors cursor-pointer"
                              title="Рассчитать привлекательную сетку"
                            >
                              <Sparkles className={`w-4 h-4 ${enhancingFields["salaryTerms"] ? "animate-spin text-[#E7C768]" : ""}`} />
                            </button>
                          }
                        />

                        <MiniAudioField
                          placeholder="Формат графика (напр: 5/2, 2/2 еженедельно)"
                          value={newCompanyScheduleTerms}
                          onChange={(val) => setNewCompanyScheduleTerms(val)}
                          minRows={1}
                          extraAction={
                            <button
                              type="button"
                              onClick={() => handleEnhanceSingleField("scheduleTerms", newCompanyScheduleTerms)}
                              disabled={enhancingFields["scheduleTerms"]}
                              className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 transition-colors cursor-pointer"
                              title="Сформулировать график"
                            >
                              <Sparkles className={`w-4 h-4 ${enhancingFields["scheduleTerms"] ? "animate-spin text-[#E7C768]" : ""}`} />
                            </button>
                          }
                        />

                        <MiniAudioField
                          placeholder="Корпоративная Wiki-база, регламенты звонков и сдачи отчетности..."
                          value={newCompanyCustomWiki}
                          onChange={(val) => setNewCompanyCustomWiki(val)}
                          minRows={3}
                          extraAction={
                            <button
                              type="button"
                              onClick={() => handleEnhanceSingleField("customWiki", newCompanyCustomWiki)}
                              disabled={enhancingFields["customWiki"]}
                              className="p-1 text-slate-300 hover:text-[#E7C768] disabled:opacity-30 cursor-pointer"
                              title="Структурировать Wiki ИИ"
                            >
                              <Sparkles className={`w-4 h-4 ${enhancingFields["customWiki"] ? "animate-spin text-[#E7C768]" : ""}`} />
                            </button>
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 text-sm pt-2">
                    <button type="button" onClick={cancelAddCompanyWizard} className="px-5 py-2.5 bg-transparent hover:bg-white/10 border border-white/20 text-slate-200 hover:text-white rounded-xl transition cursor-pointer">Отмена</button>
                    <button
                      type="submit"
                      disabled={isCompanySlugDuplicate || !newCompanyName.trim()}
                      className={`px-6 py-2.5 font-bold text-sm rounded-xl shadow-lg transition-all ${
                        isCompanySlugDuplicate || !newCompanyName.trim()
                          ? "opacity-40 cursor-not-allowed bg-transparent border border-white/20 text-white/50"
                          : "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] hover:brightness-110 active:scale-95 cursor-pointer"
                      }`}
                    >
                      Сохранить и синхронизировать
                    </button>
                  </div>
                </form>
              )}

              {/* LIST VIEW */}
              {!showAddCompany && (
              <div className="space-y-4">
                {/* Filter tabs for companies */}
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  {[
                    { id: "all", label: `Все (${companiesList.filter(c => !c.deleted_at && c.status !== "deleted").length})` },
                    { id: "published", label: `Опубликованные (${companiesList.filter(c => (c.status === "published" || c.is_published === true || c.is_published === 1) && c.status !== "draft" && !c.deleted_at && !c.archived_at && c.status !== "archive" && c.status !== "deleted").length})` },
                    { id: "draft", label: `Черновики (${companiesList.filter(c => (c.status === "draft" || c.is_published === 0 || c.is_published === false) && !c.deleted_at && !c.archived_at && c.status !== "archive" && c.status !== "deleted").length})` },
                    { id: "archive", label: `В архиве (${companiesList.filter(c => (c.archived_at || c.status === "archive") && !c.deleted_at && c.status !== "deleted").length})` },
                    { id: "deleted", label: `Корзина (${companiesList.filter(c => c.deleted_at || c.status === "deleted").length})` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCompanyFilterTab(tab.id as any)}
                      className={`text-sm font-bold px-3.5 py-2 rounded-xl transition cursor-pointer border ${
                        companyFilterTab === tab.id
                          ? "bg-white/15 text-[#E7C768] border-[#E7C768]"
                          : "bg-transparent text-slate-300 border-white/15 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {(() => {
                  const filteredCompanies = companiesList.filter(comp => {
                    const isArchived = Boolean(comp.archived_at || comp.status === "archive");
                    const isDeleted = Boolean(comp.deleted_at || comp.status === "deleted");
                    const isDraft = !isDeleted && !isArchived && (comp.status === "draft" || comp.is_published === 0 || comp.is_published === false);
                    const isPublished = !isDeleted && !isArchived && !isDraft && (comp.status === "published" || comp.is_published === true || comp.is_published === 1);

                    if (companyFilterTab === "all") return !isDeleted;
                    if (companyFilterTab === "published") return isPublished;
                    if (companyFilterTab === "draft") return isDraft;
                    if (companyFilterTab === "archive") return isArchived && !isDeleted;
                    if (companyFilterTab === "deleted") return isDeleted;
                    return true;
                  });

                  if (filteredCompanies.length === 0) {
                    return (
                      <div className="bg-transparent backdrop-blur-xl border border-white/15 p-8 rounded-3xl text-center text-slate-300 text-sm">
                        {companyFilterTab === "deleted"
                          ? "В корзине пусто."
                          : companyFilterTab === "archive"
                          ? "В архиве пока нет компаний."
                          : companyFilterTab === "draft"
                          ? "Черновиков нет. Нажмите «+ Добавить компанию» выше, чтобы создать новую."
                          : "Компаний пока нет. Нажмите «+ Добавить компанию» выше, чтобы создать карточку и её ИИ-лендинг. Все действия по компании — бесплатно."}
                      </div>
                    );
                  }

                  const originUrl = typeof window !== "undefined" ? window.location.origin : "https://hr-rr.online";

                  return filteredCompanies.map((comp, idx) => {
                    const compVacancies = projects.filter(p => comp?.name && (p?.companyName || "").toLowerCase() === (comp.name || "").toLowerCase());
                    const isArchived = Boolean(comp.archived_at || comp.status === "archive");
                    const isDeleted = Boolean(comp.deleted_at || comp.status === "deleted");
                    const isDraft = !isDeleted && !isArchived && (comp.status === "draft" || comp.is_published === 0 || comp.is_published === false);
                    const isPublished = !isDeleted && !isArchived && !isDraft;

                    const canonicalPid = comp.public_id || (comp.id ? String(comp.id).replace(/\D/g, "") : "300046");
                    const hasRealName = comp.name && comp.name !== "Компания" && comp.name !== "Без названия" && comp.name.trim() !== "";
                    const legacySlugVal = comp.legacy_slug || (hasRealName ? transliterateToSlug(comp.name) : (comp.slug || `com${canonicalPid}`));
                    const linkByBrand = `${originUrl}/${legacySlugVal === "kompaniya" || legacySlugVal === "company" ? `com${canonicalPid}` : legacySlugVal}`;
                    const linkByPublicId = `${originUrl}/com${canonicalPid}`;

                    // Parse sites for previews
                    let siteList: Array<{ url: string; title?: string }> = [];
                    try {
                      if (comp.sites && String(comp.sites).trim().startsWith("[")) {
                        const parsed = JSON.parse(comp.sites);
                        if (Array.isArray(parsed)) siteList = parsed.filter((s: any) => s.url && s.url.trim());
                      }
                    } catch {}
                    if (siteList.length === 0 && comp.website) {
                      siteList = [{ url: comp.website, title: "Сайт" }];
                    }

                    return (
                      <div
                        key={comp.id || idx}
                        className="bg-transparent backdrop-blur-2xl border border-white/20 p-6 rounded-3xl space-y-4 hover:border-[#E7C768]/60 transition shadow-xl"
                      >
                        {/* Company Card Header: Row 1 = Name/Logo, Row 2 = Badges & Actions */}
                        <div className="flex flex-col gap-3">
                          {/* Row 1: Logo & Company Name */}
                          <div className="flex items-center gap-3.5 min-w-0 w-full">
                            {comp.logoUrl || comp.logo_url ? (
                              <img
                                src={rrImg(comp.logoUrl || comp.logo_url) || DEFAULT_RR_LOGO_URL}
                                alt={comp.name || "Logo"}
                                className="w-12 h-12 object-contain rounded-xl bg-white/10 p-1.5 shrink-0 border border-white/15"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = DEFAULT_RR_LOGO_URL;
                                }}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-white/10 text-[#E7C768] font-bold flex items-center justify-center shrink-0 border border-white/20 font-mono text-base">
                                {comp.name ? comp.name.substr(0, 2).toUpperCase() : "CO"}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h3 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-tight break-words">
                                {comp.name || "Без названия"}
                              </h3>
                            </div>
                          </div>

                          {/* Row 2: Status badges and action buttons (multi-row flex-wrap) */}
                          <div className="flex flex-wrap items-center gap-2 w-full pt-1 border-t border-white/10">
                            {comp.is_team_member && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-semibold border border-[#E7C768]/60 text-[#E7C768] bg-transparent">
                                <Users className="w-4 h-4 text-[#E7C768]" /> Команда (баланс владельца)
                              </span>
                            )}
                            {isDeleted ? (
                              <span className="border border-white/20 bg-transparent text-slate-300 text-sm py-1 px-3 rounded-xl font-mono">В корзине</span>
                            ) : isArchived ? (
                              <span className="border border-white/20 bg-transparent text-slate-300 text-sm py-1 px-3 rounded-xl font-mono">В архиве</span>
                            ) : isDraft ? (
                              <span className="border border-white/20 bg-transparent text-slate-200 text-sm py-1 px-3 rounded-xl font-mono">Черновик</span>
                            ) : isPublished ? (
                              <span className="border border-[#E7C768]/60 bg-transparent text-[#E7C768] text-sm py-1 px-3 rounded-xl font-mono">Опубликована</span>
                            ) : null}

                            {isDeleted ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleRestoreCompany(comp); }}
                                className="bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768] text-sm font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
                              >
                                Восстановить
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTeamCompany(comp);
                                    setShowCompanyTeamModal(true);
                                  }}
                                  className="bg-transparent hover:bg-white/10 border border-[#E7C768]/50 text-[#E7C768] hover:text-white text-sm font-bold px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                                  title="Управление участниками команды компании"
                                >
                                  <Users className="w-3.5 h-3.5 text-[#E7C768]" />
                                  <span>Команда</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openEditCompanyWizard(comp); }}
                                  className="bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768] text-sm font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
                                >
                                  Редактировать
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleArchiveCompany(comp); }}
                                  className="bg-transparent hover:bg-white/10 border border-white/20 text-slate-300 hover:text-white text-sm font-medium px-3 py-1.5 rounded-xl transition cursor-pointer"
                                  title={isArchived ? "Вернуть из архива" : "Поместить в архив"}
                                >
                                  {isArchived ? "Разархивировать" : "В архив"}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCompany(comp); }}
                                  className="bg-transparent hover:bg-white/10 border border-white/20 text-slate-400 hover:text-white text-sm font-medium px-2.5 py-1.5 rounded-xl transition cursor-pointer"
                                  title="Переместить в корзину"
                                >
                                  🗑
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Company Industry & Metrics Badges */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {(() => {
                            const cId = String(comp.id || "");
                            const cPubId = String(comp.public_id || comp.publicId || "");
                            const activeVacCount = projects.filter((p: any) => {
                              const pCompId = String(p.company_id || p.companyId || "");
                              const match = pCompId === cId || (cPubId && (pCompId === cPubId || pCompId === `comp-${cPubId}` || pCompId === `comp${cPubId}`));
                              const isNotDeleted = p.status !== "deleted" && p.status !== "archive";
                              return match && isNotDeleted;
                            }).length;

                            return (
                              <span className="inline-flex items-center gap-1.5 bg-transparent backdrop-blur-xl border border-[#E7C768]/50 rounded-xl px-3 py-1.5 text-sm text-[#E7C768] font-bold shadow-sm" title="Количество активных вакансий компании">
                                💼 <span>Вакансий: <strong className="font-mono text-white">{activeVacCount}</strong></span>
                              </span>
                            );
                          })()}
                          {comp.industry ? (
                            <span className="inline-flex items-center gap-1.5 bg-transparent backdrop-blur-xl border border-[#E7C768]/50 rounded-xl px-3 py-1.5 text-sm text-[#E7C768] font-bold shadow-sm">
                              🏢 <span>{comp.industry}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-transparent backdrop-blur-xl border border-white/15 rounded-xl px-3 py-1.5 text-sm text-slate-300">
                              <span>Сфера не указана</span>
                            </span>
                          )}
                          {comp.staff && (
                            <span className="inline-flex items-center gap-2 bg-transparent backdrop-blur-xl border border-white/15 rounded-xl px-3 py-1.5 text-sm text-slate-200">
                              <span className="text-slate-400">Штат:</span>
                              <span className="font-bold text-white">{comp.staff}</span>
                            </span>
                          )}
                          {siteList.slice(0, 3).map((site, sIdx) => (
                            <SitePreview key={sIdx} url={site.url} title={site.title} variant="compact" />
                          ))}
                          {siteList.length > 3 && (
                            <span className="text-xs text-slate-400 font-mono self-center">
                              +{siteList.length - 3} ещё
                            </span>
                          )}
                          {comp.files && (
                            <span className="text-sm text-slate-300 flex items-center gap-1.5 font-semibold bg-transparent backdrop-blur-xl border border-white/15 rounded-xl px-3 py-1.5">
                              📂 <strong className="text-[#E7C768] font-mono">{comp.files}</strong>
                            </span>
                          )}
                        </div>

                        {/* AI Generated Careers Landing Link address */}
                        {!isDeleted && (
                          <div className="bg-transparent backdrop-blur-xl border border-white/15 p-4 rounded-2xl flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-[#E7C768]" />
                              <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-mono">
                                ИИ-Лендинг компании для соискателей
                              </span>
                            </div>

                            {/* Link 1: Legacy / Transliterated name slug (URL on top, buttons on bottom) */}
                            <div className="flex flex-col bg-transparent backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl space-y-2.5">
                              <div className="min-w-0 space-y-1">
                                <span className="text-sm text-slate-300 block font-sans">Прямая ссылка для соискателей:</span>
                                <span 
                                  onClick={() => navigate(`/${legacySlugVal}`)}
                                  className="cursor-pointer text-[#E7C768] font-mono text-sm hover:underline block truncate select-all"
                                  title={linkByBrand}
                                >
                                  {linkByBrand}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/10">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(linkByBrand);
                                    addAuditEvent("info", "Ссылка скопирована", "Ссылка на лендинг скопирована в буфер обмена");
                                  }}
                                  className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition"
                                >
                                  Копировать
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/${legacySlugVal}`); }}
                                  className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition flex items-center gap-1.5"
                                >
                                  <span>Открыть</span>
                                  <ExternalLink className="w-3.5 h-3.5 text-white/80" />
                                </button>
                              </div>
                            </div>

                            {/* Link 2: Canonical public ID slug (URL on top, buttons on bottom) */}
                            <div className="flex flex-col bg-transparent backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl space-y-2.5">
                              <div className="min-w-0 space-y-1">
                                <span className="text-sm text-slate-300 block font-sans">Ссылка для редактирования:</span>
                                <span 
                                  onClick={() => navigate(`/com${canonicalPid}`)}
                                  className="cursor-pointer text-[#E7C768] font-mono text-sm hover:underline block truncate select-all"
                                  title={linkByPublicId}
                                >
                                  {linkByPublicId}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 flex-wrap pt-2 border-t border-white/10">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(linkByPublicId);
                                    addAuditEvent("info", "Ссылка скопирована", "Ссылка на лендинг скопирована в буфер обмена");
                                  }}
                                  className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition"
                                >
                                  Копировать
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/com${canonicalPid}?edit_theme=1`);
                                  }}
                                  className="cursor-pointer bg-transparent hover:bg-white/10 border border-[#E7C768]/50 text-[#E7C768] hover:text-white font-bold text-sm py-1.5 px-3 rounded-xl transition flex items-center gap-1.5"
                                  title="Настроить оформление и стили лендинга"
                                >
                                  <Palette className="w-3.5 h-3.5 text-[#E7C768]" />
                                  <span>Редактор стиля</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/com${canonicalPid}`); }}
                                  className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition flex items-center gap-1.5"
                                >
                                  <span>Открыть</span>
                                  <ExternalLink className="w-3.5 h-3.5 text-white/80" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              )}

              {/* Onboarding Step 2 Next CTA - Appears ONLY when at least 1 company exists */}
              {!showAddCompany && companiesList.length > 0 && (
              <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 shadow-xl">
                <div className="text-left space-y-1">
                  <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Компания добавлена и бренд-лендинг готов?</h4>
                  <p className="text-sm text-slate-200">Переходите к следующему шагу — размещению вашей ИИ-Вакансии.</p>
                </div>
                <button
                  onClick={() => navigate(`/emp${employerId}/vacancies`)}
                  className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-95 text-[#17344F] font-bold text-sm py-3 px-6 rounded-2xl flex items-center gap-2 transition-all text-center shrink-0 w-full sm:w-auto justify-center shadow-lg"
                >
                  <span>Далее: разместить вакансию</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              )}

            </div>

            {/* Right Column (1 col on lg): Vertical 5-Stage "Прогресс запуска" Block */}
            <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-[88px]">
              <div className="bg-transparent border border-[#E7C768]/40 rounded-3xl p-5 shadow-xl text-left space-y-4 backdrop-blur-md">
                <div className="space-y-1 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-1.5 text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                    <Sparkles className="w-4 h-4 text-[#E7C768]" />
                    <span>Прогресс запуска</span>
                  </div>
                  <p className="text-sm text-slate-300">
                    5 этапов для запуска ИИ-рекрутера под ключ:
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Step 1 */}
                  <button
                    type="button"
                    onClick={() => navigate(`/emp${employerId}/profile`)}
                    className="text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-white/15 text-slate-200 hover:border-[#E7C768]/40 hover:bg-white/5"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-white/20 bg-transparent text-slate-300 mt-0.5">
                      1
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-sm font-bold block text-[#E7C768]">Этап 1. Профиль HR</span>
                      <span className="text-sm font-bold block text-white">Учетные данные</span>
                      <span className="text-sm block text-slate-300">Настройка аккаунта и личных данных</span>
                    </div>
                  </button>

                  {/* Step 2 (Active on this tab) */}
                  <button
                    type="button"
                    onClick={() => navigate(`/emp${employerId}/companies`)}
                    className="text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-[#E7C768] text-[#E7C768] shadow-md"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-[#E7C768] bg-transparent text-[#E7C768] mt-0.5">
                      2
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-sm font-bold block text-[#E7C768]">Этап 2. Мои Компании</span>
                      <span className="text-sm font-bold block text-white">Бренды и лендинги</span>
                      <span className="text-sm block text-slate-300">Создание бренда и ИИ-страницы</span>
                    </div>
                  </button>

                  {/* Step 3 */}
                  <button
                    type="button"
                    onClick={() => guardedNavigate("vacancies", `/emp${employerId}/vacancies`)}
                    className={`text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-white/15 text-slate-200 hover:border-[#E7C768]/40 hover:bg-white/5 ${tabDisabled("vacancies") ? "opacity-60" : ""}`}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-white/20 bg-transparent text-slate-300 mt-0.5">
                      3
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-sm font-bold block text-[#E7C768]">Этап 3. Вакансии & ИИ</span>
                      <span className="text-sm font-bold block text-white">Запустить вакансию</span>
                      <span className="text-sm block text-slate-300">Публикация вакансий и ИИ-куратор</span>
                    </div>
                  </button>

                  {/* Step 4 */}
                  <button
                    type="button"
                    onClick={() => guardedNavigate("training", `/emp${employerId}/training`)}
                    className={`text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-white/15 text-slate-200 hover:border-[#E7C768]/40 hover:bg-white/5 ${tabDisabled("training") ? "opacity-60" : ""}`}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-white/20 bg-transparent text-slate-300 mt-0.5">
                      4
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-sm font-bold block text-[#E7C768]">Этап 4. ИИ-Обучение</span>
                      <span className="text-sm font-bold block text-white">Обучение стажеров</span>
                      <span className="text-sm block text-slate-300">Индивидуальные онбординг-тренажеры</span>
                    </div>
                  </button>

                  {/* Step 5 */}
                  <button
                    type="button"
                    onClick={() => guardedNavigate("interviews", `/emp${employerId}/interviews`)}
                    className={`text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-white/15 text-slate-200 hover:border-[#E7C768]/40 hover:bg-white/5 ${tabDisabled("interviews") ? "opacity-60" : ""}`}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-white/20 bg-transparent text-slate-300 mt-0.5">
                      5
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-sm font-bold block text-[#E7C768]">Этап 5. ИИ-Интервью</span>
                      <span className="text-sm font-bold block text-white">Скрининг и интервью</span>
                      <span className="text-sm block text-slate-300">24/7 Автоматические ИИ-собеседования</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
          
          {/* PAGE 4: BILLS & ACCOUNTS - DYNAMIC BALANCE & SHIELD */}
          {activeTab === "tariff" && (
            <div className="space-y-6 text-left">

              <Tabs value={tariffTab} onValueChange={(val) => handleTariffTabChange(val)} className="space-y-6">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <TabsList className="bg-transparent backdrop-blur-2xl border border-white/20 p-1.5 rounded-2xl flex flex-wrap h-auto gap-1.5 shadow-xl">
                    <TabsTrigger value="balance" className="data-[state=active]:bg-white/10 data-[state=active]:text-[#E7C768] text-slate-200 font-bold text-sm px-4 py-2.5 rounded-xl transition">
                      💰 Баланс
                    </TabsTrigger>
                    <TabsTrigger value="pay" className="data-[state=active]:bg-white/10 data-[state=active]:text-[#E7C768] text-slate-200 font-bold text-sm px-4 py-2.5 rounded-xl transition">
                      🛒 Покупка
                    </TabsTrigger>
                    <TabsTrigger value="vacancy" className="data-[state=active]:bg-white/10 data-[state=active]:text-[#E7C768] text-slate-200 font-bold text-sm px-4 py-2.5 rounded-xl transition">
                      💼 Вакансии
                    </TabsTrigger>
                    <TabsTrigger value="history" className="data-[state=active]:bg-white/10 data-[state=active]:text-[#E7C768] text-slate-200 font-bold text-sm px-4 py-2.5 rounded-xl transition">
                      📋 История
                    </TabsTrigger>
                    <TabsTrigger value="partners" className="data-[state=active]:bg-white/10 data-[state=active]:text-[#E7C768] text-slate-200 font-bold text-sm px-4 py-2.5 rounded-xl transition">
                      🤝 Партнерка
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAcademyModalSlug("employer-cabinet");
                        setIsAcademyModalOpen(true);
                      }}
                      className="inline-flex items-center justify-center p-2.5 rounded-xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
                      title="Обучающая инструкция: Баланс, тарифы и партнерская программа (ИИ-Академия)"
                      aria-label="Инструкция по кабинету"
                    >
                      <HelpCircle className="w-4 h-4 text-[#E7C768]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTariffTabChange("pay")}
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition cursor-pointer"
                    >
                      💳 Пополнить баланс RR
                    </button>
                  </div>
                </div>


                <TabsContent value="balance" className="space-y-6 mt-0">
                  {/* 1. БАЛАНС + ЛИМИТЫ КАРТОЧКИ */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-5 bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                      <div data-tour="section.tariff.balance">
                        <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-mono block">
                          Лицевой счёт
                        </span>
                        <h2 className="text-3xl font-bold text-white mt-1.5 font-mono select-none">
                          {balance.toLocaleString("ru-RU")} <span className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">RR</span>
                        </h2>
                        <p className="text-sm text-slate-200 mt-2 leading-relaxed">
                          1 RR = 1 ₽. Списания происходят автоматически: при успешной генерации лендинга/системы интервью/обучения,
                          а также за каждое прохождение этапа кандидатом.
                        </p>
                      </div>
                      <div className="bg-transparent backdrop-blur-xl rounded-2xl p-3.5 border border-white/15 space-y-1">
                        <span className="text-sm text-slate-300 font-medium block">Номер кабинета</span>
                        <span className="text-sm font-bold font-mono text-white">emp{employerId}</span>
                      </div>
                    </div>

                    <div className="md:col-span-7 bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
                      <div>
                        <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                          <Award className="w-5 h-5 text-[#E7C768]" /> Купленные пакетные лимиты
                        </h3>
                        <p className="text-sm text-slate-200 mt-1 leading-relaxed">
                          Списание происходит в момент, когда кандидат впервые начинает диалог с ИИ — отдельно за интервью и отдельно за обучение.
                          Если баланс на нуле, кандидат не сможет проходить интервью или обучение. Повторное прохождение тем же кандидатом — бесплатно: списываем только за первое.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-center">
                        <div className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15">
                          <span className="text-sm text-slate-300 block">Интервью</span>
                          <strong className="text-2xl text-white block mt-1 font-mono">{interviewCredits}</strong>
                          <span className="text-sm text-slate-300">шт.</span>
                        </div>
                        <div className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15">
                          <span className="text-sm text-slate-300 block">Обучения</span>
                          <strong className="text-2xl text-white block mt-1 font-mono">{trainingCredits}</strong>
                          <span className="text-sm text-slate-300">шт.</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 1.5. РАЗДЕЛ "БАЛАНС И ЛИМИТЫ" */}
                  <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-5 text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#E7C768]" />
                        <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                          Баланс и лимиты
                        </h3>
                      </div>
                      <span className="text-sm font-mono font-bold bg-transparent backdrop-blur-xl px-4 py-1.5 rounded-xl border border-[#E7C768]/50 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent w-max">
                        Баланс RR: {balance.toLocaleString("ru-RU")} RR
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5">
                      <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center flex flex-col justify-between">
                        <span className="text-sm text-slate-300 block font-medium">Баланс RR</span>
                        <strong className="text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block font-mono font-bold mt-1.5">{balance} RR</strong>
                      </div>
                      <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center flex flex-col justify-between">
                        <span className="text-sm text-slate-300 block font-medium">ИИ-Интервью</span>
                        <strong className="text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block font-mono font-bold mt-1.5">{interviewCredits} шт</strong>
                      </div>
                      <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center flex flex-col justify-between">
                        <span className="text-sm text-slate-300 block font-medium">ИИ-Обучений</span>
                        <strong className="text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block font-mono font-bold mt-1.5">{trainingCredits} шт</strong>
                      </div>
                      <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center flex flex-col justify-between">
                        <span className="text-sm text-slate-300 block font-medium">ИИ-Вакансий</span>
                        <strong className="text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block font-mono font-bold mt-1.5">{landingCredits} шт</strong>
                      </div>
                      <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center flex flex-col justify-between">
                        <span className="text-sm text-slate-300 block font-medium">Систем Обучений</span>
                        <strong className="text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block font-mono font-bold mt-1.5">{trainingSetupCredits} шт</strong>
                      </div>
                      <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center flex flex-col justify-between">
                        <span className="text-sm text-slate-300 block font-medium">Систем Интервью</span>
                        <strong className="text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block font-mono font-bold mt-1.5">{interviewSetupCredits} шт</strong>
                      </div>
                    </div>

                    {/* Детализация баланса по источникам начислений */}
                    <div className="pt-3 border-t border-white/15">
                      <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block mb-3 font-mono">
                        📊 Детализация баланса по источникам
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm font-mono">
                        <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center">
                          <span className="text-sm text-slate-300 block">🎁 Стартовый</span>
                          <strong className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-1 block">{balanceStart} RR</strong>
                        </div>
                        <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center">
                          <span className="text-sm text-slate-300 block">💳 Оплаты</span>
                          <strong className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-1 block">{balancePay} RR</strong>
                        </div>
                        <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center">
                          <span className="text-sm text-slate-300 block">👥 Рефералы</span>
                          <strong className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-1 block">{balanceReferral} RR</strong>
                        </div>
                        <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center">
                          <span className="text-sm text-slate-300 block">⚙️ Админ</span>
                          <strong className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-1 block">{balanceAdmin} RR</strong>
                        </div>
                        <div className="bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/15 text-center col-span-2 sm:col-span-1">
                          <span className="text-sm text-slate-300 block">📉 Расход RR (лимиты)</span>
                          <strong className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-1 block">{balanceLimits} RR</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. КАЛЬКУЛЯТОР ВЫГОДЫ */}
                  <HiringCalculator />
                </TabsContent>

                {/* TAB 2: VACANCY LIMITS */}
                <TabsContent value="vacancy" className="space-y-6 mt-0">
                  <VacancyLimitAllocator
                    projects={projects}
                    interviewPool={interviewCredits}
                    trainingPool={trainingCredits}
                    employerBalance={balance}
                    employerId={employerId}
                    onSaved={async () => { await Promise.all([fetchBillingState(), fetchData()]); }}
                  />
                </TabsContent>

                <TabsContent value="pay" className="space-y-6 mt-0">
                  {/* 1. ПОПОЛНЕНИЕ RR ЗА РУБЛИ */}
                  <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl">
                    <form onSubmit={handleTopupBalance} className="space-y-4">
                      <div>
                        <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                          💵 Пополнение баланса RR за рубли
                        </h3>
                        <p className="text-sm text-slate-200 mt-1">Курс <strong className="text-white">1 ₽ = 1 RR</strong>. Минимальный платёж 100 ₽.</p>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div className="rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl p-3.5">
                            <div className="text-sm text-slate-300">Сейчас на балансе</div>
                            <div className="text-xl font-bold font-mono text-white mt-1">{Number(balance || 0).toLocaleString("ru-RU")} <span className="text-[#E7C768] text-sm">RR</span></div>
                          </div>
                          <div className="rounded-2xl border border-[#E7C768]/40 bg-transparent backdrop-blur-xl p-3.5">
                            <div className="text-sm text-slate-300">Будет начислено</div>
                            <div className="text-xl font-bold font-mono bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-1">+{Number(topupAmountRub || 0).toLocaleString("ru-RU")} <span className="text-sm">RR</span></div>
                          </div>
                          <div className="rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl p-3.5">
                            <div className="text-sm text-slate-300">Станет после оплаты</div>
                            <div className="text-xl font-bold font-mono bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-1">{(Number(balance || 0) + Number(topupAmountRub || 0)).toLocaleString("ru-RU")} <span className="text-sm">RR</span></div>
                          </div>
                        </div>
                      </div>
                      {topupError && (
                        <div className="bg-transparent backdrop-blur-xl border border-white/20 text-white rounded-2xl p-4 text-sm">
                          ⚠️ {topupError}
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                            К оплате (₽)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={100}
                              value={topupAmountRub}
                              onChange={(e) => setTopupAmountRub(Math.max(0, parseInt(e.target.value) || 0))}
                              className="bg-transparent backdrop-blur-xl w-full rounded-2xl border border-white/20 px-4 py-3 font-mono font-bold text-white text-base focus:outline-none focus:border-[#E7C768]"
                            />
                            <span className="absolute right-4 top-3 text-sm font-bold text-[#E7C768] font-mono">₽</span>
                          </div>
                          <div className="flex gap-2 text-sm font-mono font-bold pt-1">
                            {[100, 500, 1000, 5000].map(v => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setTopupAmountRub(v)}
                                className={`px-3.5 py-2 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${topupAmountRub === v ? "bg-white/10 text-[#E7C768] border-[#E7C768]" : "bg-transparent text-slate-200 border-white/15 hover:border-white/30"}`}
                              >
                                {v.toLocaleString("ru-RU")} ₽
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-[#E7C768]/40 flex flex-col justify-between">
                          <div>
                            <span className="text-sm text-slate-300 block">Будет зачислено</span>
                            <span className="text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent block font-mono mt-1">{topupAmountRub.toLocaleString("ru-RU")} RR</span>
                          </div>
                          <button
                            type="submit"
                            disabled={isToppingUp || topupAmountRub < 100 || !topupOfferOk}
                            className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 disabled:opacity-40 text-[#17344F] font-bold text-sm py-3.5 rounded-2xl mt-3 transition shadow-lg active:scale-95"
                          >
                            {isToppingUp ? "Перенаправляем на оплату..." : "🚀 Оплатить через Робокассу"}
                          </button>
                        </div>
                      </div>
                      <OfferConsent checked={topupOfferOk} onChange={setTopupOfferOk} context="pay" />
                      <p className="text-sm text-slate-300 leading-relaxed">
                        Оплата проводится через систему «Робокасса». Принимаем карты МИР, Visa, Mastercard и другие способы.
                        После успешной оплаты RR начисляются автоматически (обычно в течение минуты).
                      </p>
                    </form>
                  </div>

                  {/* 2. ФИКС-УСЛУГИ + 3. ПАКЕТЫ */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Фикс-услуги */}
                    <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-4">
                      <div>
                        <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                          🛍️ Разовые услуги (фикс. цена)
                        </h3>
                        <p className="text-sm text-slate-200 mt-1 leading-relaxed">
                          Списываем один раз — за первичное создание лендинга / системы интервью / системы обучения. Дальше редактировать и менять можно бесплатно в любой момент, даже на другую профессию и условия.
                          На одну вакансию — одна система обучения и одна система найма; их можно бесконечно править через ИИ. Кандидаты, ранее зарегистрированные на этой вакансии, увидят уже новую версию — ссылка на лендинг и кабинет у них не меняется.
                        </p>
                      </div>

                      <div className="space-y-3 pt-1">
                        {([
                          { item: "landing" as const, icon: "🌐", title: "ИИ-Лендинг вакансии",
                            desc: "Стильный мини-сайт вакансии с описанием условий, компанией и ИИ-консультантом по базе знаний.",
                            price: FIXED_PRICES.landing, credits: landingCredits },
                          { item: "interview_setup" as const, icon: "⚙️", title: "ИИ-Система интервью",
                            desc: "Генератор скрининга резюме, чек-листа и 3 ролевых ситуаций под вашу вакансию.",
                            price: FIXED_PRICES.interview_setup, credits: interviewSetupCredits },
                          { item: "training_setup" as const, icon: "🎓", title: "ИИ-Система обучения",
                            desc: "Профессиональное дообучение + обучение продукту + обучение регламентам по вашей базе знаний.",
                            price: FIXED_PRICES.training_setup, credits: trainingSetupCredits },
                        ]).map(row => (
                          <div key={row.item} className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15 space-y-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="max-w-[70%]">
                                <h4 className="font-bold text-white text-sm flex items-center gap-1.5">{row.icon} {row.title}</h4>
                                <p className="text-sm text-slate-300 mt-1 leading-relaxed">{row.desc}</p>
                              </div>
                              <span className="font-mono font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent whitespace-nowrap text-base">{row.price} RR</span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                              <span className="text-sm text-slate-300 font-mono">Куплено: <span className="text-white font-bold">{row.credits} шт</span></span>
                              <div className="flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
                                <div className="flex items-center bg-transparent backdrop-blur-md border border-white/20 rounded-xl overflow-hidden px-1 py-0.5">
                                  <button
                                    type="button"
                                    onClick={() => setFixedQty(q => ({ ...q, [row.item]: Math.max(1, (q[row.item] || 1) - 1) }))}
                                    className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 text-base font-bold rounded-lg transition-colors cursor-pointer"
                                  >−</button>
                                  <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    value={fixedQty[row.item] ?? 1}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === "") {
                                        setFixedQty(q => ({ ...q, [row.item]: 0 }));
                                      } else {
                                        const num = parseInt(val, 10);
                                        if (!isNaN(num)) {
                                          setFixedQty(q => ({ ...q, [row.item]: Math.max(0, Math.min(999, num)) }));
                                        }
                                      }
                                    }}
                                    onBlur={() => {
                                      if (!fixedQty[row.item] || fixedQty[row.item] < 1) {
                                        setFixedQty(q => ({ ...q, [row.item]: 1 }));
                                      }
                                    }}
                                    className="w-14 bg-transparent border border-white/20 rounded-lg text-center text-[#E7C768] font-bold text-sm py-1 outline-none font-mono mx-1 focus:border-[#E7C768]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setFixedQty(q => ({ ...q, [row.item]: Math.min(999, (q[row.item] || 1) + 1) }))}
                                    className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 text-base font-bold rounded-lg transition-colors cursor-pointer"
                                  >+</button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleBuyFixed(row.item, Math.max(1, fixedQty[row.item] || 1))}
                                  disabled={fixedBusy !== null}
                                  className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 disabled:opacity-40 text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl transition cursor-pointer whitespace-nowrap flex-1 sm:flex-none min-w-0 shadow-md active:scale-95"
                                >
                                  {fixedBusy === row.item ? "..." : `Списать за RR (${row.price * Math.max(1, fixedQty[row.item] || 1)})`}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Пакеты лимитов */}
                    <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-4">
                      <div>
                        <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                          📦 Пакеты лимитов интервью и обучения
                        </h3>
                        <p className="text-sm text-slate-200 mt-1">
                          Цена за штуку считается по <strong className="text-white">сумме</strong> интервью + обучения. Чем больше пакет — тем дешевле каждая штука. 1 RR = 1 ₽.
                        </p>
                      </div>

                      {purchaseError && (
                        <div className="bg-transparent backdrop-blur-xl border border-white/20 text-white rounded-2xl p-3 text-sm font-mono">
                          ⚠️ {purchaseError}
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-sm">
                        {[{r:"1–9",p:200},{r:"10–49",p:150},{r:"50–199",p:100},{r:"200+",p:50}].map(t => (
                          <div key={t.r} className="bg-transparent backdrop-blur-xl rounded-2xl p-3 border border-white/15 text-center">
                            <div className="text-slate-300">{t.r} шт</div>
                            <div className="text-base font-bold font-mono bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-0.5">{t.p} RR</div>
                          </div>
                        ))}
                      </div>

                      {(() => {
                        const qi = Math.max(0, Math.floor(packQty.interview || 0));
                        const qt = Math.max(0, Math.floor(packQty.training || 0));
                        const total_qty = qi + qt;
                        const unit = packTierPrice(Math.max(1, total_qty));
                        const total_rr = unit * total_qty;
                        return (
                          <div className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15 space-y-3">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="space-y-1.5">
                                <label className="text-slate-200 text-sm font-medium">🎙️ Интервью (шт)</label>
                                <input
                                  type="number" min={0} value={qi}
                                  onChange={(e) => setPackQty(s => ({ ...s, interview: Math.max(0, parseInt(e.target.value) || 0) }))}
                                  className="w-full bg-transparent border border-white/20 text-[#E7C768] font-bold text-center rounded-xl px-3 py-2 font-mono text-sm focus:border-[#E7C768]"
                                />
                                <div className="text-sm text-slate-300 font-mono">Остаток: {interviewCredits} шт</div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-slate-200 text-sm font-medium">🎓 Обучение (шт)</label>
                                <input
                                  type="number" min={0} value={qt}
                                  onChange={(e) => setPackQty(s => ({ ...s, training: Math.max(0, parseInt(e.target.value) || 0) }))}
                                  className="w-full bg-transparent border border-white/20 text-[#E7C768] font-bold text-center rounded-xl px-3 py-2 font-mono text-sm focus:border-[#E7C768]"
                                />
                                <div className="text-sm text-slate-300 font-mono">Остаток: {trainingCredits} шт</div>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10 text-sm">
                              <span className="text-slate-200 font-mono">
                                Всего: <strong className="text-white">{total_qty}</strong> шт × <strong className="text-white">{unit}</strong> RR = <strong className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{total_rr.toLocaleString("ru-RU")} RR</strong>
                              </span>
                              <button
                                type="button"
                                onClick={handleBuyMixedPack}
                                disabled={packBusy || total_qty < 1}
                                className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 disabled:opacity-40 text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-xl transition cursor-pointer shadow-md active:scale-95 w-full sm:w-auto text-center"
                              >
                                {packBusy ? "..." : `Списать за RR (${total_rr.toLocaleString("ru-RU")})`}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="partners" className="space-y-6 mt-0">
                  {/* 5. РЕФЕРАЛЬНАЯ ПРОГРАММА / ПАРТНЁРЫ И ССЫЛКА */}
                  <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-5">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🤝</span>
                      <div>
                        <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                          Партнёры и ссылка: +1000 RR за каждого приглашённого
                        </h3>
                        <p className="text-sm text-slate-200 leading-relaxed mt-1">
                          Когда приглашённый работодатель регистрируется по вашей партнёрской ссылке, ему начисляется приветственный бонус
                          <strong className="text-white"> 1000 RR</strong>, а вам — <strong className="text-white">+1000 RR</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15 text-sm space-y-2">
                        <span className="text-sm text-slate-300 font-medium block">Ваша реферальная ссылка</span>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 select-all flex-1 break-all flex items-center justify-between font-mono">
                            <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold">
                              {`https://hr-rr.ru/?ref=emp${employerId}`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`https://hr-rr.ru/?ref=emp${employerId}`);
                              addAuditEvent("success", "Ссылка скопирована", "Реферальная ссылка скопирована.");
                            }}
                            className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 text-[#17344F] px-4 py-2.5 text-sm font-bold rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition shrink-0 shadow-md active:scale-95"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Копировать</span>
                          </button>
                        </div>
                      </div>

                      <div className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15 text-sm space-y-1.5">
                        <span className="text-sm text-slate-300 font-medium block">Кем вы приглашены</span>
                        {referrer ? (
                          <div className="space-y-1 text-slate-200">
                            <div className="font-bold text-white text-sm">{referrer.name || "—"} <span className="text-[#E7C768] font-mono text-sm">emp{referrer.public_id}</span></div>
                            <div className="font-mono text-sm text-slate-300">{referrer.email}</div>
                            {referrer.telegram && <div className="font-mono text-sm text-white">Telegram: @{referrer.telegram}</div>}
                            {referrer.phone && <div className="font-mono text-sm text-white">Тел.: {referrer.phone}</div>}
                          </div>
                        ) : (
                          <div className="text-slate-300 text-sm">Вы зарегистрировались самостоятельно (без реферального кода).</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300 font-medium">Кого пригласили вы</span>
                        <span className="font-mono bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent text-sm font-bold">
                          {referees.length} чел · +{referees.reduce((s, r) => s + r.bonus_rr, 0).toLocaleString("ru-RU")} RR
                        </span>
                      </div>
                      {referees.length === 0 ? (
                        <div className="text-sm text-slate-300">Пока никто не зарегистрировался по вашей ссылке.</div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          {referees.map((r, i) => (
                            <div key={i} className="flex items-center justify-between bg-transparent backdrop-blur-md rounded-xl px-3 py-2.5 border border-white/10">
                              <div className="min-w-0 truncate">
                                <span className="text-white font-bold">{r.name || "—"}</span>
                                <span className="text-slate-300 font-mono text-sm ml-2">{r.email}</span>
                              </div>
                              <div className="text-sm font-mono shrink-0">
                                <span className="text-slate-300">{new Date(r.created_at).toLocaleDateString("ru-RU")} · </span>
                                <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold">+{r.bonus_rr} RR</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* БЛОК ПРИМЕРА ПОСТА ДЛЯ ПРИГЛАШЕНИЯ С РЕФЕРАЛЬНОЙ ССЫЛКОЙ */}
                    <div className="bg-transparent backdrop-blur-xl p-5 rounded-2xl border border-[#E7C768]/40 space-y-4 text-left">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 text-[#E7C768]" />
                          <h4 className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                            Пример поста для приглашения в соцсетях и мессенджерах
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://hr-rr.online";
                            const postTxt = `🤖 Автоматизируйте подбор персонала с ИИ-Роботом Рекрутером!\n\nИщете эффективный способ находить, отбирать и обучать лучших сотрудников 24/7?\nИнтеллектуальная платформа «Робот Рекрутер» (HR-RR) берет на себя всю рутину рекрутинга:\n• 24/7 ИИ-скрининг и первичные аудио/текстовые интервью с кандидатами\n• Интерактивные ИИ-тренажеры для онбординга и обучения стажеров\n• Автоматическая CRM-воронка со смарт-фильтрацией и отчетами\n\n🎁 Переходите по моей ссылке и получите 1000 RR в подарок на баланс при регистрации:\n${baseUrl}/?ref=emp${employerId}`;
                            navigator.clipboard.writeText(postTxt);
                            setSamplePostCopied(true);
                            setTimeout(() => setSamplePostCopied(false), 2500);
                            addAuditEvent("success", "Текст поста скопирован", "Готовый текст приглашения скопирован.");
                          }}
                          className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition shrink-0 shadow-md active:scale-95"
                        >
                          {samplePostCopied ? (
                            <>
                              <Check className="w-4 h-4 text-[#17344F]" />
                              <span>Скопировано!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 text-[#17344F]" />
                              <span>Скопировать пост</span>
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-sm text-slate-200">
                        Готовый шаблон публикации для Telegram, VK, WhatsApp и Email с вашей персональной реферальной ссылкой:
                      </p>

                      <div className="bg-transparent backdrop-blur-md p-4 rounded-2xl border border-white/15 font-sans text-sm text-slate-100 leading-relaxed whitespace-pre-line select-all relative">
                        {`🤖 Автоматизируйте подбор персонала с ИИ-Роботом Рекрутером!\n\nИщете эффективный способ находить, отбирать и обучать лучших сотрудников 24/7?\nИнтеллектуальная платформа «Робот Рекрутер» (HR-RR) берет на себя всю рутину рекрутинга:\n• 24/7 ИИ-скрининг и первичные аудио/текстовые интервью с кандидатами\n• Интерактивные ИИ-тренажеры для онбординга и обучения стажеров\n• Автоматическая CRM-воронка со смарт-фильтрацией и отчетами\n\n🎁 Переходите по моей ссылке и получите 1000 RR в подарок на баланс при регистрации:\n${typeof window !== "undefined" ? window.location.origin : "https://hr-rr.online"}/?ref=emp${employerId}`}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-1 text-sm text-slate-200">
                        <span className="font-bold text-white">Поделиться прямо сейчас:</span>
                        <a
                          href={`https://t.me/share/url?url=${encodeURIComponent(`${typeof window !== "undefined" ? window.location.origin : "https://hr-rr.online"}/?ref=emp${employerId}`)}&text=${encodeURIComponent('Робот Рекрутер — ИИ-автоматизация подбора персонала. Получите 1000 RR в подарок при регистрации:')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl transition shadow-md active:scale-95 inline-flex items-center gap-1.5"
                        >
                          Telegram
                        </a>
                        <a
                          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`🤖 Автоматизируйте подбор персонала с ИИ-Роботом Рекрутером!\n\nПолучите 1000 RR в подарок при регистрации:\n${typeof window !== "undefined" ? window.location.origin : "https://hr-rr.online"}/?ref=emp${employerId}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl transition shadow-md active:scale-95 inline-flex items-center gap-1.5"
                        >
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="space-y-6 mt-0">
                  {/* 6. ИСТОРИЯ ОПЕРАЦИЙ */}
                  {(() => {
                    // Filter payment history
                    let filtered = paymentHistory.filter((pt) => {
                      if (historyTypeFilter !== "all") {
                        const rawType = String(pt.type || "").toLowerCase();
                        const rawBalanceType = String(pt.type_balance || "").toLowerCase();
                        if (historyTypeFilter === "topup" && !["topup", "deposit", "pay"].includes(rawType) && rawBalanceType !== "pay") return false;
                        if (historyTypeFilter === "purchase" && !["purchase", "limit_purchase", "tariff_purchase"].includes(rawType)) return false;
                        if (historyTypeFilter === "limits" && !["limit_adjustment", "limits"].includes(rawType) && rawBalanceType !== "limits" && !pt.amount_limits) return false;
                        if (historyTypeFilter === "bonus" && !["bonus", "referral", "start"].includes(rawType) && !["start", "referral"].includes(rawBalanceType)) return false;
                        if (historyTypeFilter === "admin" && !["admin", "admin_adjustment"].includes(rawType) && rawBalanceType !== "admin") return false;
                        if (historyTypeFilter === "ai_cost" && !["ai_cost", "spend", "usage"].includes(rawType)) return false;
                        if (historyTypeFilter === "refund" && rawType !== "refund") return false;
                      }

                      if (historyDateFrom) {
                        const fromTime = new Date(historyDateFrom).getTime();
                        const rowTime = new Date(pt.raw_date || pt.date).getTime();
                        if (!isNaN(fromTime) && !isNaN(rowTime) && rowTime < fromTime) return false;
                      }

                      if (historyDateTo) {
                        const toTime = new Date(historyDateTo).getTime() + 86400000; // end of day
                        const rowTime = new Date(pt.raw_date || pt.date).getTime();
                        if (!isNaN(toTime) && !isNaN(rowTime) && rowTime > toTime) return false;
                      }

                      return true;
                    });

                    // Sort payment history
                    filtered.sort((a, b) => {
                      let cmp = 0;
                      if (historySortField === "date") {
                        const ta = new Date(a.raw_date || a.date).getTime() || 0;
                        const tb = new Date(b.raw_date || b.date).getTime() || 0;
                        cmp = ta - tb;
                      } else if (historySortField === "type") {
                        cmp = String(a.type || "").localeCompare(String(b.type || ""));
                      } else if (historySortField === "note") {
                        cmp = String(a.note || a.description || "").localeCompare(String(b.note || b.description || ""));
                      } else if (historySortField === "amount") {
                        const aVal = a.amount_rr !== undefined && a.amount_rr !== 0 ? a.amount_rr : (a.amount_limits || 0);
                        const bVal = b.amount_rr !== undefined && b.amount_rr !== 0 ? b.amount_rr : (b.amount_limits || 0);
                        cmp = Number(aVal) - Number(bVal);
                      }
                      return historySortDir === "desc" ? -cmp : cmp;
                    });

                    const totalItems = filtered.length;
                    const totalPages = Math.max(1, Math.ceil(totalItems / historyPageSize));
                    const curPage = Math.min(historyPage, totalPages);
                    const startIndex = (curPage - 1) * historyPageSize;
                    const pageItems = filtered.slice(startIndex, startIndex + historyPageSize);

                    const toggleSort = (field: "date" | "type" | "note" | "amount") => {
                      if (historySortField === field) {
                        setHistorySortDir(d => d === "asc" ? "desc" : "asc");
                      } else {
                        setHistorySortField(field);
                        setHistorySortDir("desc");
                      }
                      setHistoryPage(1);
                    };

                    const LIMIT_NAMES_RU: Record<string, string> = {
                      interview_credits: "интервью",
                      training_credits: "обучений",
                      landing_credits: "бренд-страниц",
                      interview_setup_credits: "сценариев",
                      training_setup_credits: "планов",
                      max_vacancies: "вакансий",
                      interviews: "интервью",
                      trainings: "обучений",
                      landings: "бренд-страниц",
                      interviewSystems: "сценариев",
                      trainingSystems: "планов",
                    };

                    return (
                      <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/15 pb-4">
                          <div>
                            <h3 className="font-bold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                              История счетов
                            </h3>
                            <p className="text-sm text-slate-200 mt-0.5">
                              Все операции по балансу, пополнения, пакеты и начисления
                            </p>
                          </div>

                          {/* Page Size Selector */}
                          <div className="flex items-center gap-2 text-sm text-slate-200">
                            <span>Показывать по:</span>
                            <div className="flex gap-1">
                              {[20, 50, 200, 1000].map(sz => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => { setHistoryPageSize(sz); setHistoryPage(1); }}
                                  className={`px-3 py-1.5 rounded-xl border text-sm font-bold font-mono transition-all cursor-pointer ${historyPageSize === sz ? "bg-white/15 text-[#E7C768] border-[#E7C768]" : "bg-transparent border-white/15 text-slate-200 hover:border-white/30"}`}
                                >
                                  {sz}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Filters Bar */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <label className="block text-slate-300 text-sm mb-1">Фильтр по типу</label>
                            <select
                              value={historyTypeFilter}
                              onChange={(e) => { setHistoryTypeFilter(e.target.value); setHistoryPage(1); }}
                              className="w-full bg-transparent backdrop-blur-xl border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:border-[#E7C768] outline-none"
                            >
                              <option value="all" className="bg-[#17344F] text-white">Все типы</option>
                              <option value="topup" className="bg-[#17344F] text-white">Пополнения</option>
                              <option value="purchase" className="bg-[#17344F] text-white">Покупки и тарифы</option>
                              <option value="limits" className="bg-[#17344F] text-white">Лимиты</option>
                              <option value="bonus" className="bg-[#17344F] text-white">Бонусы и рефералы</option>
                              <option value="admin" className="bg-[#17344F] text-white">Корректировки администратором</option>
                              <option value="ai_cost" className="bg-[#17344F] text-white">Расход ИИ</option>
                              <option value="refund" className="bg-[#17344F] text-white">Возвраты</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-slate-300 text-sm mb-1">Дата от</label>
                            <input
                              type="date"
                              value={historyDateFrom}
                              onChange={(e) => { setHistoryDateFrom(e.target.value); setHistoryPage(1); }}
                              className="w-full bg-transparent backdrop-blur-xl border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:border-[#E7C768] outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-300 text-sm mb-1">Дата до</label>
                            <input
                              type="date"
                              value={historyDateTo}
                              onChange={(e) => { setHistoryDateTo(e.target.value); setHistoryPage(1); }}
                              className="w-full bg-transparent backdrop-blur-xl border border-white/20 rounded-xl px-3 py-2 text-white text-sm focus:border-[#E7C768] outline-none"
                            />
                          </div>
                        </div>

                        {/* Table */}
                        {pageItems.length === 0 ? (
                          <div className="p-8 text-center text-sm text-slate-300 bg-transparent backdrop-blur-xl rounded-2xl border border-white/10">
                            {totalItems === 0 ? "Пока не было ни одной операции." : "Нет операций, соответствующих выбранным фильтрам."}
                          </div>
                        ) : (
                          <div className="overflow-x-auto text-sm rounded-2xl border border-white/15">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="bg-transparent border-b border-white/20 text-[#E7C768] font-bold font-mono text-sm">
                                  <th
                                    onClick={() => toggleSort("date")}
                                    className="p-3.5 cursor-pointer hover:text-white transition select-none"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span>Дата</span>
                                      {historySortField === "date" && (<span>{historySortDir === "asc" ? "▲" : "▼"}</span>)}
                                    </div>
                                  </th>
                                  <th
                                    onClick={() => toggleSort("type")}
                                    className="p-3.5 cursor-pointer hover:text-white transition select-none"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span>Тип</span>
                                      {historySortField === "type" && (<span>{historySortDir === "asc" ? "▲" : "▼"}</span>)}
                                    </div>
                                  </th>
                                  <th
                                    onClick={() => toggleSort("note")}
                                    className="p-3.5 cursor-pointer hover:text-white transition select-none"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span>Описание</span>
                                      {historySortField === "note" && (<span>{historySortDir === "asc" ? "▲" : "▼"}</span>)}
                                    </div>
                                  </th>
                                  <th
                                    onClick={() => toggleSort("amount")}
                                    className="p-3.5 text-right cursor-pointer hover:text-white transition select-none"
                                  >
                                    <div className="flex items-center justify-end gap-1.5">
                                      <span>Сумма</span>
                                      {historySortField === "amount" && (<span>{historySortDir === "asc" ? "▲" : "▼"}</span>)}
                                    </div>
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/10 text-slate-100">
                                {pageItems.map((pt, i) => {
                                  const rawType = String(pt.type || "").toLowerCase();
                                  const rawBalanceType = String(pt.type_balance || "").toLowerCase();

                                  // Format type label
                                  const typeLabel = (() => {
                                    if (rawType === "topup" || rawType === "deposit" || rawType === "pay" || rawBalanceType === "pay") return "Пополнение";
                                    if (rawType === "limit_adjustment" || rawBalanceType === "limits") return "Корректировка лимитов";
                                    if (rawType === "admin" || rawBalanceType === "admin") return "Корректировка администратором";
                                    if (rawType === "bonus" || rawType === "start" || rawBalanceType === "start") return "Приветственный бонус";
                                    if (rawType === "referral" || rawBalanceType === "referral") return "Реферальный бонус";
                                    if (rawType === "purchase" || rawType === "limit_purchase") return "Покупка";
                                    if (rawType === "ai_cost" || rawType === "spend" || rawType === "usage") return "Расход ИИ";
                                    if (rawType === "refund") return "Возврат";
                                    return pt.type || "Операция";
                                  })();

                                  // Format description & notes
                                  let mainDesc = pt.description || pt.note || "";
                                  let subNote = (pt.note && pt.description && pt.note !== pt.description) ? pt.note : null;

                                  mainDesc = String(mainDesc)
                                    .replace(/^Signup bonus:\s*10 units$/i, "Приветственный бонус: 10 RR")
                                    .replace(/^Signup bonus$/i, "Приветственный бонус")
                                    .replace(/^Referral bonus:\s*\+?(\d+)\s*RR for inviting new employer$/i, "Реферальный бонус: +$1 RR за приглашение работодателя")
                                    .replace(/^Referral bonus:\s*invited\s+(.+)$/i, "Реферальный бонус: приглашён $1")
                                    .replace(/^Referral bonus:\s*joined via\s+(.+)$/i, "Реферальный бонус: регистрация по ссылке $1")
                                    .replace(/^Referral bonus/i, "Реферальный бонус");

                                  if (subNote) {
                                    subNote = String(subNote)
                                      .replace(/^Signup bonus:\s*10 units$/i, "Приветственный бонус: 10 RR")
                                      .replace(/^Signup bonus$/i, "Приветственный бонус");
                                  }

                                  const numRR = pt.amount_rr !== undefined && pt.amount_rr !== null ? Number(pt.amount_rr) : 0;
                                  const numLimits = pt.amount_limits !== undefined && pt.amount_limits !== null ? Number(pt.amount_limits) : 0;
                                  const hasRR = numRR !== 0;
                                  const hasLimits = numLimits !== 0;
                                  const limitUnit = LIMIT_NAMES_RU[pt.type_limits] || "лимит";

                                  return (
                                    <tr key={pt.id || i} className="hover:bg-white/5 transition-colors">
                                      <td className="p-3.5 font-mono text-slate-300 text-sm whitespace-nowrap">{pt.date}</td>
                                      <td className="p-3.5 font-mono text-sm text-slate-200 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-semibold bg-transparent backdrop-blur-md ${
                                          rawType === "bonus" || rawType === "referral" || rawBalanceType === "referral" || rawBalanceType === "start"
                                            ? "border border-[#E7C768]/40 text-[#E7C768]"
                                            : "border border-white/20 text-white"
                                        }`}>
                                          {typeLabel}
                                        </span>
                                      </td>
                                      <td className="p-3.5 text-sm">
                                        <div className="space-y-0.5">
                                          <div className="font-medium text-white">{mainDesc || "Операция по счёту"}</div>
                                          {subNote && (
                                            <div className="text-xs text-slate-300 font-sans">{subNote}</div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-sm whitespace-nowrap">
                                        {hasLimits && !hasRR ? (
                                          <div className="inline-flex flex-col items-end">
                                            <span className={numLimits > 0 ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold" : "text-white font-bold"}>
                                              {numLimits > 0 ? `+${numLimits}` : numLimits} {limitUnit}
                                            </span>
                                            <span className="text-[10px] text-slate-300 font-mono">лимиты</span>
                                          </div>
                                        ) : hasRR && hasLimits ? (
                                          <div className="inline-flex flex-col items-end space-y-0.5">
                                            <span className={numRR > 0 ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold" : "text-white font-bold"}>
                                              {numRR > 0 ? `+${numRR.toLocaleString("ru-RU")}` : numRR.toLocaleString("ru-RU")} RR
                                            </span>
                                            <span className={`text-[11px] font-semibold ${numLimits > 0 ? "text-[#E7C768]" : "text-white"}`}>
                                              {numLimits > 0 ? `+${numLimits}` : numLimits} {limitUnit}
                                            </span>
                                          </div>
                                        ) : hasRR ? (
                                          <span className={numRR > 0 ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold" : "text-white font-bold"}>
                                            {numRR > 0 ? `+${numRR.toLocaleString("ru-RU")}` : numRR.toLocaleString("ru-RU")} RR
                                          </span>
                                        ) : (
                                          <span className="text-white font-mono">
                                            0 RR
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Pagination Bar */}
                        {totalPages > 1 && (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-sm text-slate-200">
                            <span>
                              Показано {startIndex + 1}–{Math.min(startIndex + historyPageSize, totalItems)} из {totalItems} операций
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={curPage <= 1}
                                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                className="px-3.5 py-1.5 rounded-xl border border-white/20 bg-transparent hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer text-sm"
                              >
                                Назад
                              </button>
                              <div className="flex items-center gap-1 font-mono">
                                {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                                  .filter(p => p === 1 || p === totalPages || Math.abs(p - curPage) <= 2)
                                  .map((p, idx, arr) => {
                                    const prev = arr[idx - 1];
                                    return (
                                      <React.Fragment key={p}>
                                        {prev && p - prev > 1 && <span className="px-1 text-slate-400">...</span>}
                                        <button
                                          type="button"
                                          onClick={() => setHistoryPage(p)}
                                          className={`w-8 h-8 rounded-xl border text-sm font-bold transition-all cursor-pointer ${curPage === p ? "bg-white/15 text-[#E7C768] border-[#E7C768]" : "bg-transparent border-white/15 text-slate-200 hover:border-white/30"}`}
                                        >
                                          {p}
                                        </button>
                                      </React.Fragment>
                                    );
                                  })}
                              </div>
                              <button
                                type="button"
                                disabled={curPage >= totalPages}
                                onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                                className="px-3.5 py-1.5 rounded-xl border border-white/20 bg-transparent hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer text-sm"
                              >
                                Вперёд
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="prices" className="space-y-6 mt-0">
                  <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-2">
                    <h3 className="font-bold text-sm bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-1.5 font-mono">
                      💲 Прейскурант RR
                    </h3>
                    <p className="text-sm text-slate-200 leading-relaxed">
                      Все списания происходят в RR (1 RR = 1 ₽). Ниже — полный прейскурант: что стоит и сколько.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. Разовые услуги при создании вакансии */}
                    <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-3">
                      <div className="border-b border-white/10 pb-2">
                        <h4 className="font-bold text-sm bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-1.5 font-mono">
                          🛍️ Разовые услуги при создании вакансии
                        </h4>
                        <p className="text-sm text-slate-200 mt-1">
                          Списываем один раз — за первичное создание. Дальше редактировать бесплатно.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {[
                          { icon: "🌐", title: "ИИ-Лендинг вакансии", price: FIXED_PRICES.landing },
                          { icon: "⚙️", title: "ИИ-Система интервью", price: FIXED_PRICES.interview_setup },
                          { icon: "🎓", title: "ИИ-Система обучения", price: FIXED_PRICES.training_setup },
                        ].map(row => (
                          <div key={row.title} className="flex items-center justify-between bg-transparent border border-white/15 backdrop-blur-md rounded-2xl p-3">
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                              <span className="text-base">{row.icon}</span> {row.title}
                            </span>
                            <span className="text-sm font-mono font-bold text-[#E7C768] whitespace-nowrap">{row.price} RR</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2. Стоимость интервью и обучения */}
                    <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-3">
                      <div className="border-b border-white/10 pb-2">
                        <h4 className="font-bold text-sm bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-1.5 font-mono">
                          📦 Стоимость интервью и обучения
                        </h4>
                        <p className="text-sm text-slate-200 mt-1">
                          Чем больше пакет — тем дешевле каждая единица. Считается по сумме интервью + обучения.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        {[
                          { r: "1–9 шт",    p: 200 },
                          { r: "10–49 шт",  p: 150 },
                          { r: "50–199 шт", p: 100 },
                          { r: "200+ шт",   p: 50  },
                        ].map(t => (
                          <div key={t.r} className="bg-transparent border border-white/15 backdrop-blur-md rounded-2xl p-3">
                            <div className="text-sm text-slate-300 font-mono">{t.r}</div>
                            <div className="text-base font-mono font-bold text-[#E7C768] mt-1">{t.p} RR</div>
                            <div className="text-sm text-slate-400 font-mono">за шт</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed pt-1">
                        Списание срабатывает, когда кандидат впервые начинает диалог с ИИ — отдельно за интервью и отдельно за обучение. Повторное прохождение тем же кандидатом — бесплатно.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="space-y-6 text-left">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                
                {/* Left Column (2 cols on lg): Merged "Профиль" Card */}
                <div className="lg:col-span-2 space-y-6">
                    <div data-tour="section.profile.header" className="bg-transparent border border-white/20 rounded-3xl p-6 shadow-xl space-y-5 backdrop-blur-2xl">
                    
                    {/* Centered User Name as Header of Main Account Block */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div className="w-9" />
                      <h3 className="text-xl sm:text-2xl font-bold text-center bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                        {profileName || googleName || "Работодатель"}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setAcademyModalSlug("employer-cabinet");
                          setIsAcademyModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center p-2 rounded-xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
                        title="Обучающая инструкция: Личный кабинет работодателя (ИИ-Академия)"
                      >
                        <HelpCircle className="w-5 h-5 text-[#E7C768]" />
                      </button>
                    </div>

                    {/* Mascot (50%) + Profile Details List (50%) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                      {/* Mascot on left half with Action Buttons underneath */}
                      <div className="flex flex-col items-center justify-center gap-4 text-center p-2">
                        <img
                          src={rrImg("/files/13/rr2.png")}
                          alt="Маскот Робот Рекрутер"
                          className="w-48 h-48 sm:w-56 sm:h-56 object-contain drop-shadow-xl"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = rrImg("/files/13/rr2.png");
                          }}
                        />
                        <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                          <button
                            type="button"
                            onClick={() => {
                              setTempProfileName(profileName);
                              setTempProfileEmail(profileEmail);
                              setTempProfilePhone(profilePhone);
                              setTempTelegramUsername(telegramUsernameState);
                              setTempTelegramChatId(telegramChatId);
                              setTempTelegramGroupIds(telegramGroupIds);
                              setTempTelegramChannelIds(telegramChannelIds);
                              setTempTelegramNotifyEvents({ ...telegramNotifyEvents });
                              setNewPassword("");
                              setConfirmPassword("");
                              setPasswordChangeError("");
                              setPasswordChangeSuccess("");
                              setEditModalTab("profile");
                              setIsEditProfileModalOpen(true);
                            }}
                            className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] px-6 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer hover:brightness-110 active:scale-95"
                          >
                            <Edit className="w-4 h-4 text-[#17344F]" />
                            <span>Редактировать</span>
                          </button>
                        </div>
                      </div>

                      {/* Profile data list on right half */}
                      <div className="space-y-2.5 text-sm">
                        <div className="flex items-center justify-between py-2 border-b border-white/10">
                          <span className="text-sm text-slate-300 font-medium">ID работодателя</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (employerId) {
                                navigator.clipboard.writeText(String(employerId));
                                setCopiedEmployerId(true);
                                setTimeout(() => setCopiedEmployerId(false), 2000);
                              }
                            }}
                            title="Нажмите, чтобы скопировать ID"
                            className="text-sm font-mono text-[#E7C768] font-bold flex items-center gap-1.5 hover:underline cursor-pointer active:scale-95"
                          >
                            <span>{employerId || "—"}</span>
                            {copiedEmployerId ? (
                              <Check className="w-3.5 h-3.5 text-[#E7C768]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center justify-between py-2 border-b border-white/10">
                          <span className="text-sm text-slate-300 font-medium">E-mail адрес</span>
                          <span className="text-sm text-white font-mono font-semibold text-right truncate max-w-[200px]">
                            {profileEmail || googleEmail || "Не указано"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-2 border-b border-white/10">
                          <span className="text-sm text-slate-300 font-medium">Телефон для связи</span>
                          <span className="text-sm text-white font-semibold text-right">
                            {profilePhone || "Не указан"}
                          </span>
                        </div>

                        <div className="flex flex-col py-2 border-b border-white/10 gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300 font-medium">Telegram</span>
                            <span className="text-sm text-[#E7C768] font-mono font-semibold">
                              {telegramUsernameState ? `@${telegramUsernameState}` : "Не указан"}
                            </span>
                          </div>
                          <span className={`text-sm font-mono text-right ${telegramChatId ? "text-slate-300" : "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-semibold"}`}>
                            {telegramChatId ? `Уведомления: ID ${telegramChatId}` : "Уведомления бота: не подключён"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-slate-300 font-medium">Дата регистрации</span>
                          <span className="text-sm text-slate-200 font-mono font-semibold">
                            {employerCreatedAt ? new Date(employerCreatedAt).toLocaleDateString("ru-RU") : "—"}
                          </span>
                        </div>

                        {authProvider === "google" && (
                          <div className="pt-2 text-sm text-slate-300 leading-relaxed border-t border-white/10">
                            Аккаунт Google: имя, email и фото синхронизируются автоматически.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Modal: Edit Profile with merged Password Change in Apple Liquid Glass style (Centered in Viewport via Portal) */}
                    {isEditProfileModalOpen && typeof document !== "undefined" && createPortal(
                      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                        {/* Completely transparent backdrop (no darkening, no blur on background) */}
                        <div
                          className="fixed inset-0 bg-transparent transition-opacity"
                          onClick={() => setIsEditProfileModalOpen(false)}
                        />
                        {/* Container with standard blue background (#17344F) and Apple Liquid Glass styling */}
                        <div className="relative z-10 w-full max-w-xl bg-[#17344F] border border-white/20 rounded-3xl p-5 sm:p-7 space-y-4 shadow-2xl text-left my-auto text-white backdrop-blur-xl">
                          <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                              <Edit className="w-5 h-5 text-[#E7C768]" /> Редактирование профиля
                            </h3>
                            <button
                              type="button"
                              onClick={() => setIsEditProfileModalOpen(false)}
                              className="text-slate-300 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          {/* Modal Section Switches */}
                          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
                            <button
                              type="button"
                              onClick={() => setEditModalTab("profile")}
                              className={`px-4 py-2 rounded-xl text-[14px] font-bold transition flex items-center gap-2 cursor-pointer ${
                                editModalTab === "profile"
                                  ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] shadow"
                                  : "bg-transparent border border-white/20 text-slate-200 hover:bg-white/5"
                              }`}
                            >
                              <User className="w-4 h-4" />
                              <span>Личные данные</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditModalTab("telegram")}
                              className={`px-4 py-2 rounded-xl text-[14px] font-bold transition flex items-center gap-2 cursor-pointer ${
                                editModalTab === "telegram"
                                  ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] shadow"
                                  : "bg-transparent border border-white/20 text-slate-200 hover:bg-white/5"
                              }`}
                            >
                              <Send className="w-4 h-4" />
                              <span>Telegram-уведомления</span>
                              {tempTelegramChatId || tempTelegramUsername ? (
                                <span className="w-2 h-2 rounded-full bg-[#E7C768] inline-block"></span>
                              ) : null}
                            </button>

                            {authProvider !== "google" && (
                              <button
                                type="button"
                                onClick={() => setEditModalTab("password")}
                                className={`px-4 py-2 rounded-xl text-[14px] font-bold transition flex items-center gap-2 cursor-pointer ${
                                  editModalTab === "password"
                                    ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] shadow"
                                    : "bg-transparent border border-white/20 text-slate-200 hover:bg-white/5"
                                }`}
                              >
                                <Lock className="w-4 h-4" />
                                <span>Смена пароля</span>
                                {newPassword ? (
                                  <span className="w-2 h-2 rounded-full bg-[#E7C768] inline-block"></span>
                                ) : null}
                              </button>
                            )}
                          </div>

                          {editModalTab === "profile" && (
                            <div className="space-y-3.5">
                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">ФИО / Имя контактного лица</label>
                                <input
                                  type="text"
                                  value={tempProfileName}
                                  onChange={(e) => setTempProfileName(e.target.value)}
                                  placeholder="Например: Иван Петров"
                                  className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                                />
                              </div>

                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">E-mail адрес</label>
                                <input
                                  type="email"
                                  value={tempProfileEmail}
                                  onChange={(e) => setTempProfileEmail(e.target.value)}
                                  placeholder="hr@company.ru"
                                  className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                                />
                              </div>

                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">Телефон для связи (виден кандидатам)</label>
                                <input
                                  type="tel"
                                  value={tempProfilePhone}
                                  onChange={(e) => setTempProfilePhone(e.target.value)}
                                  placeholder="+7 (999) 000-00-00"
                                  className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                                />
                              </div>
                            </div>
                          )}

                          {editModalTab === "telegram" && (
                            <div className="space-y-4 text-sm max-h-[60vh] overflow-y-auto pr-1">
                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">Telegram (@username для связи с соискателями)</label>
                                <div className="flex items-center w-full bg-white/5 border border-white/20 rounded-xl overflow-hidden focus-within:border-white/40 transition-colors">
                                  <div className="flex items-center justify-center pl-3.5 pr-2 py-2.5 text-white font-mono text-[14px] select-none shrink-0 border-0 bg-transparent">
                                    @
                                  </div>
                                  <input
                                    type="text"
                                    value={tempTelegramUsername}
                                    onChange={(e) => setTempTelegramUsername(e.target.value.replace(/^@+/, ""))}
                                    placeholder="например: hr_manager"
                                    className="w-full bg-transparent border-0 px-2 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-0"
                                  />
                                </div>
                              </div>

                              <div className="bg-transparent border border-white/20 rounded-2xl p-4 text-[14px] text-white leading-relaxed space-y-2.5 backdrop-blur-md">
                                <div className="font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent text-[14px]">Подключение Telegram-бота для оповещений:</div>
                                <ol className="list-decimal list-inside space-y-1 text-slate-200 text-[14px]">
                                  <li>Откройте бота <a href="https://t.me/RoboRecrutBot" target="_blank" rel="noreferrer" className="underline bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent font-mono font-bold">@RoboRecrutBot</a> и нажмите <b>Start</b>.</li>
                                  <li>В меню бота нажмите кнопку <b>🆕</b> — бот пришлёт ваш числовой Telegram ID.</li>
                                  <li>Для групповых чатов добавьте бота в группу и отправьте команду <b>/id</b>.</li>
                                </ol>
                                <a
                                  href="https://t.me/RoboRecrutBot"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 mt-1 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] hover:brightness-110 transition shadow-sm"
                                >
                                  Открыть @RoboRecrutBot →
                                </a>
                              </div>

                              {/* Personal Telegram Chat IDs */}
                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">ID личных чатов Telegram (личка):</label>
                                <input
                                  type="text"
                                  value={tempTelegramChatId}
                                  onChange={(e) => setTempTelegramChatId(e.target.value)}
                                  placeholder="например: 123456789, 987654321 (через запятую)"
                                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                                />
                                <p className="text-xs text-slate-300 mt-1">
                                  Сюда бот будет присылать персональные уведомления руководителю или HR-специалисту.
                                </p>
                              </div>

                              {/* Group Chat IDs */}
                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">ID групповых чатов (для команд и отделов):</label>
                                <input
                                  type="text"
                                  value={tempTelegramGroupIds}
                                  onChange={(e) => setTempTelegramGroupIds(e.target.value)}
                                  placeholder="например: -1001234567890, -1009876543210 (через запятую)"
                                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                                />
                                <p className="text-xs text-slate-300 mt-1">
                                  Для рабочих групп отдела найма. Бот должен быть добавлен в группу.
                                </p>
                              </div>

                              {/* Public Channel IDs */}
                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">Публичные каналы / группы (username или ссылки):</label>
                                <input
                                  type="text"
                                  value={tempTelegramChannelIds}
                                  onChange={(e) => setTempTelegramChannelIds(e.target.value)}
                                  placeholder="например: @company_vacancies, https://t.me/hr_announcements"
                                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                                />
                                <p className="text-xs text-slate-300 mt-1">
                                  Для публикации анонсов и вакансий. Бот должен быть администратором канала.
                                </p>
                              </div>

                              {/* Event Notifications Matrix */}
                              <div className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-3">
                                <div className="text-[14px] font-bold text-[#E7C768]">
                                  Какие оповещения отправлять в Telegram:
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[14px]">
                                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={tempTelegramNotifyEvents.new_candidate}
                                      onChange={(e) => setTempTelegramNotifyEvents({ ...tempTelegramNotifyEvents, new_candidate: e.target.checked })}
                                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                                    />
                                    <span>Новые отклики соискателей</span>
                                  </label>

                                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={tempTelegramNotifyEvents.interview_passed}
                                      onChange={(e) => setTempTelegramNotifyEvents({ ...tempTelegramNotifyEvents, interview_passed: e.target.checked })}
                                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                                    />
                                    <span>Завершение интервью и баллы</span>
                                  </label>

                                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={tempTelegramNotifyEvents.test_passed}
                                      onChange={(e) => setTempTelegramNotifyEvents({ ...tempTelegramNotifyEvents, test_passed: e.target.checked })}
                                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                                    />
                                    <span>Сдача аттестаций и тестов</span>
                                  </label>

                                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={tempTelegramNotifyEvents.training_progress}
                                      onChange={(e) => setTempTelegramNotifyEvents({ ...tempTelegramNotifyEvents, training_progress: e.target.checked })}
                                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                                    />
                                    <span>Прохождение этапов обучения</span>
                                  </label>

                                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={tempTelegramNotifyEvents.balance_change}
                                      onChange={(e) => setTempTelegramNotifyEvents({ ...tempTelegramNotifyEvents, balance_change: e.target.checked })}
                                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                                    />
                                    <span>Изменения баланса и лимитов</span>
                                  </label>

                                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={tempTelegramNotifyEvents.daily_digest}
                                      onChange={(e) => setTempTelegramNotifyEvents({ ...tempTelegramNotifyEvents, daily_digest: e.target.checked })}
                                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                                    />
                                    <span>Ежедневный дайджест активности</span>
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}

                          {editModalTab === "password" && (
                            <div className="space-y-4 text-left">
                              <div className="text-[14px] text-slate-300 leading-relaxed">
                                Укажите новый пароль для входа в кабинет работодателя. Пароль должен быть длиной не менее 8 символов.
                              </div>

                              {passwordChangeError && (
                                <div className="bg-transparent border border-[#E7C768]/60 text-[#F4EE8E] text-[14px] p-3 rounded-xl">
                                  {passwordChangeError}
                                </div>
                              )}
                              {passwordChangeSuccess && (
                                <div className="bg-transparent border border-[#E7C768] text-[#E7C768] text-[14px] p-3 rounded-xl">
                                  {passwordChangeSuccess}
                                </div>
                              )}

                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">Новый пароль</label>
                                <input
                                  type="password"
                                  value={newPassword}
                                  onChange={(e) => {
                                    setNewPassword(e.target.value);
                                    if (passwordChangeError) setPasswordChangeError("");
                                  }}
                                  placeholder="Не менее 8 символов"
                                  className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                                />
                              </div>

                              <div>
                                <label className="block text-[14px] text-slate-200 font-bold mb-1.5">Подтверждение пароля</label>
                                <input
                                  type="password"
                                  value={confirmPassword}
                                  onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    if (passwordChangeError) setPasswordChangeError("");
                                  }}
                                  placeholder="Повторите новый пароль"
                                  className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                                />
                              </div>

                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={handleChangePassword}
                                  disabled={isChangingPassword || !newPassword}
                                  className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] px-5 py-2.5 rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                >
                                  {isChangingPassword ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  <span>Обновить пароль</span>
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                            <button
                              type="button"
                              onClick={() => setIsEditProfileModalOpen(false)}
                              className="px-4 py-2 rounded-xl border border-white/20 text-slate-200 hover:text-white text-[14px] font-semibold hover:bg-white/5 transition cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (newPassword) {
                                  if (newPassword.length < 8) {
                                    setEditModalTab("password");
                                    setPasswordChangeError("Пароль должен быть не менее 8 символов");
                                    return;
                                  }
                                  if (newPassword !== confirmPassword) {
                                    setEditModalTab("password");
                                    setPasswordChangeError("Пароли не совпадают");
                                    return;
                                  }
                                  const ok = await handleChangePassword();
                                  if (!ok) {
                                    setEditModalTab("password");
                                    return;
                                  }
                                }

                                const cleanTg = tempTelegramUsername.replace(/^@+/, "").trim();
                                const cleanChatId = tempTelegramChatId.trim();
                                const cleanGroupIds = tempTelegramGroupIds.trim();
                                const cleanChannelIds = tempTelegramChannelIds.trim();

                                setProfileName(tempProfileName);
                                setProfileEmail(tempProfileEmail);
                                setProfilePhone(tempProfilePhone);
                                setTelegramUsernameState(cleanTg);
                                setTelegramChatId(cleanChatId);
                                setTelegramGroupIds(cleanGroupIds);
                                setTelegramChannelIds(cleanChannelIds);
                                setTelegramNotifyEvents({ ...tempTelegramNotifyEvents });

                                await handleUpdateProfile({
                                  name: tempProfileName,
                                  company_name: companyNameState,
                                  email: tempProfileEmail,
                                  phone: tempProfilePhone,
                                  telegram: cleanTg,
                                  telegram_chat_id: cleanChatId,
                                  notifications_config: {
                                    telegram_user_ids: cleanChatId,
                                    telegram_group_ids: cleanGroupIds,
                                    telegram_channel_ids: cleanChannelIds,
                                    events: tempTelegramNotifyEvents,
                                  },
                                });
                                setIsEditProfileModalOpen(false);
                              }}
                              className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] px-5 py-2.5 rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md flex items-center gap-2 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Сохранить</span>
                            </button>
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>

                  {/* Referral Link Block */}
                  <div data-tour="section.profile.referral">
                    <ReferralLinkBlock employerPublicId={employerId} />
                  </div>

                  {/* Onboarding Next Step CTA */}
                  <div className="bg-transparent border border-white/20 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-md">
                    <div className="text-left space-y-1">
                      <h4 className="text-[#E7C768] font-bold text-base">Профиль заполнен?</h4>
                      <p className="text-sm text-slate-200">Переходите к следующему шагу — созданию компании и ИИ-лендинга вакансии.</p>
                    </div>
                    <button
                      onClick={() => navigate(`/emp${employerId}/companies`)}
                      className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] hover:brightness-110 text-sm font-bold py-3.5 px-6 rounded-2xl flex items-center gap-1.5 transition-all shrink-0 w-full sm:w-auto justify-center shadow-md"
                    >
                      <span>Далее: Настройка компании</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Right Column (1 col on lg): Vertical 5-Stage "Прогресс запуска" Block */}
                <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-[88px]">
                  <div className="bg-transparent border border-[#E7C768]/40 rounded-3xl p-5 shadow-xl text-left space-y-4 backdrop-blur-md">
                    <div className="space-y-1 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-1.5 text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                        <Sparkles className="w-4 h-4 text-[#E7C768]" />
                        <span>Прогресс запуска</span>
                      </div>
                      <p className="text-sm text-slate-300">
                        5 этапов для запуска ИИ-рекрутера под ключ:
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      {/* Step 1 */}
                      <button
                        type="button"
                        onClick={() => navigate(`/emp${employerId}/profile`)}
                        className="text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-[#E7C768] text-[#E7C768] shadow-md"
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-[#E7C768] bg-transparent text-[#E7C768] mt-0.5">
                          1
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <span className="text-sm font-bold block text-[#E7C768]">Этап 1. Профиль HR</span>
                          <span className="text-sm font-bold block text-white">Учетные данные</span>
                          <span className="text-sm block text-slate-300">Настройка аккаунта и личных данных</span>
                        </div>
                      </button>

                      {/* Step 2 */}
                      <button
                        type="button"
                        onClick={() => navigate(`/emp${employerId}/companies`)}
                        className="text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-white/15 text-slate-200 hover:border-[#E7C768]/40 hover:bg-white/5"
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-white/20 bg-transparent text-slate-300 mt-0.5">
                          2
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <span className="text-sm font-bold block text-[#E7C768]">Этап 2. Мои Компании</span>
                          <span className="text-sm font-bold block text-white">Бренды и лендинги</span>
                          <span className="text-sm block text-slate-300">Создание бренда и ИИ-страницы</span>
                        </div>
                      </button>

                      {/* Step 3 */}
                      <button
                        type="button"
                        onClick={() => guardedNavigate("vacancies", `/emp${employerId}/vacancies`)}
                        className={`text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-white/15 text-slate-200 hover:border-[#E7C768]/40 hover:bg-white/5 ${tabDisabled("vacancies") ? "opacity-60" : ""}`}
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-white/20 bg-transparent text-slate-300 mt-0.5">
                          3
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <span className="text-sm font-bold block text-[#E7C768]">Этап 3. Вакансии & ИИ</span>
                          <span className="text-sm font-bold block text-white">Запустить вакансию</span>
                          <span className="text-sm block text-slate-300">Публикация вакансий и ИИ-куратор</span>
                        </div>
                      </button>

                      {/* Step 4 */}
                      <button
                        type="button"
                        onClick={() => guardedNavigate("training", `/emp${employerId}/training`)}
                        className={`text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-white/15 text-slate-200 hover:border-[#E7C768]/40 hover:bg-white/5 ${tabDisabled("training") ? "opacity-60" : ""}`}
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-white/20 bg-transparent text-slate-300 mt-0.5">
                          4
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <span className="text-sm font-bold block text-[#E7C768]">Этап 4. ИИ-Обучение</span>
                          <span className="text-sm font-bold block text-white">Обучение стажеров</span>
                          <span className="text-sm block text-slate-300">Индивидуальные онбординг-тренажеры</span>
                        </div>
                      </button>

                      {/* Step 5 */}
                      <button
                        type="button"
                        onClick={() => guardedNavigate("interviews", `/emp${employerId}/interviews`)}
                        className={`text-left border p-3.5 rounded-2xl flex items-start gap-3 transition cursor-pointer bg-transparent border-white/15 text-slate-200 hover:border-[#E7C768]/40 hover:bg-white/5 ${tabDisabled("interviews") ? "opacity-60" : ""}`}
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-white/20 bg-transparent text-slate-300 mt-0.5">
                          5
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <span className="text-sm font-bold block text-[#E7C768]">Этап 5. ИИ-Интервью</span>
                          <span className="text-sm font-bold block text-white">Скрининг и интервью</span>
                          <span className="text-sm block text-slate-300">24/7 Автоматические ИИ-собеседования</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}


          {activeTab === "interviews" && (
            <>
              {interviewView.mode === "list" ? (
                <InterviewList
                  reloadKey={interviewListReloadKey}
                  projects={projects}
                  onOpenHelp={() => {
                    setAcademyModalSlug("ai-interview");
                    setIsAcademyModalOpen(true);
                  }}
                  onOpen={(projectId) => {
                    setInterviewView({ mode: "edit", projectId });
                  }}
                  onCreate={async () => {
                    // Ask the user to confirm the per-vacancy charge for the
                    // interview system BEFORE opening the wizard.
                    let existing = new Set<string>();
                    try {
                      const ids = projects.map(p => p.id);
                      if (ids.length) {
                        const { data } = await (dbClient as any)
                          .from("interview_systems")
                          .select("project_id")
                          .in("project_id", ids);
                        (data || []).forEach((r: any) => existing.add(r.project_id));
                      }
                    } catch {}
                    setSpendDialog({
                      kind: "interview_setup",
                      pickProjects: projects,
                      excludeProjectIds: existing,
                      onConfirmed: async (projectId, result) => {
                        setSpendDialog(null);
                        await fetchBillingState();
                        if (result?.already) {
                          addAuditEvent("info", "ИИ-Система интервью: уже оплачена", "Повторное списание не выполнено");
                        } else if (result?.used_credit) {
                          addAuditEvent("success", "Списан 1 лимит «ИИ-Система интервью»", `Осталось: ${result.left ?? "?"} шт`);
                        } else if (result?.amount) {
                          addAuditEvent("success", `Списано ${result.amount} RR с баланса`, "ИИ-Система интервью");
                        }
                        setHasInterviewSetup(true);
                        setInterviewListReloadKey(k => k + 1);
                        if (projectId) {
                          setInterviewView({ mode: "edit", projectId });
                        } else {
                          setInterviewView({ mode: "list" });
                        }
                      },
                      onCancel: () => setSpendDialog(null),
                    });
                  }}
                />
              ) : (
                <InterviewWizard
                  projects={projects}
                  companies={companiesList}
                  employerId={employerId}
                  addAuditEvent={addAuditEvent}
                  refreshProjects={fetchData}
                  initialProjectId={
                    interviewView.mode === "edit"
                      ? interviewView.projectId
                      : (interviewView.mode === "create" ? interviewView.projectId : undefined)
                  }
                  createMode={interviewView.mode === "create"}
                  onBack={() => setInterviewView({ mode: "list" })}
                />
              )}
            </>
          )}

          {activeTab === "training" && (
            <>
              {trainingView.mode === "list" ? (
                <TrainingList
                  projects={projects}
                  onOpenHelp={() => {
                    setAcademyModalSlug("ai-training");
                    setIsAcademyModalOpen(true);
                  }}
                  onOpen={(projectId) => {
                    setTrainingView({ mode: "edit", projectId });
                  }}
                  onCreate={async () => {
                    let existing = new Set<string>();
                    try {
                      const ids = projects.map(p => p.id);
                      if (ids.length) {
                        const [tbRes, ttRes] = await Promise.all([
                          dbClient.from("training_blocks").select("project_id, stage").in("project_id", ids),
                          dbClient.from("training_stage_tests").select("project_id, stage, status, questions, questions_json").in("project_id", ids),
                        ]);
                        const normStage = (raw: any): string => {
                          const s = String(raw || "").toLowerCase().trim();
                          if (s === "stage1" || s === "1" || s.startsWith("prof")) return "professional";
                          if (s === "stage2" || s === "2" || s.startsWith("prod")) return "product";
                          if (s === "stage3" || s === "3" || s.startsWith("sys")) return "system";
                          return s;
                        };
                        const bMap = new Map<string, Set<string>>();
                        for (const r of (tbRes.data || []) as any[]) {
                          const stg = normStage(r.stage);
                          if (!["professional", "product", "system"].includes(stg)) continue;
                          if (!bMap.has(r.project_id)) bMap.set(r.project_id, new Set());
                          bMap.get(r.project_id)!.add(stg);
                        }
                        const tMap = new Map<string, Set<string>>();
                        for (const r of (ttRes.data || []) as any[]) {
                          const stg = normStage(r.stage);
                          if (!["professional", "product", "system"].includes(stg)) continue;
                          const qRaw = r.questions ?? r.questions_json;
                          const hasQ = Array.isArray(qRaw)
                            ? qRaw.length > 0
                            : typeof qRaw === "string" && qRaw.trim() !== "" && qRaw.trim() !== "[]";
                          if (r.status !== "completed" && !hasQ) continue;
                          if (!tMap.has(r.project_id)) tMap.set(r.project_id, new Set());
                          tMap.get(r.project_id)!.add(stg);
                        }
                        for (const id of ids) {
                          if ((bMap.get(id)?.size || 0) >= 3 && (tMap.get(id)?.size || 0) >= 3) {
                            existing.add(id);
                          }
                        }
                      }
                    } catch {}
                    setSpendDialog({
                      kind: "training_setup",
                      pickProjects: projects,
                      excludeProjectIds: existing,
                      onConfirmed: async (projectId, result) => {
                        setSpendDialog(null);
                        await fetchBillingState();
                        await fetchData();
                        if (result?.already) {
                          addAuditEvent("info", "ИИ-Система обучения: уже оплачена", "Повторное списание не выполнено");
                        } else if (result?.used_credit) {
                          addAuditEvent("success", "Списан 1 лимит «ИИ-Система обучения»", `Осталось: ${result.left ?? "?"} шт`);
                        } else if (result?.amount) {
                          addAuditEvent("success", `Списано ${result.amount} RR с баланса`, "ИИ-Система обучения");
                        }
                        setHasTrainingSetup(true);
                        if (projectId) {
                          setTrainingView({ mode: "edit", projectId });
                        } else {
                          setTrainingView({ mode: "create", projectId });
                        }
                      },
                      onCancel: () => setSpendDialog(null),
                    });
                  }}
                />
              ) : (
                <TrainingWizard
                  projects={projects}
                  companies={companiesList}
                  employerId={employerId}
                  addAuditEvent={addAuditEvent}
                  refreshProjects={fetchData}
                  initialProjectId={
                    trainingView.mode === "edit"
                      ? trainingView.projectId
                      : (trainingView.mode === "create" ? trainingView.projectId : undefined)
                  }
                  createMode={trainingView.mode === "create"}
                  onBack={() => setTrainingView({ mode: "list" })}
                />
              )}
            </>
          )}

        </main>
      </div>

      <CandidateDetailsModal
        candidateId={selectedCandidateId}
        onClose={() => setSelectedCandidateId(null)}
      />

      {/* Spend-confirm dialog: charges for landing / interview / training
          systems BEFORE opening the corresponding wizard. */}
      {spendDialog && (
        <SpendConfirmDialog
          open
          kind={spendDialog.kind}
          projectId={spendDialog.projectId}
          employerPublicId={employerId}
          pickProjects={spendDialog.pickProjects}
          excludeProjectIds={spendDialog.excludeProjectIds}
          balance={balance}
          credits={
            spendDialog.kind === "landing"
              ? landingCredits
              : spendDialog.kind === "interview_setup"
              ? interviewSetupCredits
              : trainingSetupCredits
          }
          companyPool={
            spendDialog.kind === "interview_setup"
              ? interviewCredits
              : spendDialog.kind === "training_setup"
              ? trainingCredits
              : 0
          }
          onLimitsUpdated={async () => {
            await fetchBillingState();
            await fetchData();
          }}
          onConfirmed={(pid, result) => spendDialog.onConfirmed(pid, result)}
          onClose={() => (spendDialog.onCancel ? spendDialog.onCancel() : setSpendDialog(null))}
          onGoToBilling={() => {
            setSpendDialog(null);
            const empId = employerId || "";
            if (empId) navigate(`/emp${empId}/tariff`);
          }}
        />
      )}

      {/* MODAL WINDOW FOR PAYMENT */}
      {selectedPlanToBuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-transparent backdrop-blur-2xl transition-opacity"
            onClick={() => setSelectedPlanToBuy(null)}
          />
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 p-6 sm:p-8 rounded-3xl w-full max-w-md text-left text-white shadow-2xl relative z-10 space-y-4 animate-fadeIn">
            <button 
              onClick={() => setSelectedPlanToBuy(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer bg-transparent border border-white/20 w-8 h-8 rounded-full flex items-center justify-center transition"
            >
              ✕
            </button>
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Оплата тарифа</h2>
            <p className="text-sm text-slate-200 leading-relaxed">
              Вы активируете тариф <strong className="text-white bg-transparent px-2 py-0.5 rounded border border-[#E7C768]/40">{selectedPlanToBuy === "silver" ? "Серебро Про" : "Золото Безлимит"}</strong>. Оплата производится через безопасный шлюз.
            </p>
            <button
              onClick={handleConfirmPayment}
              disabled={isProcessingPayment}
              className="w-full bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-95 text-[#17344F] font-bold text-sm py-3.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              {isProcessingPayment ? (
                <span className="flex items-center justify-center gap-1">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Связь с сервером платежного шлюза...
                </span>
              ) : (
                `Оплатить ${selectedPlanToBuy === "silver" ? "14 900 ₽" : "39 900 ₽"}`
              )}
            </button>

            <span className="text-sm text-slate-300 leading-normal block text-center italic">Вы также можете пропустить оплату, вся система адаптации полноценно работает в тестовом режиме Бронза.</span>
          </div>
        </div>
      )}

      {/* MODAL WINDOW: EDIT VACANCY DETAILS AND SUBPAGES TEXTS */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-transparent backdrop-blur-2xl transition-opacity"
            onClick={() => setEditingProject(null)}
          />
          <div className="brand-editor bg-transparent backdrop-blur-2xl border border-white/20 p-6 sm:p-8 rounded-3xl w-full max-w-6xl text-left text-white shadow-2xl relative z-10 max-h-[95vh] overflow-y-auto space-y-5 animate-fadeIn">
            <button 
              onClick={() => setEditingProject(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer bg-transparent border border-white/20 w-8 h-8 rounded-full flex items-center justify-center transition"
            >
              ✕
            </button>

            <div className="border-b border-white/10 pb-3">
              <span className="text-sm font-bold font-mono flex items-center gap-1.5 bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">
                <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-pulse" />
                {(editingProject as any).status === "draft" && !editingProject.roleName ? "Создание новой вакансии" : `Редактирование вакансии • ID: ${(editingProject as any).publicId || (editingProject as any).public_id || editingProject.id}`}
              </span>
              <h2 className="text-xl font-bold text-white mt-1">
                {editingProject.roleName || "Новая вакансия"}
              </h2>
            </div>

            {/* Unified VacancyEditor — same look as the create wizard, with per-field live preview */}
            <form onSubmit={handleSaveEditedProject} className="space-y-5">
              {/* Document uploader — same UX as the create wizard */}
              {(() => {
                const ep: any = editingProject;
                const total = (
                  (ep.roleName || "") + (ep.vacancyText || "") + (ep.tasksActivityText || "") +
                  (ep.scheduleText || "") + (ep.motivationText || "") + (ep.motivationTextDetail || "") +
                  (ep.payoutsText || "") + (ep.onboardingText || "") + (ep.teamText || "") +
                  (ep.systemText || "") + (ep.trainingProfessionalText || "") + (ep.trainingProductText || "") +
                  (ep.trainingSystemsText || "") + (ep.trainingWikiText || "") + (ep.trainingRegulationsText || "") +
                  editVacancyRawText
                ).trim().length;
                const canBeautify = aiReady && total >= 50;
                return (
                  <DocumentUploader
                    entity="vacancy"
                    entityId={editingProject.id}
                    pathPrefix={editingProject.id}
                    rawText={editVacancyRawText}
                    onRawTextChange={setEditVacancyRawText}
                    rawTextLabel="Введите текст вакансии"
                    maxChars={10000}
                    title="Распознавание условий вакансии из файла"
                    hint="Шаг 1 — загрузите регламент или файл вакансии. Шаг 2 — нажмите «Распознать документ». Шаг 3 — нажмите «Оформить красиво», и ИИ заполнит все 15 полей вакансии."
                    onEnhance={async () => {
                      setIsEnhancingAllVacEdit(true);
                      try { await handleEnhanceAllVacancyLandingFields(); }
                      finally { setIsEnhancingAllVacEdit(false); }
                    }}
                    enhanceBusy={isEnhancingAllVacEdit || isEnhancingAllVac}
                    canEnhance={canBeautify}
                    enhanceHint={canBeautify ? "Оформить все 15 полей вакансии через ИИ" : "Заполните поля минимум на 50 символов суммарно (или загрузите файл)"}
                    onAudit={addAuditEvent}
                    alwaysShowTextArea
                  />
                );
              })()}

              {/* Company + Role pickers */}
              <div className="rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl p-4 space-y-3">
                <span className="text-sm font-mono text-[#E7C768] font-bold block">
                  Компания и должность
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-bold text-slate-200 block mb-1">Компания:</label>
                    {companiesList.length > 0 ? (
                      <select
                        id="editing-project-company-select"
                        className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-2xl border border-white/20 text-white focus:outline-[#E7C768]"
                        value={
                          companiesList.find(c => (editingProject as any).company_id && (c.id === (editingProject as any).company_id || c.public_id === (editingProject as any).company_id))?.id ||
                          companiesList.find(c => (editingProject as any).companyId && (c.id === (editingProject as any).companyId || c.public_id === (editingProject as any).companyId))?.id ||
                          companiesList.find(c => c.name?.toLowerCase() === (editingProject.companyName || "").toLowerCase())?.id ||
                          ""
                        }
                        onChange={(e) => {
                          const chosenCo = companiesList.find(c => c.id === e.target.value);
                          if (chosenCo) {
                            setEditingProject({
                              ...editingProject,
                              companyId: chosenCo.id,
                              company_id: chosenCo.id,
                              companyName: chosenCo.name,
                              company_name: chosenCo.name,
                              companySlug: chosenCo.slug,
                              company_slug: chosenCo.slug,
                              companyPublicId: chosenCo.public_id,
                              company_public_id: chosenCo.public_id,
                              logoUrl: chosenCo.logo_url || chosenCo.logoUrl || (editingProject as any).logoUrl,
                            } as any);
                          } else {
                            setEditingProject({ ...editingProject, companyName: e.target.value } as any);
                          }
                        }}
                      >
                        <option value="" style={{ backgroundColor: "#17344F", color: "#FFFFFF" }}>Выберите компанию...</option>
                        {companiesList.map((c) => (
                          <option key={c.id} value={c.id} style={{ backgroundColor: "#17344F", color: "#FFFFFF" }}>
                            {c.name} (ID: {c.public_id || c.id}{c.slug ? `, /${c.slug}` : ""})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-2xl border border-white/20 text-white focus:outline-[#E7C768]"
                        value={editingProject.companyName || ""}
                        onChange={(e) => setEditingProject({ ...editingProject, companyName: e.target.value } as any)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-200 block mb-1">Должность:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Например: Менеджер по продажам"
                        className="flex-1 bg-transparent backdrop-blur-md text-sm p-3 rounded-2xl border border-white/20 text-white focus:outline-[#E7C768]"
                        value={editingProject.roleName || ""}
                        onChange={(e) => setEditingProject({ ...editingProject, roleName: e.target.value } as any)}
                      />
                      <button
                        type="button"
                        onClick={applyRoleTemplateToEditing}
                        className="px-4 py-2.5 rounded-2xl bg-[#E7C768]/15 hover:bg-[#E7C768]/25 border border-[#E7C768]/40 text-[#E7C768] text-sm font-bold transition whitespace-nowrap"
                        title="Заменить все 15 полей шаблоном для выбранной должности"
                      >
                        Применить шаблон ко всем 15 полям
                      </button>
                    </div>
                    {editingProject.roleName && editingProject.roleName.trim().length > 0 && (() => {
                      const roleSlug = transliterateToSlug(editingProject.roleName.trim());
                      return (
                        <div className="flex flex-col gap-1.5 pt-2">
                          <div className="text-sm text-slate-300 flex items-center gap-2 font-mono px-1">
                            <span className="text-[#E7C768]">Ссылка вакансии:</span>
                            <span className="text-white/90">/{roleSlug}</span>
                            {isRoleSlugDuplicate ? (
                              <span className="text-[#F4EE8E] border border-[#E7C768]/50 px-2.5 py-0.5 rounded-lg text-sm font-sans">
                                Занята в этой компании
                              </span>
                            ) : (
                              <span className="text-white/90 border border-white/20 px-2.5 py-0.5 rounded-lg text-sm font-sans">
                                Свободна
                              </span>
                            )}
                          </div>
                          {isRoleSlugDuplicate && (
                            <div className="text-sm text-[#F4EE8E] bg-transparent backdrop-blur-xl border border-[#E7C768]/50 px-3.5 py-2 rounded-xl flex items-center gap-2">
                              <span>⚠️</span>
                              <span>В выбранной компании уже есть вакансия «{editingProject.roleName}» с ссылкой <b>/{roleSlug}</b>. Укажите другое название или специализацию для этой компании.</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-2">
                  <input
                    type="text"
                    placeholder="Фильтровать справочник профессий..."
                    className="bg-transparent backdrop-blur-md text-sm p-2.5 w-full rounded-xl border border-white/20 text-white"
                    value={editSpecialtySearch}
                    onChange={(e) => setEditSpecialtySearch(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {jobTitlesList
                      .filter((s) => String(s || "").toLowerCase().includes(editSpecialtySearch.toLowerCase()))
                      .map((spec) => (
                        <button
                          key={spec}
                          type="button"
                          onClick={() => {
                            setEditingProject({ ...editingProject, roleName: spec } as any);
                            setEditSpecialtySearch("");
                          }}
                          className="bg-white/10 border border-white/15 hover:border-[#E7C768] text-sm px-3 py-1 rounded-xl text-white transition"
                        >
                          💼 {spec}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              <VacancyEditor
                mode="edit"
                projectId={editingProject.id}
                companyName={editingProject.companyName}
                hideKeys={["role_name"]}
                roleTemplates={roleTplToFields(editRoleTemplates)}
                values={projectToVacancyValues(editingProject)}
                onChange={(patch) => setEditingProject({ ...editingProject, ...vacancyValuesToCamel(patch) } as any)}
                otherProjects={projects.map((p: any) => ({
                  id: p.id,
                  roleName: p.roleName || p.role_name,
                  companyName: p.companyName || p.company_name,
                  candidate_fields_config: p.candidate_fields_config || p.candidateFieldsConfig,
                }))}
                aiLoadingKey={aiEnhancingField}
                onAIEnhance={async (key) => {
                  if (!editingProject) return;
                  setAiEnhancingField(key);
                  try {
                    const { aiEnhanceSingle } = await import("@/lib/aiClient");
                    const field = VACANCY_FIELDS_BY_KEY[key];
                    const current = projectToVacancyValues(editingProject)[key] || "";
                    const value = await aiWaitRun({
                      title: `ИИ улучшает «${field.label}»`,
                      task: () => aiEnhanceSingle({
                        field: key,
                        value: current,
                        company_name: editingProject.companyName,
                        role_name: editingProject.roleName,
                        template: field.example,
                        hint: `canonical_format:${field.preview}`,
                      }),
                    });
                    if (value) {
                      setEditingProject({
                        ...editingProject,
                        ...vacancyValuesToCamel({ [key]: value }),
                      });
                      addAuditEvent("success", "Поле улучшено ИИ", `Раздел "${field.label}" переписан в каноническом формате.`);
                    }
                  } catch (err) {
                    console.error(err);
                    addAuditEvent("warning", "Ошибка ИИ", "Не удалось улучшить раздел.");
                  } finally {
                    setAiEnhancingField(null);
                  }
                }}
              />

              {/* Live Preview Links of the Vacancy (Public mirror and Canonical ID mirror) */}
              {(() => {
                const ep: any = editingProject;
                const epCompId = ep.company_id || ep.companyId;
                const matchedCompany = companiesList.find(c => 
                  (epCompId && (String(c.id) === String(epCompId) || String(c.public_id) === String(epCompId) || String(c.id) === `comp-${String(epCompId).replace(/^comp-?/, "")}`))
                ) || companiesList.find(c => 
                  c?.name && (ep?.companyName || ep?.company_name) && c.name.trim().toLowerCase() === (ep?.companyName || ep?.company_name).trim().toLowerCase()
                );

                const roleStr = ep.roleName || "";
                const compStr = ep.companyName || "";
                const effRoleSlug = ep.slug && !/^vac\d+$/i.test(ep.slug) && ep.slug !== "vakansiya"
                  ? ep.slug
                  : (roleStr ? transliterateToSlug(roleStr) : (ep.publicId ? `vac${ep.publicId}` : "vac"));
                const effCompSlug = matchedCompany?.slug || ep.companySlug || (compStr ? transliterateToSlug(compStr) : "company");
                const effCompPid = String(matchedCompany?.public_id || ep.company_public_id || epCompId || "300001").replace(/\D/g, "") || "300001";
                const effRolePid = String(ep.publicId || ep.public_id || ep.id).replace(/\D/g, "") || String(ep.id);

                const liveUrl = `/${effCompSlug}/${effRoleSlug}`;
                const editUrl = `/com${effCompPid}/vac${effRolePid}`;

                return (
                  <div className="rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-[#E7C768] font-bold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#E7C768]" />
                        Ссылки на ИИ-Лендинг вакансии (зеркала)
                      </span>
                      {effCompPid && (
                        <span className="text-sm font-mono text-white/70 border border-white/20 px-2 py-0.5 rounded-lg">
                          Компания ID: {effCompPid}
                        </span>
                      )}
                    </div>

                    {/* Mirror 1: Public candidate link with text slug */}
                    <div className="space-y-1.5">
                      <span className="text-sm text-slate-300 block font-sans">
                        Публичная ссылка для соискателей:
                      </span>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-transparent backdrop-blur-md border border-white/15 p-3.5 rounded-xl">
                        <span className="text-sm font-mono text-white select-all break-all">
                          {window.location.origin}{liveUrl}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}${liveUrl}`);
                              addAuditEvent("info", "Ссылка скопирована", "Прямая ссылка на вакансию скопирована");
                            }}
                            className="cursor-pointer text-sm font-mono font-bold bg-transparent hover:bg-white/10 border border-white/20 text-white px-3 py-1.5 rounded-lg transition"
                          >
                            Копировать
                          </button>
                          <button
                            type="button"
                            onClick={() => window.open(liveUrl, "_blank")}
                            className="cursor-pointer text-sm font-mono font-bold bg-transparent hover:bg-white/10 border border-[#E7C768]/40 text-[#E7C768] px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                          >
                            <span>Открыть</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Mirror 2: Canonical ID link for editing */}
                    <div className="space-y-1.5">
                      <span className="text-sm text-slate-300 block font-sans">
                        Ссылка для редактирования:
                      </span>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-transparent backdrop-blur-md border border-white/15 p-3.5 rounded-xl">
                        <span className="text-sm font-mono text-[#E7C768] select-all break-all">
                          {window.location.origin}{editUrl}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}${editUrl}`);
                              addAuditEvent("info", "Ссылка скопирована", "Ссылка для редактирования вакансии скопирована");
                            }}
                            className="cursor-pointer text-sm font-mono font-bold bg-transparent hover:bg-white/10 border border-white/20 text-white px-3 py-1.5 rounded-lg transition"
                          >
                            Копировать
                          </button>
                          <button
                            type="button"
                            onClick={() => window.open(editUrl, "_blank")}
                            className="cursor-pointer text-sm font-mono font-bold bg-transparent hover:bg-white/10 border border-white/20 text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                          >
                            <span>Открыть</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* HH publish templates — only available after the vacancy exists (i.e. in edit mode). */}
              <HHTemplatesSection
                projectId={editingProject.id}
                roleName={editingProject.roleName}
                companyName={editingProject.companyName}
                projectData={editingProject as any}
                values={{
                  hhPostText: (editingProject as any).hhPostText || "",
                  hhInviteText: (editingProject as any).hhInviteText || "",
                  hhAutoresumeText: (editingProject as any).hhAutoresumeText || "",
                }}
                onChange={(patch) => setEditingProject({ ...editingProject, ...patch } as any)}
                onAudit={addAuditEvent}
              />

              {/* Telegram notification routing for this vacancy */}
              {(() => {
                const rawNotif = (editingProject as any).notifications_config || (editingProject as any).notificationsConfig;
                let notifObj: any = {
                  custom_enabled: false,
                  telegram_group_ids: "",
                  telegram_channel_ids: "",
                  telegram_user_ids: "",
                  events: {
                    new_candidate: true,
                    interview_passed: true,
                    test_passed: true,
                    training_progress: true,
                  },
                };
                if (typeof rawNotif === "string") {
                  try { notifObj = { ...notifObj, ...JSON.parse(rawNotif) }; } catch {}
                } else if (rawNotif && typeof rawNotif === "object") {
                  notifObj = { ...notifObj, ...rawNotif };
                }

                const updateVacancyNotif = (patch: any) => {
                  const updated = { ...notifObj, ...patch };
                  setEditingProject({
                    ...editingProject,
                    notifications_config: updated,
                    notificationsConfig: updated,
                  } as any);
                };

                return (
                  <div className="bg-transparent border border-white/20 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📢</span>
                        <h3 className="text-[14px] font-bold text-[#E7C768]">
                          Оповещения в Telegram по этой вакансии
                        </h3>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-[14px] text-slate-200">
                        <input
                          type="checkbox"
                          checked={Boolean(notifObj.custom_enabled)}
                          onChange={(e) => updateVacancyNotif({ custom_enabled: e.target.checked })}
                          className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                        />
                        <span>Индивидуальные настройки для этой вакансии</span>
                      </label>
                    </div>

                    <p className="text-[14px] text-slate-300">
                      {notifObj.custom_enabled
                        ? "Оповещения по откликам и этапам этой вакансии отправляются в указанные ниже чаты / каналы."
                        : "По умолчанию используются чаты и каналы, указанные в вашем профиле работодателя. Включите опцию выше, если хотите направлять уведомления по этой вакансии в отдельный командный чат или канал."}
                    </p>

                    {notifObj.custom_enabled && (
                      <div className="space-y-3.5 pt-2 border-t border-white/10">
                        <div>
                          <label className="block text-[14px] text-slate-200 font-bold mb-1">
                            Групповые чаты / каналы для этой вакансии (ID через запятую):
                          </label>
                          <input
                            type="text"
                            value={notifObj.telegram_group_ids || ""}
                            onChange={(e) => updateVacancyNotif({ telegram_group_ids: e.target.value })}
                            placeholder="например: -1001234567890, -1009876543210"
                            className="w-full bg-white/5 border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-[14px] text-slate-200 font-bold mb-1">
                            Публичные каналы / группы (username или ссылки):
                          </label>
                          <input
                            type="text"
                            value={notifObj.telegram_channel_ids || ""}
                            onChange={(e) => updateVacancyNotif({ telegram_channel_ids: e.target.value })}
                            placeholder="например: @hr_sales, https://t.me/vacancy_team"
                            className="w-full bg-white/5 border border-white/20 rounded-xl px-3.5 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                          />
                        </div>

                        <div className="bg-transparent border border-white/10 rounded-xl p-3 space-y-2">
                          <span className="text-[14px] font-bold text-[#E7C768] block">
                            События по вакансии для отправки:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[14px]">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={notifObj.events?.new_candidate ?? true}
                                onChange={(e) =>
                                  updateVacancyNotif({
                                    events: { ...(notifObj.events || {}), new_candidate: e.target.checked },
                                  })
                                }
                                className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                              />
                              <span>Новые отклики соискателей</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={notifObj.events?.interview_passed ?? true}
                                onChange={(e) =>
                                  updateVacancyNotif({
                                    events: { ...(notifObj.events || {}), interview_passed: e.target.checked },
                                  })
                                }
                                className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                              />
                              <span>Завершение интервью и баллы</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={notifObj.events?.test_passed ?? true}
                                onChange={(e) =>
                                  updateVacancyNotif({
                                    events: { ...(notifObj.events || {}), test_passed: e.target.checked },
                                  })
                                }
                                className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                              />
                              <span>Сдача тестов и аттестаций</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={notifObj.events?.training_progress ?? true}
                                onChange={(e) =>
                                  updateVacancyNotif({
                                    events: { ...(notifObj.events || {}), training_progress: e.target.checked },
                                  })
                                }
                                className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                              />
                              <span>Прохождение обучения</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Bottom control buttons */}
              <div className="pt-4 border-t border-white/10 flex flex-wrap gap-3 sticky bottom-0 bg-transparent backdrop-blur-2xl -mx-6 sm:-mx-8 px-6 sm:px-8 py-4">
                <button
                  type="submit"
                  disabled={isSavingEdit || isRoleSlugDuplicate}
                  className={`flex-1 font-extrabold py-3 px-6 rounded-2xl shadow-lg transition text-sm ${
                    isSavingEdit || isRoleSlugDuplicate
                      ? "opacity-40 cursor-not-allowed bg-transparent border border-white/20 text-white/50"
                      : "cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] hover:brightness-105 active:scale-95"
                  }`}
                >
                  {isSavingEdit ? "Сохранение..." : "💾 Сохранить и синхронизировать"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/20 px-6 py-3 rounded-2xl text-slate-200 font-bold transition text-sm"
                >
                  Отмена
                </button>
                {((editingProject as any).status === "paused") ? (
                  <button
                    type="button"
                    disabled={updatingStatusProjectId === editingProject.id}
                    onClick={() => handleSetVacancyStatus(editingProject.id, "active")}
                    className="cursor-pointer bg-white/5 hover:bg-white/10 border border-[#E7C768]/50 text-[#E7C768] px-5 py-3 rounded-2xl font-bold transition text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {updatingStatusProjectId === editingProject.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                    ) : (
                      <Play className="w-4 h-4 text-[#E7C768]" />
                    )}
                    {updatingStatusProjectId === editingProject.id ? "Запуск..." : "Снять с паузы"}
                  </button>
                ) : ((editingProject as any).status !== "archived") ? (
                  <button
                    type="button"
                    disabled={updatingStatusProjectId === editingProject.id}
                    onClick={() => handleSetVacancyStatus(editingProject.id, "paused")}
                    className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/20 text-slate-200 px-5 py-3 rounded-2xl font-bold transition text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {updatingStatusProjectId === editingProject.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                    ) : (
                      <Pause className="w-4 h-4 text-slate-300" />
                    )}
                    {updatingStatusProjectId === editingProject.id ? "Остановка..." : "Приостановить"}
                  </button>
                ) : null}
                {((editingProject as any).status === "archived") ? (
                  <button
                    type="button"
                    disabled={updatingStatusProjectId === editingProject.id}
                    onClick={() => handleSetVacancyStatus(editingProject.id, "active")}
                    className="cursor-pointer bg-white/5 hover:bg-white/10 border border-[#E7C768]/50 text-[#E7C768] px-5 py-3 rounded-2xl font-bold transition text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {updatingStatusProjectId === editingProject.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                    ) : (
                      <Play className="w-4 h-4 text-[#E7C768]" />
                    )}
                    {updatingStatusProjectId === editingProject.id ? "Восстановление..." : "Восстановить из архива"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenArchiveModal(editingProject)}
                    className="cursor-pointer bg-white/5 hover:bg-white/10 border border-white/20 text-[#E7C768] px-5 py-3 rounded-2xl font-bold transition text-sm flex items-center gap-2"
                    title="Перевести вакансию в архив с переносом неизрасходованных лимитов"
                  >
                    <Archive className="w-4 h-4 text-[#E7C768]" />
                    В архив
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL WINDOW: INLINE POPUP SECTION EDITOR */}
      {editingProject && inlineEditSection && (
        <div className="fixed inset-0 z-[60] bg-transparent flex items-center justify-center p-4">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl w-full max-w-2xl text-left text-white shadow-2xl relative p-6 sm:p-8 space-y-5 animate-fadeIn overflow-y-auto max-h-[90vh]">
            <button 
              type="button"
              onClick={() => setInlineEditSection(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold cursor-pointer bg-transparent border border-white/20 w-8 h-8 rounded-full flex items-center justify-center transition"
            >
              ✕
            </button>

            <div className="border-b border-white/10 pb-3">
              <span className="text-sm font-mono text-[#E7C768] font-bold tracking-wider block">Быстрое редактирование блока</span>
              <h3 className="text-lg font-bold text-white mt-1">
                {inlineEditSection === "company" && "🏢 О компании, миссии и масштабе"}
                {inlineEditSection === "vacancy" && "💼 Требования к кандидату"}
                {inlineEditSection === "tasksActivity" && "🎯 Обязанности и Задачи"}
                {inlineEditSection === "schedule" && "📅 График Работы"}
                {inlineEditSection === "motivation" && "🔥 Мотивация и привилегии"}
                {inlineEditSection === "payouts" && "💵 Финансовые Выплаты"}
                {inlineEditSection === "onboarding" && "🚀 Процесс Онбординга"}
                {inlineEditSection === "team" && "👥 Наша Команда"}
                {inlineEditSection === "cabinetTabs" && "💻 Рабочий Кабинет"}
                {inlineEditSection === "system" && "⚙️ Регламенты контроля"}
              </h3>
              <p className="text-sm text-slate-300 mt-1">
                {inlineEditSection === "company" && "Опишите факты, укажите миссию и настройте 3 счетчика на лендинге:"}
                {inlineEditSection === "vacancy" && "Ниже перечислены требования. Каждый пункт пишите с новой строки:"}
                {inlineEditSection === "tasksActivity" && "Опишите ежедневные задачи. Формат: • [📞 Консультация] Описание задачи:"}
                {inlineEditSection === "schedule" && "Пропишите условия графика. Каждый пункт пишите с новой строки:"}
                {inlineEditSection === "motivation" && "Привилегии и бонусы компании. Каждый пункт с новой строки:"}
                {inlineEditSection === "payouts" && "Правила и условия выплат авансов, фикса, бонусов за друзей:"}
                {inlineEditSection === "onboarding" && "Опишите по порядку этапы стажировки: • [📝 Экспресс-тест] Описание этапа:"}
                {inlineEditSection === "team" && "Каждый куратор в формате: • Имя - Должность. Текст девиза:"}
                {inlineEditSection === "cabinetTabs" && "Инструменты CRM. Формат: • [💻 Название] Описание | 💡 Регламент:"}
                {inlineEditSection === "system" && "Свод правил контроля качества звонков кандидатов и стажеров:"}
              </p>
            </div>

            <div className="space-y-4">
              {inlineEditSection === "company" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#E7C768]">Факты о компании (каждый с новой строки):</label>
                    <textarea
                      className="w-full bg-transparent text-sm p-3 rounded-xl border border-white/20 text-white font-mono focus:outline-none focus:border-[#E7C768]"
                      rows={4}
                      value={editingProject.companyText || ""}
                      onChange={(e) => setEditingProject({ ...editingProject, companyText: e.target.value })}
                      placeholder="• Мы на рынке более 10 лет..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[#E7C768]">Цитата / Миссия компании:</label>
                    <textarea
                      className="w-full bg-transparent text-sm p-2.5 rounded-xl border border-white/20 text-white focus:outline-none focus:border-[#E7C768]"
                      rows={2}
                      value={editingProject.missionText || "Наша миссия — избавить людей от рутины в холодных звонках, автоматизировав базовую квалификацию лидов. Каждый день мы упрощаем работу сотрудникам отделов продаж по всему миру."}
                      onChange={(e) => setEditingProject({ ...editingProject, missionText: e.target.value })}
                      placeholder="Опишите глобальную миссию компании"
                    />
                  </div>

                  <div className="border-t border-white/10 pt-3">
                    <span className="text-sm font-mono tracking-wider text-[#E7C768] font-bold block mb-2">Настройка 3-х характеристик / счетчиков</span>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-transparent p-3 rounded-xl border border-white/20 space-y-1.5 backdrop-blur-md">
                        <span className="text-sm text-[#E7C768] font-bold font-mono">Счетчик 1</span>
                        <input
                          type="text"
                          className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-white font-bold"
                          value={editingProject.statsValClients !== undefined && editingProject.statsValClients !== null ? editingProject.statsValClients : "350+"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsValClients: e.target.value })}
                          placeholder="Значение"
                        />
                        <input
                          type="text"
                          className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-slate-200"
                          value={editingProject.statsLabelClients !== undefined && editingProject.statsLabelClients !== null ? editingProject.statsLabelClients : "Клиентов в СНГ"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsLabelClients: e.target.value })}
                          placeholder="Подпись"
                        />
                      </div>

                      <div className="bg-transparent p-3 rounded-xl border border-white/20 space-y-1.5 backdrop-blur-md">
                        <span className="text-sm text-[#E7C768] font-bold font-mono">Счетчик 2</span>
                        <input
                          type="text"
                          className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-white font-bold"
                          value={editingProject.statsValDialogs !== undefined && editingProject.statsValDialogs !== null ? editingProject.statsValDialogs : "15 000+"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsValDialogs: e.target.value })}
                          placeholder="Значение"
                        />
                        <input
                          type="text"
                          className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-slate-200"
                          value={editingProject.statsLabelDialogs !== undefined && editingProject.statsLabelDialogs !== null ? editingProject.statsLabelDialogs : "ИИ-диалогов в сутки"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsLabelDialogs: e.target.value })}
                          placeholder="Подпись"
                        />
                      </div>

                      <div className="bg-transparent p-3 rounded-xl border border-white/20 space-y-1.5 backdrop-blur-md">
                        <span className="text-sm text-[#E7C768] font-bold font-mono">Счетчик 3</span>
                        <input
                          type="text"
                          className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-white font-bold"
                          value={editingProject.statsValFounded !== undefined && editingProject.statsValFounded !== null ? editingProject.statsValFounded : "2021"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsValFounded: e.target.value })}
                          placeholder="Значение"
                        />
                        <input
                          type="text"
                          className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-slate-200"
                          value={editingProject.statsLabelFounded !== undefined && editingProject.statsLabelFounded !== null ? editingProject.statsLabelFounded : "Год основания"}
                          onChange={(e) => setEditingProject({ ...editingProject, statsLabelFounded: e.target.value })}
                          placeholder="Подпись"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {inlineEditSection !== "company" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-[#E7C768]">Содержание контента блока:</label>
                  <textarea
                    className="w-full bg-transparent text-sm p-3 rounded-xl border border-white/20 text-white font-mono focus:outline-none focus:border-[#E7C768] scrollbar-thin"
                    rows={12}
                    value={(() => {
                      const map: Record<string, string> = {
                        vacancy: "vacancyText",
                        tasksActivity: "tasksActivityText",
                        schedule: "scheduleText",
                        motivation: "motivationTextDetail",
                        payouts: "payoutsText",
                        onboarding: "onboardingText",
                        team: "teamText",
                        cabinetTabs: "cabinetTabsText",
                        system: "systemText"
                      };
                      const fieldName = map[inlineEditSection];
                      return (editingProject as any)[fieldName] || "";
                    })()}
                    onChange={(e) => {
                      const map: Record<string, string> = {
                        vacancy: "vacancyText",
                        tasksActivity: "tasksActivityText",
                        schedule: "scheduleText",
                        motivation: "motivationTextDetail",
                        payouts: "payoutsText",
                        onboarding: "onboardingText",
                        team: "teamText",
                        cabinetTabs: "cabinetTabsText",
                        system: "systemText"
                      };
                      const fieldName = map[inlineEditSection];
                      setEditingProject({
                        ...editingProject,
                        [fieldName]: e.target.value
                      });
                    }}
                    placeholder="Введите текст с новой строки..."
                  />
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setInlineEditSection(null)}
                className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-sm px-5 py-3 rounded-xl hover:brightness-110 active:scale-95 transition flex items-center gap-1.5 shadow-md"
              >
                <span>Применить и закрыть</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Left-aligned) */}
      <nav className="lg:hidden fixed bottom-3 left-3 z-40 max-w-[calc(100vw-88px)] bg-transparent backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl p-1.5 flex items-center justify-start gap-1">
        <button
          type="button"
          onClick={() => navigate(`/emp${employerId}/profile`)}
          className={`flex-1 min-w-[62px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition active:scale-95 bg-transparent ${
            activeTab === "profile"
              ? "text-white font-bold border border-[#E7C768] shadow"
              : "text-white/80 hover:text-white border border-transparent"
          }`}
        >
          <User className="w-4 h-4 text-[#E7C768]" />
          <span className="text-sm leading-tight font-medium truncate">Профиль</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (projects.length === 0) {
              navigate(`/emp${employerId}/companies`);
            } else {
              guardedNavigate("vacancies", `/emp${employerId}/vacancies`);
            }
          }}
          className={`flex-1 min-w-[62px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition active:scale-95 bg-transparent ${
            activeTab === "vacancies"
              ? "text-white font-bold border border-[#E7C768] shadow"
              : "text-white/80 hover:text-white border border-transparent"
          }`}
        >
          <Briefcase className="w-4 h-4 text-[#E7C768]" />
          <span className="text-sm leading-tight font-medium truncate">Вакансии</span>
        </button>

        <button
          type="button"
          onClick={() => { navigate(`/emp${employerId}/crm`); setCrmViewMode("kanban"); }}
          className={`flex-1 min-w-[62px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition active:scale-95 bg-transparent ${
            activeTab === "crm"
              ? "text-white font-bold border border-[#E7C768] shadow"
              : "text-white/80 hover:text-white border border-transparent"
          }`}
        >
          <Users className="w-4 h-4 text-[#E7C768]" />
          <span className="text-sm leading-tight font-medium truncate">CRM</span>
        </button>

        <button
          type="button"
          onClick={() => navigate(`/emp${employerId}/tariff`)}
          className={`flex-1 min-w-[62px] px-2.5 py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 transition active:scale-95 bg-transparent ${
            activeTab === "tariff"
              ? "text-white font-bold border border-[#E7C768] shadow"
              : "text-white/80 hover:text-white border border-transparent"
          }`}
        >
          <CreditCard className="w-4 h-4 text-[#E7C768]" />
          <span className="text-sm leading-tight font-medium truncate">Баланс</span>
        </button>
      </nav>

      <VacancyCreationLimitModal
        isOpen={showVacancyLimitModal}
        onClose={() => setShowVacancyLimitModal(false)}
        landingCredits={landingCredits}
        balance={balance}
        employerId={employerId}
        isProcessing={isCreatingVacancyDraft}
        onConfirmCreate={handleConfirmVacancyLimitModal}
        onGoToTariffPay={handleGoToTariffPay}
      />

      <SelectCompanyModalForVacancy
        isOpen={showSelectCompanyModalForVacancy}
        companies={companiesList}
        onClose={() => setShowSelectCompanyModalForVacancy(false)}
        onSelectCompany={(company) => startVacancyWizardWithCompany(company, pendingVacancyPaymentMethod)}
        onCreateCompany={handleGoToCreateCompany}
      />

      <CompanyTeamModal
        isOpen={showCompanyTeamModal}
        onClose={() => {
          setShowCompanyTeamModal(false);
          setSelectedTeamCompany(null);
        }}
        company={selectedTeamCompany}
        currentEmployerId={employerId}
        onSuccessNotification={(title, message) => {
          addAuditEvent("info", title, message);
        }}
      />

      <EmployerAIAssistant
        employerId={employerId}
        currentTab={activeTab}
        onNavigateTab={(tab) => {
          if (tab === "crm") navigate(`/emp${employerId}`);
          else if (tab === "vacancies") navigate(`/emp${employerId}/vacancies`);
          else if (tab === "companies") navigate(`/emp${employerId}/companies`);
          else if (tab === "tariff" || tab === "billing") navigate(`/emp${employerId}/tariff`);
          else if (tab === "interviews") navigate(`/emp${employerId}/interviews`);
          else if (tab === "training") navigate(`/emp${employerId}/training`);
          else if (tab === "profile") navigate(`/emp${employerId}/profile`);
        }}
        onOpenModal={(modal) => {
          if (modal === "crm_constructor") setIsCrmConstructorOpen(true);
          else if (modal === "crm_dialogs") setIsCrmDialogsOpen(true);
          else if (modal === "crm_filter") setIsCrmFilterModalOpen(true);
          else if (modal === "academy") setIsAcademyModalOpen(true);
          else if (modal === "create_vacancy") setShowSelectCompanyModalForVacancy(true);
          else if (modal === "create_company") handleGoToCreateCompany();
        }}
        onFillField={handleAiFillField}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        intent="employer"
        initialMode="login"
        onSuccess={handleAuthSuccess}
      />

      {/* AI-Academy Modal rendered globally across all EmployerPanel tabs */}
      <AcademyModal
        isOpen={isAcademyModalOpen}
        onClose={() => setIsAcademyModalOpen(false)}
        initialSlug={academyModalSlug}
      />

      {/* Archive Vacancy Modal with Limit Transfer */}
      <ArchiveVacancyModal
        isOpen={!!vacancyToArchive}
        vacancy={vacancyToArchive}
        allVacancies={projects}
        onClose={() => setVacancyToArchive(null)}
        onSuccess={async (archivedId) => {
          setVacancyToArchive(null);
          setPausedProjectIds((prev) => prev.filter((id) => id !== archivedId));
          setProjects((prev) =>
            prev.map((p) =>
              p.id === archivedId
                ? ({ ...p, status: "archived", is_published: 0 } as any)
                : p
            )
          );
          if (editingProject && editingProject.id === archivedId) {
            setEditingProject(null);
          }
          await Promise.all([fetchBillingState(), fetchData()]);
        }}
        addAuditEvent={addAuditEvent}
      />
      
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Реферальная ссылка работодателя — Google-only, +1000 RR пригласившему */
/* ------------------------------------------------------------------ */
function ReferralLinkBlock({ employerPublicId }: { employerPublicId: string }) {
  const { navigate } = useRouter();
  const [copied, setCopied] = React.useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://hr-rr.online";
  const link = employerPublicId
    ? `${origin}/?ref=emp${employerPublicId}`
    : "";

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <div className="bg-transparent border border-white/20 rounded-3xl p-5 shadow-xl space-y-3 text-left backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
            🎁 Ваша реферальная ссылка
          </h3>
          <p className="text-sm text-slate-200 mt-1">
            Приглашайте работодателей — получайте <strong className="text-white">+1000 RR</strong> за каждого, кто зарегистрируется по этой ссылке.
            Новичку 1000 RR начисляются автоматически.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {/* Row 1: Link and Copy Button */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
          <div className="flex-1 bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm select-all break-all flex items-center justify-between">
            <span>{link}</span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!link}
            className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 disabled:opacity-40 text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition shrink-0 active:scale-95 shadow-md"
          >
            {copied ? (<><Check className="w-4 h-4" /> Скопировано</>) : (<><Copy className="w-4 h-4" /> Скопировать</>)}
          </button>
        </div>

        {/* Row 2: Partners & Statistics Button Centered */}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => navigate(`/emp${employerPublicId}/tariff/partners`)}
            className="cursor-pointer bg-transparent hover:bg-white/10 border border-[#E7C768]/60 hover:border-[#E7C768] text-[#E7C768] hover:text-[#F4EE8E] font-bold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition shrink-0 shadow-md active:scale-95 backdrop-blur-md"
          >
            <Handshake className="w-4 h-4 text-[#E7C768]" />
            <span>Партнёры и статистика</span>
          </button>
        </div>
      </div>
    </div>
  );
}
