import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import JSZip from "jszip";
import {
  Database,
  Server,
  RefreshCw,
  Play,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Activity,
  Layers,
  Table as TableIcon,
  Zap,
  ShieldCheck,
  Search,
  DownloadCloud,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  X,
  Code,
  FileText,
  ArrowLeft,
  UploadCloud,
  FileSpreadsheet,
  FileJson,
  Download,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  SlidersHorizontal,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Archive,
  Key,
  Check,
  Loader2,
  Image as ImageIcon,
  TrendingUp,
  DollarSign,
  Users,
  ExternalLink,
  Percent,
  ArrowUpRight,
} from "lucide-react";
import { ProTalkGallery } from "../components/admin/ProTalkGallery";
import RobokassaAdminCard from "../components/admin/RobokassaAdminCard";
import { ConfirmBalanceChangeModal } from "../components/ConfirmBalanceChangeModal";
import { ConfirmLimitChangeModal } from "../components/ConfirmLimitChangeModal";
import { toast } from "sonner";

interface TableMeta {
  name: string;
  rowCount: number;
  columns: { name: string; type: string; pk: boolean; notnull: boolean }[];
}

interface SystemStatus {
  status: string;
  engine: string;
  superAdmin: boolean;
  tablesCount: number;
  activeCrons: any[];
  activeTriggers: any[];
  uptime: number;
  memory: { rss: number; heapTotal: number; heapUsed: number };
}

export type AdminTab = "tables" | "csv" | "crons" | "gallery" | "analytics";

export const TAB_PATH_MAP: Record<AdminTab, string> = {
  tables: "/system-admin",
  csv: "/system-admin/dump",
  crons: "/system-admin/cron",
  gallery: "/system-admin/gallery",
  analytics: "/system-admin/analytics",
};

export function SystemAdminPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Authentication state - require password entry
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem("sysadmin_password") === "wkL35eTm";
  });
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const DEFAULT_FUNCTIONS_LOG_URL =
    "https://docs.google.com/spreadsheets/d/1HAhAbwKRIXPFi8KhqLhDW6-Ha2tjQf4pj8rrSGPML8A/edit?usp=sharing";

  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const p = window.location.pathname.replace(/\/+$/, "");
    if (p.startsWith("/system-admin/dump")) return "csv";
    if (p.startsWith("/system-admin/cron")) return "crons";
    if (p.startsWith("/system-admin/gallery")) return "gallery";
    if (p.startsWith("/system-admin/analytics")) return "analytics";
    return "tables";
  });

  const [aiAnalytics, setAiAnalytics] = useState<{
    totals: any;
    byType: any[];
    recentLogs: any[];
    financial?: any;
    funnel?: any;
  } | null>(null);
  const [aiPrompts, setAiPrompts] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  const [analyticsSearch, setAnalyticsSearch] = useState("");
  const [promptsSearch, setPromptsSearch] = useState("");

  const fetchAiAnalyticsAndPrompts = async () => {
    setLoadingAnalytics(true);
    try {
      const [anRes, prRes] = await Promise.all([
        fetch(`/api/admin/ai-analytics?pwd=${encodeURIComponent(getAdminPwd())}`, {
          headers: getAdminHeaders(),
        }),
        fetch(`/api/admin/protalk-prompts?pwd=${encodeURIComponent(getAdminPwd())}`, {
          headers: getAdminHeaders(),
        }),
      ]);
      if (anRes.ok) {
        const anData = await anRes.json();
        setAiAnalytics({
          totals: anData.totals || {},
          byType: anData.byType || [],
          recentLogs: anData.recentLogs || [],
          financial: anData.financial || {},
          funnel: anData.funnel || {},
        });
      }
      if (prRes.ok) {
        const prData = await prRes.json();
        if (Array.isArray(prData)) setAiPrompts(prData);
      }
    } catch (e) {
      console.error("Failed to fetch AI analytics/prompts:", e);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleSavePromptLogUrl = async (promptRow: any, nextLogUrl: string) => {
    if (!promptRow) return;
    const pid = promptRow.id || promptRow.prompt_key;
    setSavingPromptId(String(pid));
    try {
      const res = await fetch(`/api/admin/protalk-prompts?pwd=${encodeURIComponent(getAdminPwd())}`, {
        method: "POST",
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: promptRow.id,
          prompt_key: promptRow.prompt_key,
          prompt_name: promptRow.prompt_name,
          bot_id: promptRow.bot_id,
          system_prompt: promptRow.system_prompt,
          user_prompt_template: promptRow.user_prompt_template,
          function_id: promptRow.function_id,
          log_url: nextLogUrl.trim(),
          description: promptRow.description,
          is_active: promptRow.is_active,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          nextLogUrl.trim()
            ? `Ссылка логирования (log_url) для «${promptRow.prompt_key}» сохранена в БД`
            : `Ссылка логирования (log_url) для «${promptRow.prompt_key}» убрана из БД`
        );
        setAiPrompts((prev) =>
          prev.map((p) =>
            p.id === promptRow.id || p.prompt_key === promptRow.prompt_key
              ? { ...p, log_url: nextLogUrl.trim() }
              : p
          )
        );
        if (selectedTable === "protalk_prompts") {
          loadTableRows("protalk_prompts");
        }
      } else {
        toast.error(data.error || "Ошибка сохранения log_url");
      }
    } catch (e: any) {
      toast.error(e.message || "Ошибка сети");
    } finally {
      setSavingPromptId(null);
    }
  };

  useEffect(() => {
    const p = location.pathname.replace(/\/+$/, "");
    if (p.startsWith("/system-admin/dump") && activeTab !== "csv") {
      setActiveTab("csv");
    } else if (p.startsWith("/system-admin/cron") && activeTab !== "crons") {
      setActiveTab("crons");
    } else if (p.startsWith("/system-admin/gallery") && activeTab !== "gallery") {
      setActiveTab("gallery");
    } else if (p.startsWith("/system-admin/analytics") && activeTab !== "analytics") {
      setActiveTab("analytics");
    } else if ((p === "/system-admin" || p === "") && activeTab !== "tables") {
      setActiveTab("tables");
    }
  }, [location.pathname, activeTab]);

  const handleSelectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    navigate(TAB_PATH_MAP[tab]);
  };

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<{ rows: any[]; total: number; schema: any[] }>({
    rows: [],
    total: 0,
    schema: [],
  });
  const [searchFilter, setSearchFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && (activeTab === "analytics" || selectedTable === "protalk_prompts" || selectedTable === "logs")) {
      fetchAiAnalyticsAndPrompts();
    }
  }, [isAuthenticated, activeTab, selectedTable]);

  // Table Enhancements State (Search, Sorting, Pagination, Horizontal Scroll)
  const [tableGlobalSearch, setTableGlobalSearch] = useState("");
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState<number>(1000);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<any>>(new Set());
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableContentRef = useRef<HTMLTableElement | null>(null);

  // CSV / Dump Backup & Import state
  const [csvTargetTable, setCsvTargetTable] = useState<string>("");
  const [csvUploadStatus, setCsvUploadStatus] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const csvFileRef = useRef<HTMLInputElement | null>(null);
  const directTableCsvRef = useRef<HTMLInputElement | null>(null);
  const jsonDumpFileRef = useRef<HTMLInputElement | null>(null);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);

  // Dedicated JSON Restore & Success modals
  const [jsonRestoreModal, setJsonRestoreModal] = useState<{
    fileName: string;
    jsonData: any;
    meta?: any;
    tablesSummary: { name: string; count: number }[];
    totalTables: number;
    totalRows: number;
  } | null>(null);
  const [jsonSuccessModal, setJsonSuccessModal] = useState<{
    totalTables: number;
    details: string;
  } | null>(null);

  // Edit / Add / Delete modal state
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [rowFormData, setRowFormData] = useState<Record<string, string>>({});
  const [rowToDelete, setRowToDelete] = useState<{ id: any; label: string } | null>(null);
  const [cronNoticeModal, setCronNoticeModal] = useState<{ title: string; message: string; isError?: boolean } | null>(null);

  // Telegram Bot & Proxy Gateway state
  const [botToken, setBotToken] = useState("");
  const [maskedToken, setMaskedToken] = useState("");
  const [showBotToken, setShowBotToken] = useState(false);
  const [botUsername, setBotUsername] = useState("@RoboRecrutBot");
  const [proxyType, setProxyType] = useState<"dialog_ai" | "custom_cloudflare" | "direct">("dialog_ai");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://eu1.account.dialog.ai.atiks.org");
  const [adminTelegramId, setAdminTelegramId] = useState("169262990");
  const [isTokenConfigured, setIsTokenConfigured] = useState(false);
  const [isSavingTg, setIsSavingTg] = useState(false);
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false);

  // App Version state (persisted in PostgreSQL BD ProTalk)
  const [appVersion, setAppVersion] = useState("v.2.30");
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [jsonRestoreProgress, setJsonRestoreProgress] = useState<{
    current: number;
    total: number;
    currentTable: string;
  } | null>(null);

  // Inline Cell Editing state
  const [editingCell, setEditingCell] = useState<{ rowId: any; colName: string; value: string } | null>(null);
  const [isSavingCell, setIsSavingCell] = useState(false);

  // Employer Balance & Limits Modals (Transactions based)
  const [employerBalanceModal, setEmployerBalanceModal] = useState<{
    open: boolean;
    row: any;
    currentBalance: number;
    delta: number;
    busy: boolean;
  }>({
    open: false,
    row: null,
    currentBalance: 0,
    delta: 0,
    busy: false,
  });

  const [employerLimitModal, setEmployerLimitModal] = useState<{
    open: boolean;
    row: any;
    field: string;
    label: string;
    currentValue: number;
    newValue: number;
    busy: boolean;
  }>({
    open: false,
    row: null,
    field: "",
    label: "",
    currentValue: 0,
    newValue: 0,
    busy: false,
  });

  const [modalDeltaInput, setModalDeltaInput] = useState<number>(0);

  const handleConfirmEmployerBalanceChange = async (comment: string, type: string) => {
    const { row, delta } = employerBalanceModal;
    if (!row || !delta) return;
    setEmployerBalanceModal((s) => ({ ...s, busy: true }));
    try {
      const res = await fetch("/api/rpc/admin_wallet_adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _employer: row.id || row.public_id,
          _delta: delta,
          _note: comment,
          _type: type,
        }),
      });
      const data = await res.json();
      if (res.ok && (data?.success || data?.ok)) {
        setEmployerBalanceModal({ open: false, row: null, currentBalance: 0, delta: 0, busy: false });
        setModalDeltaInput(0);
        if (selectedTable === "employers") {
          loadTableRows("employers");
        }
        if (editingRow && (editingRow.id === row.id || editingRow.public_id === row.public_id)) {
          const updatedBal = data.new_balance ?? (Number(editingRow.balance || 0) + delta);
          setEditingRow((prev: any) => ({ ...prev, balance: updatedBal }));
          setRowFormData((prev) => ({ ...prev, balance: String(updatedBal) }));
        }
      } else {
        alert(data?.error || "Ошибка изменения баланса");
        setEmployerBalanceModal((s) => ({ ...s, busy: false }));
      }
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
      setEmployerBalanceModal((s) => ({ ...s, busy: false }));
    }
  };

  const handleConfirmEmployerLimitSave = async (comment: string) => {
    const { row, field, newValue } = employerLimitModal;
    if (!row || !field) return;
    setEmployerLimitModal((s) => ({ ...s, busy: true }));
    try {
      const res = await fetch("/api/rpc/admin_employer_set_limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _employer: row.id || row.public_id,
          _field: field,
          _value: newValue,
          _note: comment,
        }),
      });
      const data = await res.json();
      if (res.ok && (data?.success || data?.ok)) {
        setEmployerLimitModal({ open: false, row: null, field: "", label: "", currentValue: 0, newValue: 0, busy: false });
        if (selectedTable === "employers") {
          loadTableRows("employers");
        }
        if (editingRow && (editingRow.id === row.id || editingRow.public_id === row.public_id)) {
          setEditingRow((prev: any) => ({ ...prev, [field]: newValue }));
          setRowFormData((prev) => ({ ...prev, [field]: String(newValue) }));
        }
      } else {
        alert(data?.error || "Ошибка сохранения лимита");
        setEmployerLimitModal((s) => ({ ...s, busy: false }));
      }
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
      setEmployerLimitModal((s) => ({ ...s, busy: false }));
    }
  };

  const getAdminPwd = () => sessionStorage.getItem("sysadmin_password") || "";

  const getAdminHeaders = (extraHeaders: Record<string, string> = {}) => {
    return {
      "x-admin-password": getAdminPwd(),
      ...extraHeaders,
    };
  };

  const fetchBotSettings = async () => {
    try {
      const res = await fetch(`/api/admin/bot-settings?pwd=${encodeURIComponent(getAdminPwd())}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setBotUsername(data.botUsername || "@RoboRecrutBot");
        setProxyType(data.proxyType || "dialog_ai");
        setApiBaseUrl(data.apiBaseUrl || "https://eu1.account.dialog.ai.atiks.org");
        setAdminTelegramId(data.adminTelegramId || "169262990");
        setMaskedToken(data.maskedToken || "");
        setIsTokenConfigured(Boolean(data.isTokenConfigured));
        setBotToken(data.maskedToken || "");
      }
    } catch (e) {
      console.error("Failed to load bot settings:", e);
    }
  };

  const saveBotSettings = async () => {
    setIsSavingTg(true);
    try {
      const res = await fetch(`/api/admin/bot-settings?pwd=${encodeURIComponent(getAdminPwd())}`, {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken,
          botUsername,
          proxyType,
          apiBaseUrl,
          adminTelegramId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCronNoticeModal({
          title: "Настройки Telegram бота",
          message: "Настройки шлюза и токена успешно сохранены в базе данных и зафиксированы на сервере.",
        });
        fetchBotSettings();
      } else {
        setCronNoticeModal({
          title: "Внимание при сохранении",
          message: data.error || "Не удалось сохранить настройки бота.",
          isError: true,
        });
      }
    } catch (e: any) {
      setCronNoticeModal({
        title: "Ошибка сервера",
        message: e.message || "Сетевая ошибка при сохранении",
        isError: true,
      });
    } finally {
      setIsSavingTg(false);
    }
  };

  const fetchAppVersion = async () => {
    try {
      const res = await fetch(`/api/admin/app-version?pwd=${encodeURIComponent(getAdminPwd())}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.version) setAppVersion(String(data.version));
      }
    } catch (e) {
      console.error("Failed to fetch app version:", e);
    }
  };

  const saveAppVersion = async () => {
    const trimmed = appVersion.trim();
    if (!trimmed) {
      toast.error("Укажите версию приложения");
      return;
    }
    setIsSavingVersion(true);
    try {
      const res = await fetch(`/api/admin/app-version?pwd=${encodeURIComponent(getAdminPwd())}`, {
        method: "POST",
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ version: trimmed }),
      });
      const raw = await res.text();
      let data: any = null;
      try { data = JSON.parse(raw); } catch {}
      if (res.ok && data?.success) {
        setAppVersion(data.version || trimmed);
        toast.success(`Версия приложения «${data.version || trimmed}» сохранена на сервере`);
      } else {
        toast.error(data?.error || "Не удалось сохранить версию приложения");
      }
    } catch (e: any) {
      toast.error(e?.message || "Ошибка сети при сохранении версии");
    } finally {
      setIsSavingVersion(false);
    }
  };

  const triggerManualBackup = async () => {
    setIsTriggeringBackup(true);
    try {
      const res = await fetch(`/api/admin/backup/trigger?pwd=${encodeURIComponent(getAdminPwd())}`, {
        method: "POST",
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCronNoticeModal({
          title: "Резервная копия базы создана",
          message: `Слепок базы данных (${data.totalRows} строк, ${data.tablesCount} таблиц) сформирован в файл «${data.filename}» и отправлен администратору в Telegram.`,
        });
        fetchStatus();
      } else {
        setCronNoticeModal({
          title: "Ошибка отправки бэкапа",
          message: data.error || "Не удалось сформировать или отправить файл в Telegram.",
          isError: true,
        });
      }
    } catch (e: any) {
      setCronNoticeModal({
        title: "Сетевая ошибка",
        message: e.message || "Сетевая ошибка при создании резервной копии.",
        isError: true,
      });
    } finally {
      setIsTriggeringBackup(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus();
      fetchTables();
      fetchBotSettings();
      fetchAppVersion();
    }
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoggingIn(true);

    try {
      const res = await fetch("/api/admin/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem("sysadmin_password", passwordInput);
        setIsAuthenticated(true);
      } else {
        setAuthError(data.error || "Неверный пароль администратора.");
      }
    } catch (err: any) {
      if (passwordInput === "wkL35eTm") {
        sessionStorage.setItem("sysadmin_password", passwordInput);
        setIsAuthenticated(true);
      } else {
        setAuthError("Неверный пароль администратора.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("sysadmin_password");
    setIsAuthenticated(false);
    setPasswordInput("");
    setAuthError(null);
  };

  // Sync scroll width for top scrollbar
  useEffect(() => {
    if (tableContentRef.current) {
      setTableScrollWidth(tableContentRef.current.scrollWidth);
    }
  }, [tableData, pageSize, currentPage, tableGlobalSearch, sortColumn, sortDirection]);

  // Sync scrolling between top scroll bar and table container
  const handleTableScroll = () => {
    if (tableContainerRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  };

  const handleTopScroll = () => {
    if (tableContainerRef.current && topScrollRef.current) {
      tableContainerRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const scrollTableHorizontal = (direction: "left" | "right") => {
    if (tableContainerRef.current) {
      const scrollAmount = direction === "left" ? -350 : 350;
      tableContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const triggerDirectDownload = async (url: string, defaultFilename?: string) => {
    const filename = defaultFilename || "database_backup.dat";
    const toastId = toast.loading(`Подготовка файла «${filename}»...`);
    try {
      const res = await fetch(url, { headers: getAdminHeaders() });
      if (!res.ok) {
        let errMsg = `Ошибка HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch {}
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", filename);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 1000);
      toast.dismiss(toastId);
      toast.success(`Файл «${filename}» успешно скачан!`);
    } catch (err: any) {
      toast.dismiss(toastId);
      console.error("Direct download failed:", err);
      toast.error(err.message || "Ошибка при скачивании файла");
    }
  };

  const handleExportCsv = (tableName: string) => {
    triggerDirectDownload(`/api/admin/export-csv/${tableName}?pwd=${encodeURIComponent(getAdminPwd())}`, `${tableName}.csv`);
  };

  const handleExportFullDump = () => {
    triggerDirectDownload(`/api/admin/export-all-dump?pwd=${encodeURIComponent(getAdminPwd())}`, `database_full_dump_${Date.now()}.json`);
  };

  const handleExportSqlDump = () => {
    triggerDirectDownload(`/api/admin/export-sql-dump?pwd=${encodeURIComponent(getAdminPwd())}`, `database_dump_pg_${Date.now()}.sql`);
  };

  const handleExportZipDump = () => {
    triggerDirectDownload(`/api/admin/export-all-zip?pwd=${encodeURIComponent(getAdminPwd())}`, `database_backup_full_${Date.now()}.zip`);
  };

  const handleExportAllCsvZip = () => {
    triggerDirectDownload(`/api/admin/export-all-csv-zip?pwd=${encodeURIComponent(getAdminPwd())}`, `all_tables_csv_${Date.now()}.zip`);
  };

  const safeReadJsonResponse = async (res: Response) => {
    const rawText = await res.text();
    try {
      return { ok: res.ok, status: res.status, data: JSON.parse(rawText), rawText };
    } catch {
      const looksHtml = /^\s*</.test(rawText);
      const errorMsg = looksHtml
        ? `Сервер вернул HTML-ответ (HTTP ${res.status}). Возможно, превышен лимит размера одного запроса или таймаут прокси.`
        : `Некорректный JSON-ответ сервера (HTTP ${res.status}): ${rawText.slice(0, 140)}`;
      return { ok: false, status: res.status, data: { error: errorMsg }, rawText };
    }
  };

  const extractTablesMap = (jsonData: any): Record<string, any[]> | null => {
    if (!jsonData || typeof jsonData !== "object") return null;
    let tables = jsonData.tables || jsonData.data?.tables;
    if (!tables) {
      const keys = Object.keys(jsonData).filter(
        (k) => !["meta", "exportedAt", "tablesCount", "reason", "version", "app", "totalRows"].includes(k)
      );
      if (keys.length > 0 && Array.isArray(jsonData[keys[0]])) {
        tables = {};
        for (const k of keys) {
          if (Array.isArray(jsonData[k])) tables[k] = jsonData[k];
        }
      }
    }
    return tables && typeof tables === "object" ? tables : null;
  };

  const sanitizeRowForUpload = (row: any): any => {
    if (!row || typeof row !== "object") return row;
    if (!("data_json" in row) || row.data_json == null) return row;
    const rawDj = row.data_json;
    if (typeof rawDj === "string") {
      const trimmed = rawDj.trim();
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "data_json" in parsed) {
            const cleanDj = { ...parsed };
            delete cleanDj.data_json;
            return { ...row, data_json: JSON.stringify(cleanDj) };
          }
        } catch {}
      }
      return row;
    }
    if (typeof rawDj === "object" && !Array.isArray(rawDj) && "data_json" in rawDj) {
      const cleanDj = { ...rawDj };
      delete cleanDj.data_json;
      return { ...row, data_json: JSON.stringify(cleanDj) };
    }
    return row;
  };

  const parseCsvClientSide = (csvText: string): { headers: string[]; rows: Record<string, string>[] } => {
    const cleanText = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const firstNewline = cleanText.indexOf("\n");
    const headerLine = firstNewline >= 0 ? cleanText.slice(0, firstNewline) : cleanText;
    let inQ = false, commas = 0, semis = 0;
    for (let i = 0; i < headerLine.length; i++) {
      const ch = headerLine[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ) {
        if (ch === ",") commas++;
        else if (ch === ";") semis++;
      }
    }
    const delimiter = semis > commas ? ";" : ",";
    const records: string[][] = [];
    let currentField = "";
    let inQuotes = false;
    let currentRecord: string[] = [];

    for (let i = 0; i < cleanText.length; i++) {
      const c = cleanText[i];
      const n = cleanText[i + 1];
      if (inQuotes) {
        if (c === '"' && n === '"') {
          currentField += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          currentField += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        currentRecord.push(currentField);
        currentField = "";
      } else if (c === "\n") {
        currentRecord.push(currentField);
        currentField = "";
        if (currentRecord.some((f) => f.length > 0)) records.push(currentRecord);
        currentRecord = [];
      } else {
        currentField += c;
      }
    }
    if (currentField.length > 0 || currentRecord.length > 0) {
      currentRecord.push(currentField);
      if (currentRecord.some((f) => f.length > 0)) records.push(currentRecord);
    }
    if (records.length === 0) return { headers: [], rows: [] };
    const headers = records[0].map((h) => h.trim()).filter(Boolean);
    const rows: Record<string, string>[] = [];
    for (let r = 1; r < records.length; r++) {
      const cells = records[r];
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = cells[idx] !== undefined ? cells[idx] : "";
      });
      rows.push(obj);
    }
    return { headers, rows };
  };

  const resolveCsvTargetTableName = (fileName: string, explicitTable?: string): string => {
    if (explicitTable) return explicitTable.trim();
    const base = fileName.replace(/\.[^/.]+$/, "").toLowerCase().trim();
    const exact = tables.find((t) => t.name.toLowerCase() === base);
    if (exact) return exact.name;
    // Match prefixes like "projects (1)" or "projects_export_2026"
    const sortedKnown = [...tables].sort((a, b) => b.name.length - a.name.length);
    const prefixMatch = sortedKnown.find((t) => {
      const tn = t.name.toLowerCase();
      return base.startsWith(tn) && (base.length === tn.length || /[^a-z0-9_]/.test(base[tn.length]) || base[tn.length] === "_");
    });
    if (prefixMatch) return prefixMatch.name;
    return base.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  };

  const uploadDumpChunked = async (
    jsonData: any,
    options: { mergeMode?: boolean } = {}
  ): Promise<Record<string, number>> => {
    const tablesMap = extractTablesMap(jsonData);
    if (!tablesMap || Object.keys(tablesMap).length === 0) {
      throw new Error("В файле дампа не найдены таблицы для восстановления.");
    }
    const mergeMode = Boolean(options.mergeMode);
    const tableNames = Object.keys(tablesMap).filter((t) => Array.isArray(tablesMap[t]));
    const summary: Record<string, number> = {};
    const total = tableNames.length;
    const MAX_CHUNK_BYTES = 350 * 1024;
    const MAX_CHUNK_ROWS = 100;

    for (let i = 0; i < total; i++) {
      const tableName = tableNames[i];
      const allRows = (tablesMap[tableName] || []).map(sanitizeRowForUpload);
      if (allRows.length === 0) {
        summary[tableName] = 0;
        continue;
      }

      const chunks: any[][] = [];
      let curChunk: any[] = [];
      let curBytes = 0;
      for (const r of allRows) {
        const est = JSON.stringify(r).length;
        if (curChunk.length > 0 && (curChunk.length >= MAX_CHUNK_ROWS || curBytes + est > MAX_CHUNK_BYTES)) {
          chunks.push(curChunk);
          curChunk = [];
          curBytes = 0;
        }
        curChunk.push(r);
        curBytes += est;
      }
      if (curChunk.length > 0) chunks.push(curChunk);

      let importedForTable = 0;
      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunkLabel = chunks.length > 1 ? ` (пакет ${cIdx + 1}/${chunks.length})` : "";
        setJsonRestoreProgress({ current: i + 1, total, currentTable: `${tableName}${chunkLabel}` });
        setCsvUploadStatus(`Восстановление таблицы «${tableName}»${chunkLabel} (${i + 1} из ${total})...`);

        const isLastGlobal = i === total - 1 && cIdx === chunks.length - 1;
        const clearFlag = mergeMode ? false : cIdx === 0;
        const res = await fetch("/api/admin/import-all-dump", {
          method: "POST",
          headers: getAdminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            tableName,
            rows: chunks[cIdx],
            chunkIndex: cIdx,
            clearBeforeInsert: clearFlag,
            upsertOnConflict: mergeMode || !clearFlag,
            finalizeRestore: isLastGlobal,
          }),
        });
        const parsed = await safeReadJsonResponse(res);
        if (!parsed.ok) {
          throw new Error(`Таблица «${tableName}»${chunkLabel}: ${parsed.data?.error || `HTTP ${parsed.status}`}`);
        }
        importedForTable +=
          parsed.data?.summary?.[tableName] !== undefined
            ? Number(parsed.data.summary[tableName])
            : chunks[cIdx].length;
      }
      summary[tableName] = importedForTable;
    }

    return summary;
  };

  const executeSqlRestore = async (sqlText: string) => {
    const toastId = toast.loading("Восстановление базы из SQL-дампа...");
    try {
      // Split large SQL dumps into safe chunks (~250 KB) at statement boundaries outside quotes
      const MAX_SQL_CHUNK = 250 * 1024;
      const chunks: string[] = [];
      if (sqlText.length <= MAX_SQL_CHUNK) {
        chunks.push(sqlText);
      } else {
        let curStart = 0;
        let lastSafeCut = 0;
        let inSingleQuote = false;
        for (let idx = 0; idx < sqlText.length; idx++) {
          const ch = sqlText[idx];
          if (ch === "'") {
            if (inSingleQuote && sqlText[idx + 1] === "'") {
              idx++;
            } else {
              inSingleQuote = !inSingleQuote;
            }
          } else if (!inSingleQuote && ch === ";") {
            const nextCh = sqlText[idx + 1];
            if (!nextCh || nextCh === "\n" || nextCh === "\r") {
              lastSafeCut = idx + 1;
              if (lastSafeCut - curStart >= MAX_SQL_CHUNK) {
                chunks.push(sqlText.slice(curStart, lastSafeCut));
                curStart = lastSafeCut;
              }
            }
          }
        }
        if (curStart < sqlText.length) {
          const rem = sqlText.slice(curStart).trim();
          if (rem) chunks.push(rem);
        }
      }

      let lastMessage = "База данных успешно восстановлена из SQL-дампа!";
      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        setCsvUploadStatus(`Выполнение SQL-дампа: пакет ${cIdx + 1} из ${chunks.length}...`);
        const res = await fetch("/api/admin/import-sql-dump", {
          method: "POST",
          headers: getAdminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ sqlText: chunks[cIdx] }),
        });
        const parsed = await safeReadJsonResponse(res);
        if (!parsed.ok || !parsed.data?.success) {
          toast.dismiss(toastId);
          toast.error(parsed.data?.error || `Ошибка восстановления из SQL (пакет ${cIdx + 1})`);
          setCsvUploadStatus(`Ошибка SQL (пакет ${cIdx + 1}): ${parsed.data?.error || "Ошибка сервера"}`);
          return;
        }
        if (parsed.data?.message) lastMessage = parsed.data.message;
      }

      toast.dismiss(toastId);
      toast.success(lastMessage);
      setCsvUploadStatus(lastMessage);
      fetchTables();
      fetchStatus();
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error(e.message || "Сетевая ошибка при выполнении SQL-дампа");
    }
  };

  const parseAndShowJsonRestore = (jsonData: any, fileName: string) => {
    const tables = extractTablesMap(jsonData);

    if (!tables || typeof tables !== "object") {
      alert("В выбранном файле не найдены данные таблиц базы данных.");
      return;
    }

    const summaryList: { name: string; count: number }[] = [];
    let totalRows = 0;
    for (const t of Object.keys(tables)) {
      if (Array.isArray(tables[t])) {
        summaryList.push({ name: t, count: tables[t].length });
        totalRows += tables[t].length;
      }
    }

    setJsonRestoreModal({
      fileName,
      jsonData,
      meta: jsonData.meta || null,
      tablesSummary: summaryList,
      totalTables: summaryList.length,
      totalRows,
    });
  };

  const handleJsonDumpFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();

    try {
      // 1. Handle ZIP archive
      if (lowerName.endsWith(".zip")) {
        toast.loading("Распаковка ZIP архива...");
        try {
          const zipData = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(zipData);

          let jsonFile: JSZip.JSZipObject | null = null;
          let sqlFile: JSZip.JSZipObject | null = null;

          zip.forEach((relativePath, fileObj) => {
            if (!fileObj.dir) {
              if (relativePath.endsWith(".json") && !relativePath.includes("MANIFEST")) {
                jsonFile = fileObj;
              } else if (relativePath.endsWith(".sql")) {
                sqlFile = fileObj;
              }
            }
          });

          toast.dismiss();

          if (jsonFile) {
            const text = await (jsonFile as JSZip.JSZipObject).async("string");
            const jsonData = JSON.parse(text);
            parseAndShowJsonRestore(jsonData, file.name);
            return;
          } else if (sqlFile) {
            const sqlText = await (sqlFile as JSZip.JSZipObject).async("string");
            if (confirm(`В архиве найден SQL-дамп «${(sqlFile as JSZip.JSZipObject).name}». Выполнить восстановление в базу данных PostgreSQL?`)) {
              await executeSqlRestore(sqlText);
            }
            return;
          } else {
            toast.error("В ZIP-архиве не найден файл .json или .sql с данными базы.");
            return;
          }
        } catch (err: any) {
          toast.dismiss();
          toast.error(`Ошибка распаковки ZIP: ${err.message}`);
          return;
        }
      }

      // 2. Handle SQL script
      if (lowerName.endsWith(".sql")) {
        try {
          const sqlText = await file.text();
          if (confirm(`Вы уверены, что хотите выполнить SQL-дамп из файла «${file.name}» в облачную базу PostgreSQL? Все существующие таблицы будут обновлены.`)) {
            await executeSqlRestore(sqlText);
          }
          return;
        } catch (err: any) {
          toast.error(`Ошибка чтения SQL файла: ${err.message}`);
          return;
        }
      }

      // 3. Handle CSV file if picked here
      if (lowerName.endsWith(".csv")) {
        const targetTbl = resolveCsvTargetTableName(file.name, csvTargetTable);
        if (!targetTbl) {
          toast.error("Укажите целевую таблицу перед загрузкой CSV.");
          return;
        }
        const text = await file.text();
        const { headers, rows } = parseCsvClientSide(text);
        if (headers.length === 0 || rows.length === 0) {
          toast.error("CSV-файл пуст или не содержит данных.");
          return;
        }
        parseAndShowJsonRestore({ tables: { [targetTbl]: rows } }, `${file.name} → ${targetTbl}`);
        return;
      }

      // 4. Handle JSON dump
      try {
        const text = await file.text();
        const jsonData = JSON.parse(text);
        parseAndShowJsonRestore(jsonData, file.name);
      } catch (err: any) {
        alert(`Ошибка чтения файла JSON: ${err.message}`);
      }
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const handleConfirmJsonRestore = async () => {
    if (!jsonRestoreModal) return;
    setIsImportingCsv(true);
    setJsonRestoreProgress(null);
    setCsvUploadStatus(`Восстановление базы данных из "${jsonRestoreModal.fileName}"...`);
    try {
      const summary = await uploadDumpChunked(jsonRestoreModal.jsonData);
      const tableDetails = Object.entries(summary)
        .map(([k, v]) => `${k}: ${v} строк`)
        .join(", ");
      setCsvUploadStatus(`Успех! База данных восстановлена. Загружено: ${tableDetails}`);
      setJsonSuccessModal({
        totalTables: Object.keys(summary).length,
        details: tableDetails,
      });
      setJsonRestoreModal(null);
      fetchTables();
      if (selectedTable) loadTableRows(selectedTable);
    } catch (e: any) {
      toast.error(`Ошибка восстановления базы данных: ${e.message}`);
      setCsvUploadStatus(`Ошибка: ${e.message}`);
    } finally {
      setJsonRestoreProgress(null);
      setIsImportingCsv(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, overrideTable?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith(".zip") || lowerName.endsWith(".sql")) {
      await handleJsonDumpFileSelected(e);
      return;
    }

    const tableToUse = resolveCsvTargetTableName(fileName, overrideTable || csvTargetTable);

    setIsImportingCsv(true);
    setJsonRestoreProgress(null);
    setCsvUploadStatus(`Обработка файла "${fileName}"...`);

    try {
      const text = await file.text();

      if (lowerName.endsWith(".json")) {
        const jsonData = JSON.parse(text);
        const summary = await uploadDumpChunked(jsonData);
        const tableDetails = Object.entries(summary)
          .map(([k, v]) => `${k}: ${v} строк`)
          .join(", ");
        setCsvUploadStatus(`Успех! База данных восстановлена. Загружено: ${tableDetails}`);
        setJsonSuccessModal({
          totalTables: Object.keys(summary).length,
          details: tableDetails,
        });
        fetchTables();
        if (selectedTable) loadTableRows(selectedTable);
      } else {
        if (!tableToUse) {
          setCsvUploadStatus("Ошибка: Укажите имя целевой таблицы для импорта CSV.");
          setIsImportingCsv(false);
          return;
        }

        const { headers, rows } = parseCsvClientSide(text);
        if (headers.length === 0 || rows.length === 0) {
          setCsvUploadStatus("Ошибка импорта CSV: файл пустой или не содержит строк.");
          setIsImportingCsv(false);
          return;
        }

        // Upload CSV rows in safe byte-bounded chunks (upsert mode so existing rows aren't wiped)
        const summary = await uploadDumpChunked({ tables: { [tableToUse]: rows } }, { mergeMode: true });
        const importedCount = summary[tableToUse] ?? rows.length;
        setCsvUploadStatus(`Успешно! Импортировано ${importedCount} из ${rows.length} записей в таблицу "${tableToUse}".`);
        fetchTables();
        if (selectedTable === tableToUse) loadTableRows(tableToUse);
      }
    } catch (err: any) {
      setCsvUploadStatus(`Ошибка импорта файла: ${err.message}`);
    } finally {
      setIsImportingCsv(false);
      setJsonRestoreProgress(null);
      if (e.target) e.target.value = "";
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/admin/status?pwd=${encodeURIComponent(getAdminPwd())}`, {
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch (e: any) {
      console.error("Status fetch error:", e);
    }
  };

  const fetchTables = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tables?pwd=${encodeURIComponent(getAdminPwd())}`, {
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.tables) {
        setTables(data.tables);
        if (data.tables.length > 0 && !selectedTable) {
          loadTableRows(data.tables[0].name);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTableRows = async (tableName: string) => {
    setSelectedTable(tableName);
    setLoading(true);
    setError(null);
    setTableGlobalSearch("");
    setCurrentPage(1);
    setSortColumn(null);
    setSortDirection(null);
    setSelectedRowIds(new Set());
    try {
      const res = await fetch(`/api/admin/table/${tableName}?limit=5000&pwd=${encodeURIComponent(getAdminPwd())}`, {
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setTableData(data);
      } else {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectRow = (rowId: any) => {
    if (rowId === undefined || rowId === null) return;
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleSelectAllPaginated = (rows: any[]) => {
    const pkCol = tableData.schema.find((col) => col.pk === 1)?.name || "id";
    const allSelected = rows.length > 0 && rows.every((r) => {
      const id = r[pkCol] ?? r.id ?? r.public_id;
      return selectedRowIds.has(id);
    });

    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        rows.forEach((r) => {
          const id = r[pkCol] ?? r.id ?? r.public_id;
          if (id !== undefined && id !== null) next.delete(id);
        });
      } else {
        rows.forEach((r) => {
          const id = r[pkCol] ?? r.id ?? r.public_id;
          if (id !== undefined && id !== null) next.add(id);
        });
      }
      return next;
    });
  };

  const handleExecuteBatchDelete = () => {
    if (!selectedTable || selectedRowIds.size === 0) return;
    setShowBatchDeleteModal(true);
  };

  const executeBatchDelete = async () => {
    if (!selectedTable || selectedRowIds.size === 0) return;
    setShowBatchDeleteModal(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/table/${selectedTable}/delete-batch?pwd=${encodeURIComponent(getAdminPwd())}`, {
        method: "POST",
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids: Array.from(selectedRowIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedRowIds(new Set());
        loadTableRows(selectedTable);
        fetchTables();
      } else {
        setError(`Ошибка массового удаления: ${data.error || "Неизвестная ошибка"}`);
      }
    } catch (e: any) {
      setError(`Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRow = (id: any, label?: string) => {
    if (!selectedTable || id === undefined || id === null) return;
    setRowToDelete({ id, label: label || String(id) });
  };

  const executeDeleteRow = async () => {
    if (!selectedTable || !rowToDelete) return;
    const idToDelete = rowToDelete.id;
    setRowToDelete(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/table/${selectedTable}/${encodeURIComponent(idToDelete)}?pwd=${encodeURIComponent(getAdminPwd())}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        loadTableRows(selectedTable);
        fetchTables();
      } else {
        setError(`Ошибка удаления: ${data.error || "Неизвестная ошибка"}`);
      }
    } catch (e: any) {
      setError(`Ошибка: ${e.message}`);
    }
  };

  const openAddModal = () => {
    if (!selectedTable) return;
    const initialForm: Record<string, string> = {};
    tableData.schema.forEach((col) => {
      if (col.name === "id") {
        initialForm[col.name] = `id_${Date.now()}`;
      } else if (selectedTable === "companies" && col.name === "logo_url") {
        initialForm[col.name] = "/files/11/rr-logo.png";
      } else {
        initialForm[col.name] = "";
      }
    });
    setRowFormData(initialForm);
    setIsAddingNew(true);
  };

  const openEditModal = (row: any) => {
    const form: Record<string, string> = {};
    Object.keys(row).forEach((k) => {
      form[k] = typeof row[k] === "object" ? JSON.stringify(row[k]) : String(row[k] ?? "");
    });
    setEditingRow(row);
    setRowFormData(form);
  };

  const handleSaveRow = async () => {
    if (!selectedTable) return;
    setLoading(true);
    setError(null);
    try {
      const parsedData: Record<string, any> = {};
      Object.keys(rowFormData).forEach((k) => {
        const val = rowFormData[k];
        if (val.trim().startsWith("{") || val.trim().startsWith("[")) {
          try {
            parsedData[k] = JSON.parse(val);
          } catch {
            parsedData[k] = val;
          }
        } else {
          parsedData[k] = val;
        }
      });

      if (selectedTable === "companies" && (!parsedData.logo_url || !String(parsedData.logo_url).trim())) {
        parsedData.logo_url = "/files/11/rr-logo.png";
      }

      let res;
      if (isAddingNew) {
        res = await fetch(`/api/admin/table/${selectedTable}?pwd=${encodeURIComponent(getAdminPwd())}`, {
          method: "POST",
          headers: getAdminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(parsedData),
        });
      } else {
        const pkCol = tableData.schema.find((col) => col.pk === 1)?.name || "id";
        const id = editingRow?.[pkCol] ?? editingRow?.id ?? editingRow?.public_id;
        res = await fetch(`/api/admin/table/${selectedTable}/${encodeURIComponent(id)}?pwd=${encodeURIComponent(getAdminPwd())}`, {
          method: "PUT",
          headers: getAdminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(parsedData),
        });
      }

      const data = await res.json();
      if (res.ok) {
        setIsAddingNew(false);
        setEditingRow(null);
        loadTableRows(selectedTable);
        fetchTables();
      } else {
        setError(`Ошибка сохранения: ${data.error}`);
      }
    } catch (e: any) {
      setError(`Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInlineCell = async (rowId: any, colName: string, newValue: any) => {
    if (!selectedTable || rowId === undefined || rowId === null) return;
    setIsSavingCell(true);
    try {
      let parsedVal = newValue;
      if (typeof newValue === "string" && (newValue.trim().startsWith("{") || newValue.trim().startsWith("["))) {
        try {
          parsedVal = JSON.parse(newValue);
        } catch {}
      }

      const res = await fetch(
        `/api/admin/table/${selectedTable}/${encodeURIComponent(rowId)}?pwd=${encodeURIComponent(getAdminPwd())}`,
        {
          method: "PUT",
          headers: getAdminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ [colName]: parsedVal }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setTableData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rows: prev.rows.map((r) => {
              const pkCol = prev.schema.find((col) => col.pk === 1)?.name || "id";
              const id = r[pkCol] ?? r.id ?? r.public_id;
              if (String(id) === String(rowId)) {
                return { ...r, [colName]: parsedVal };
              }
              return r;
            }),
          };
        });
        setEditingCell(null);
      } else {
        setError(`Ошибка сохранения ячейки: ${data.error || "Неизвестная ошибка"}`);
      }
    } catch (e: any) {
      setError(`Ошибка: ${e.message}`);
    } finally {
      setIsSavingCell(false);
    }
  };

  const runCronTask = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/cron/run/${id}?pwd=${encodeURIComponent(getAdminPwd())}`, {
        method: "POST",
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setCronNoticeModal({ title: "Выполнение Cron задачи", message: data.message || "Задача успешно выполнена." });
        fetchStatus();
      } else {
        setCronNoticeModal({ title: "Ошибка выполнения Cron", message: data.error || "Не удалось выполнить задачу.", isError: true });
      }
    } catch (e: any) {
      setCronNoticeModal({ title: "Ошибка сервера", message: `Ошибка выполнения cron: ${e.message}`, isError: true });
    }
  };

  // Header click handler for sorting
  const handleHeaderSort = (colName: string) => {
    if (sortColumn !== colName) {
      setSortColumn(colName);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortColumn(null);
      setSortDirection(null);
    }
  };

  // Filtered & Sorted Rows Calculation
  const filteredRows = tableData.rows.filter((row) => {
    if (!tableGlobalSearch.trim()) return true;
    const query = tableGlobalSearch.toLowerCase().trim();
    return Object.values(row).some((val) => {
      if (val === null || val === undefined) return false;
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      return str.toLowerCase().includes(query);
    });
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortColumn || !sortDirection) return 0;
    const valA = a[sortColumn];
    const valB = b[sortColumn];

    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    let cmp = 0;
    if (typeof valA === "number" && typeof valB === "number") {
      cmp = valA - valB;
    } else {
      cmp = String(valA).localeCompare(String(valB), "ru", { numeric: true, sensitivity: "base" });
    }
    return sortDirection === "asc" ? cmp : -cmp;
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedRows = sortedRows.slice(startIndex, startIndex + pageSize);

  const filteredTables = tables.filter((t) => t.name.toLowerCase().includes(searchFilter.toLowerCase()));

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-transparent text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-[#E7C768] selection:text-[#17344F]">
        <div className="bg-[#1E4468]/60 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#E7C768]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[#265582] border-2 border-[#E7C768]/50 flex items-center justify-center text-[#E7C768] mb-4 shadow-xl">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Системная Панель Администратора
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              Доступ ограничен. Введите системный пароль доступа.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Пароль доступа</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Введите пароль..."
                  required
                  className="w-full bg-[#0F2338]/80 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-transparent backdrop-blur-md border border-white/40 text-white text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#E7C768]" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-sm shadow-lg hover:brightness-110 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              <span>{isLoggingIn ? "Проверка пароля..." : "Войти в систему"}</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/10 text-center">
            <button
              onClick={() => navigate("/admin")}
              className="text-xs text-slate-300 hover:text-[#E7C768] transition flex items-center justify-center gap-1.5 mx-auto"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Вернуться в обычную Админ-панель
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col font-sans selection:bg-[#E7C768] selection:text-[#17344F]">
      {/* Top Navigation Bar */}
      <header className="border-b border-white/10 bg-[#132A40]/60 px-6 py-4 flex items-center justify-between sticky top-0 z-20 backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#265582]/60 border border-[#E7C768]/40 flex items-center justify-center text-[#E7C768] shadow-inner">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
              Системная панель администратора{" "}
              <span className="text-xs px-2.5 py-0.5 rounded-xl bg-transparent text-[#F5D67A] border border-[#E7C768]/40 font-mono">
                BD ProTalk (PostgreSQL)
              </span>
            </h1>
            <p className="text-sm text-slate-300">Защищено паролем & Полнофункциональный редактор БД</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          {/* Hidden multi-format backup file input (JSON, SQL, ZIP, CSV) */}
          <input
            type="file"
            ref={jsonDumpFileRef}
            accept=".json,.sql,.zip,.csv"
            className="hidden"
            onChange={handleJsonDumpFileSelected}
          />

          {/* Consolidated Backup Download Dropdown Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setBackupMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] text-sm font-bold shadow-md hover:brightness-110 transition active:scale-95 cursor-pointer whitespace-nowrap"
              title="Выбрать формат для скачивания резервной копии базы данных"
            >
              <Download className="w-4 h-4 shrink-0 stroke-[2.5]" />
              <span>Скачать бэкап</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${backupMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {backupMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setBackupMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#132A40]/95 backdrop-blur-xl border border-[#E7C768]/40 shadow-2xl z-40 p-1.5 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => { setBackupMenuOpen(false); handleExportFullDump(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-left text-sm font-medium text-white transition cursor-pointer"
                  >
                    <FileJson className="w-4 h-4 text-[#E7C768] shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-sm">JSON дамп (.json)</span>
                      <span className="text-xs text-slate-300">Полный снимок всех таблиц базы данных</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setBackupMenuOpen(false); handleExportSqlDump(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-left text-sm font-medium text-white transition cursor-pointer"
                  >
                    <Code className="w-4 h-4 text-[#E7C768] shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-sm">SQL дамп (.sql)</span>
                      <span className="text-xs text-slate-300">PostgreSQL DDL + команды INSERT</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setBackupMenuOpen(false); handleExportZipDump(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-left text-sm font-medium text-white transition cursor-pointer"
                  >
                    <Archive className="w-4 h-4 text-[#E7C768] shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-sm">Полный ZIP (.zip)</span>
                      <span className="text-xs text-slate-300">SQL + JSON + манифест архива</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setBackupMenuOpen(false); handleExportAllCsvZip(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-left text-sm font-medium text-white transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#E7C768] shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-sm">CSV архив (.zip)</span>
                      <span className="text-xs text-slate-300">Все таблицы в виде CSV файлов</span>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Smart Unified Restore button (auto-detects .json, .sql, .zip, .csv) */}
          <button
            type="button"
            onClick={() => jsonDumpFileRef.current?.click()}
            disabled={isImportingCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-transparent hover:bg-white/10 text-white text-sm font-bold border border-[#E7C768]/60 transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap backdrop-blur-sm"
            title="Восстановить базу данных из файла (.json, .sql, .zip, .csv). Формат определяется автоматически"
          >
            <UploadCloud className="w-4 h-4 text-[#E7C768] shrink-0" />
            <span>{isImportingCsv ? "Восстановление..." : "Восстановить базу данных"}</span>
          </button>

          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#265582] hover:bg-[#1E4468] text-sm font-semibold text-white border border-white/15 transition-all shadow-md active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-[#E7C768]" /> В админ-панель
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-transparent hover:bg-white/10 text-sm font-semibold text-white border border-white/20 transition-all shadow-md active:scale-95"
            title="Выйти из системной панели"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Выйти</span>
          </button>

          <button
            onClick={() => {
              fetchStatus();
              fetchTables();
              if (selectedTable) loadTableRows(selectedTable);
            }}
            className="p-2 rounded-xl bg-[#265582] hover:bg-[#1E4468] text-[#E7C768] border border-white/15 transition-all shadow-md active:scale-95"
            title="Обновить данные"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tabs Navigation Row */}
      <div className="border-b border-white/10 bg-[#17344F]/40 backdrop-blur-md px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => handleSelectTab("tables")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === "tables"
              ? "bg-[#E7C768] text-[#17344F] shadow-lg shadow-[#E7C768]/20"
              : "text-slate-200 hover:text-white hover:bg-[#1E4468]/70 border border-transparent"
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Таблицы базы данных ({tables.length})</span>
        </button>

        <button
          onClick={() => handleSelectTab("csv")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === "csv"
              ? "bg-[#E7C768] text-[#17344F] shadow-lg shadow-[#E7C768]/20"
              : "text-slate-200 hover:text-white hover:bg-[#1E4468]/70 border border-transparent"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Экспорт / Импорт CSV и Дампов</span>
        </button>

        <button
          onClick={() => handleSelectTab("crons")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === "crons"
              ? "bg-[#E7C768] text-[#17344F] shadow-lg shadow-[#E7C768]/20"
              : "text-slate-200 hover:text-white hover:bg-[#1E4468]/70 border border-transparent"
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Кроны & Триггеры</span>
        </button>

        <button
          onClick={() => handleSelectTab("gallery")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === "gallery"
              ? "bg-[#E7C768] text-[#17344F] shadow-lg shadow-[#E7C768]/20"
              : "text-slate-200 hover:text-white hover:bg-[#1E4468]/70 border border-transparent"
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Галерея файлов</span>
        </button>

        <button
          onClick={() => handleSelectTab("analytics")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === "analytics"
              ? "bg-[#E7C768] text-[#17344F] shadow-lg shadow-[#E7C768]/20"
              : "text-slate-200 hover:text-white hover:bg-[#1E4468]/70 border border-transparent"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Аналитика ИИ и Логов</span>
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        {activeTab === "analytics" && (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-1">
            {/* Header & Refresh */}
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
              <div>
                <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                  Аналитика ИИ, финансов и воронки работодателей
                </h2>
                <p className="text-sm text-slate-300 mt-1">
                  Сводка расходов на нейросети (таблица logs), платежи Робокассы и транзакции, конверсии по воронке работодателей и единая таблица ссылок логирования
                </p>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("tables");
                    navigate("/system-admin");
                    loadTableRows("logs");
                  }}
                  className="px-4 py-2 rounded-xl bg-transparent border border-white/20 hover:border-[#E7C768] text-white text-sm font-semibold transition cursor-pointer"
                >
                  Открыть таблицу logs в редакторе
                </button>
                <button
                  type="button"
                  onClick={fetchAiAnalyticsAndPrompts}
                  disabled={loadingAnalytics}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold flex items-center gap-2 shadow-md hover:brightness-110 transition cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingAnalytics ? "animate-spin" : ""}`} />
                  <span>Обновить аналитику</span>
                </button>
              </div>
            </div>

            {/* 1. Financial Analytics & Cost-Benefit (Robokassa + Transactions vs AI Costs) */}
            {(() => {
              const t = aiAnalytics?.totals || {};
              const fin = aiAnalytics?.financial || {};
              const totalReqs = Number(t.total_requests || 0);
              const tokensTotalSum = Number(t.tokens_total_sum || 0);
              const costRubSum = Number(t.cost_rub_sum || fin.total_ai_cost_rub || 0);
              const totalRevenueRub = Number(fin.total_revenue_rub || fin.robokassa_paid_sum || 0);
              const netProfitRub = totalRevenueRub - costRubSum;
              const marginPercent = totalRevenueRub > 0 ? Math.round(((totalRevenueRub - costRubSum) / totalRevenueRub) * 100) : 0;

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-[#E7C768]" />
                      <span>Финансовая аналитика и себестоимость (Выручка vs Расходы на ИИ)</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 shadow-xl">
                      <div className="text-sm text-slate-300 font-medium">Выручка с оплат Робокассы</div>
                      <div className="text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-mono mt-1.5">
                        {Number(fin.robokassa_paid_sum || 0).toLocaleString("ru-RU")} ₽
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        Оплачено: {Number(fin.robokassa_paid_count || 0)} из {Number(fin.robokassa_all_count || 0)} попыток
                      </div>
                    </div>

                    <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 shadow-xl">
                      <div className="text-sm text-slate-300 font-medium">Себестоимость ИИ (расход logs)</div>
                      <div className="text-2xl font-bold text-white font-mono mt-1.5">
                        {costRubSum.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        Всего токенов: {tokensTotalSum.toLocaleString("ru-RU")} ({totalReqs.toLocaleString("ru-RU")} запросов)
                      </div>
                    </div>

                    <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 shadow-xl">
                      <div className="text-sm text-slate-300 font-medium">Чистая прибыль (Выручка — ИИ)</div>
                      <div className="text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-mono mt-1.5">
                        {netProfitRub.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        Маржинальность: {marginPercent}%
                      </div>
                    </div>

                    <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/60 rounded-3xl p-5 shadow-xl">
                      <div className="text-sm text-[#E7C768] font-semibold">Балансовые транзакции</div>
                      <div className="text-2xl font-bold text-white font-mono mt-1.5">
                        {Number(fin.transactions_deposits_rub || 0).toLocaleString("ru-RU")} ₽
                      </div>
                      <div className="text-sm text-slate-300 mt-1">
                        Всего транзакций в БД: {Number(fin.transactions_count || 0)}
                      </div>
                    </div>
                  </div>

                  {/* Recent Payments Preview */}
                  {Array.isArray(fin.recent_payments) && fin.recent_payments.length > 0 && (
                    <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 space-y-3 shadow-xl">
                      <h4 className="text-sm font-bold text-[#E7C768]">
                        Последние платежи из таблицы payments_robokassa
                      </h4>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-white/15 text-[#E7C768]">
                              <th className="p-2.5 font-bold">Инвойс / ID</th>
                              <th className="p-2.5 font-bold">Работодатель</th>
                              <th className="p-2.5 font-bold text-right">Сумма, ₽</th>
                              <th className="p-2.5 font-bold">Статус</th>
                              <th className="p-2.5 font-bold">Описание</th>
                              <th className="p-2.5 font-bold text-right">Дата</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10">
                            {fin.recent_payments.map((p: any) => (
                              <tr key={p.id} className="hover:bg-white/5 transition">
                                <td className="p-2.5 font-mono text-white text-sm">#{p.inv_id || p.id}</td>
                                <td className="p-2.5 text-sm">
                                  <div className="text-white font-medium">{p.employer_name || p.employer_id}</div>
                                  <div className="text-slate-400 font-mono text-sm">{p.employer_email || ""}</div>
                                </td>
                                <td className="p-2.5 text-right font-mono text-[#E7C768] font-bold text-sm">
                                  {Number(p.amount_rub || 0).toLocaleString("ru-RU")} ₽
                                </td>
                                <td className="p-2.5 text-sm">
                                  <span className={`px-2.5 py-1 rounded-lg border text-sm font-mono ${
                                    ["success", "paid", "1"].includes(String(p.status).toLowerCase())
                                      ? "border-[#E7C768]/60 text-[#E7C768] bg-[#E7C768]/10"
                                      : "border-white/20 text-slate-300"
                                  }`}>
                                    {["success", "paid", "1"].includes(String(p.status).toLowerCase()) ? "Оплачен" : (p.status || "В обработке")}
                                  </span>
                                </td>
                                <td className="p-2.5 text-slate-300 text-sm max-w-[240px] truncate">{p.description || "—"}</td>
                                <td className="p-2.5 text-right text-slate-400 font-mono text-sm">{p.created_at || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Robokassa Settings & Docs Card */}
                  <RobokassaAdminCard />
                </div>
              );
            })()}

            {/* 2. Employer Funnel & Conversion Analytics */}
            {(() => {
              const fn = aiAnalytics?.funnel || {};
              const totalEmp = Number(fn.total_employers || 0);
              const withComp = Number(fn.with_company || 0);
              const withVac = Number(fn.with_vacancy || 0);
              const withCand = Number(fn.with_candidates || 0);
              const withPay = Number(fn.with_payments || 0);

              const steps = [
                {
                  label: "1. Регистрация",
                  desc: "Все работодатели в базе",
                  count: totalEmp,
                  convNext: fn.conv_reg_to_company ?? 0,
                  nextLabel: "Создали компанию",
                },
                {
                  label: "2. Создали компанию",
                  desc: "Заполнили профиль бренда",
                  count: withComp,
                  convNext: fn.conv_company_to_vacancy ?? 0,
                  nextLabel: "Создали вакансию",
                },
                {
                  label: "3. Создали вакансию",
                  desc: "Проекты и должности",
                  count: withVac,
                  convNext: fn.conv_vacancy_to_candidates ?? 0,
                  nextLabel: "Получили кандидатов",
                },
                {
                  label: "4. Получили кандидатов",
                  desc: "Отклики и собеседования",
                  count: withCand,
                  convNext: fn.conv_candidates_to_payment ?? 0,
                  nextLabel: "Совершили оплату",
                },
                {
                  label: "5. Оплатили услуги",
                  desc: "Успешные платежи Робокассы",
                  count: withPay,
                  convNext: null,
                  nextLabel: null,
                },
              ];

              return (
                <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/15 pb-3">
                    <div>
                      <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                        <Users className="w-5 h-5 text-[#E7C768]" />
                        <span>Воронка конверсий работодателей</span>
                      </h3>
                      <p className="text-sm text-slate-300 mt-0.5">
                        Анализ движения пользователей от регистрации до оплаты услуг сервиса
                      </p>
                    </div>
                    <div className="text-sm font-mono text-[#E7C768] bg-[#E7C768]/10 border border-[#E7C768]/40 px-3 py-1.5 rounded-xl font-bold">
                      Общая конверсия в оплату: {fn.conv_overall ?? 0}%
                    </div>
                  </div>

                  {/* 5 Funnel Stages */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {steps.map((st, idx) => (
                      <div
                        key={idx}
                        className="bg-transparent backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{st.label}</div>
                          <div className="text-sm text-slate-400 mt-0.5">{st.desc}</div>
                        </div>

                        <div>
                          <div className="text-2xl font-extrabold text-[#E7C768] font-mono">
                            {st.count.toLocaleString("ru-RU")}
                          </div>
                          <div className="text-sm text-slate-300 mt-0.5">
                            {totalEmp > 0 ? `${Math.round((st.count / totalEmp) * 100)}% от базы` : "—"}
                          </div>
                        </div>

                        {st.convNext !== null && (
                          <div className="pt-2 border-t border-white/10 text-sm">
                            <span className="text-slate-400">Переход в след. этап:</span>{" "}
                            <span className="text-[#E7C768] font-bold font-mono">
                              {st.convNext}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Plans & Sources breakdown tags */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="p-3.5 rounded-2xl border border-white/10 space-y-2">
                      <div className="text-sm font-semibold text-slate-300">Распределение работодателей по тарифам:</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {(fn.plans || []).map((pl: any, i: number) => (
                          <span key={i} className="px-3 py-1 rounded-xl border border-white/15 text-sm text-white font-mono">
                            {pl.plan || "free"}: <strong className="text-[#E7C768]">{pl.count}</strong>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl border border-white/10 space-y-2">
                      <div className="text-sm font-semibold text-slate-300">Источники регистрации:</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {(fn.sources || []).map((sc: any, i: number) => (
                          <span key={i} className="px-3 py-1 rounded-xl border border-white/15 text-sm text-white font-mono">
                            {sc.source || "direct"}: <strong className="text-[#E7C768]">{sc.count}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 3. Unified Google Sheets Logging Table (log_url) */}
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3">
                <div>
                  <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                    Единая таблица ссылок логирования функций в Google Таблицы (log_url)
                  </h3>
                  <p className="text-sm text-slate-300 mt-0.5">
                    Управление ссылками на Google Таблицы логирования для системных промптов и функций нейросетей
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="relative min-w-[220px]">
                    <Search className="w-4 h-4 text-[#E7C768] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={promptsSearch}
                      onChange={(e) => setPromptsSearch(e.target.value)}
                      placeholder="Поиск промпта или функции..."
                      className="w-full bg-transparent border border-white/20 rounded-xl pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("tables");
                      navigate("/system-admin");
                      loadTableRows("protalk_prompts");
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-transparent border border-white/20 hover:border-[#E7C768] text-white text-sm font-semibold transition cursor-pointer"
                  >
                    Таблица protalk_prompts
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/15 text-[#E7C768]">
                      <th className="p-3 font-bold">Промпт / Ключ</th>
                      <th className="p-3 font-bold">Назначение / Функция</th>
                      <th className="p-3 font-bold min-w-[340px]">Ссылка на Google Таблицу (log_url)</th>
                      <th className="p-3 font-bold text-center">Статус</th>
                      <th className="p-3 font-bold text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {aiPrompts
                      .filter((p) => {
                        if (!promptsSearch.trim()) return true;
                        const q = promptsSearch.toLowerCase();
                        return [p.prompt_key, p.prompt_name, p.function_id, p.log_url, p.description].some(
                          (v) => v && String(v).toLowerCase().includes(q)
                        );
                      })
                      .map((p) => {
                        const currentLogUrl = p.log_url !== undefined && p.log_url !== null ? String(p.log_url) : "";
                        const isSavingThis = savingPromptId === String(p.id || p.prompt_key);
                        return (
                          <tr key={p.id || p.prompt_key} className="hover:bg-white/5 transition">
                            <td className="p-3 font-mono text-sm whitespace-nowrap">
                              <div className="text-[#E7C768] font-bold">{p.prompt_key}</div>
                              {p.function_id && (
                                <span className="inline-block mt-1 px-2 py-0.5 rounded-md border border-[#E7C768]/40 text-[#E7C768] text-sm font-mono">
                                  Функция #{p.function_id}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-sm">
                              <div className="text-white font-medium">{p.prompt_name || "—"}</div>
                              {p.description && (
                                <div className="text-slate-400 text-sm mt-0.5 max-w-[280px] truncate">{p.description}</div>
                              )}
                            </td>
                            <td className="p-3 text-sm">
                              <input
                                type="text"
                                value={currentLogUrl}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAiPrompts((prev) =>
                                    prev.map((item) =>
                                      item.id === p.id ? { ...item, log_url: val } : item
                                    )
                                  );
                                }}
                                placeholder="https://docs.google.com/spreadsheets/d/... (или оставьте пустым)"
                                className="w-full bg-transparent border border-white/20 rounded-xl px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#E7C768]"
                              />
                            </td>
                            <td className="p-3 text-center whitespace-nowrap text-sm">
                              <span className={`px-2.5 py-1 rounded-lg border text-sm font-mono ${
                                currentLogUrl
                                  ? "border-[#E7C768]/60 text-[#E7C768] bg-[#E7C768]/10"
                                  : "border-white/20 text-slate-400"
                              }`}>
                                {currentLogUrl ? "Активна" : "Не задана"}
                              </span>
                            </td>
                            <td className="p-3 text-right whitespace-nowrap text-sm">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={isSavingThis}
                                  onClick={() => handleSavePromptLogUrl(p, currentLogUrl)}
                                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm hover:brightness-110 transition cursor-pointer"
                                >
                                  {isSavingThis ? "..." : "Сохранить"}
                                </button>
                                {currentLogUrl && (
                                  <button
                                    type="button"
                                    disabled={isSavingThis}
                                    onClick={() => handleSavePromptLogUrl(p, "")}
                                    className="px-2.5 py-1.5 rounded-xl bg-transparent border border-white/20 hover:border-[#E7C768] text-white text-sm transition cursor-pointer"
                                    title="Очистить ссылку"
                                  >
                                    Убрать
                                  </button>
                                )}
                                {currentLogUrl !== DEFAULT_FUNCTIONS_LOG_URL && (
                                  <button
                                    type="button"
                                    disabled={isSavingThis}
                                    onClick={() => handleSavePromptLogUrl(p, DEFAULT_FUNCTIONS_LOG_URL)}
                                    className="px-2.5 py-1.5 rounded-xl bg-transparent border border-white/20 hover:border-[#E7C768] text-[#E7C768] text-sm transition cursor-pointer"
                                    title="Подставить стандартную таблицу"
                                  >
                                    По умолчанию
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Breakdown by Request Type / Channel / LLM */}
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 space-y-4 shadow-xl">
              <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Детализация расхода по типам запросов и функциям
              </h3>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/15 text-[#E7C768]">
                      <th className="p-3 font-bold">Тип запроса / Канал (channel_name)</th>
                      <th className="p-3 font-bold">Модель / Функция (llm)</th>
                      <th className="p-3 font-bold">ID бота</th>
                      <th className="p-3 font-bold text-right">Запросов</th>
                      <th className="p-3 font-bold text-right">Токены вход</th>
                      <th className="p-3 font-bold text-right">Токены выход</th>
                      <th className="p-3 font-bold text-right">Всего токенов</th>
                      <th className="p-3 font-bold text-right">Расход, ₽</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(aiAnalytics?.byType || []).map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 transition">
                        <td className="p-3 font-mono text-white font-semibold">{row.channel_name}</td>
                        <td className="p-3 font-mono text-slate-300">{row.llm}</td>
                        <td className="p-3 font-mono text-slate-300">{row.bot_id}</td>
                        <td className="p-3 text-right font-mono text-white">{Number(row.requests_count || 0).toLocaleString("ru-RU")}</td>
                        <td className="p-3 text-right font-mono text-slate-300">{Number(row.tokens_in_sum || 0).toLocaleString("ru-RU")}</td>
                        <td className="p-3 text-right font-mono text-slate-300">{Number(row.tokens_out_sum || 0).toLocaleString("ru-RU")}</td>
                        <td className="p-3 text-right font-mono text-[#E7C768] font-bold">{Number(row.tokens_total_sum || 0).toLocaleString("ru-RU")}</td>
                        <td className="p-3 text-right font-mono text-[#F4EE8E] font-bold">
                          {Number(row.cost_rub_sum || (Number(row.tokens_total_sum || 0) * 0.00003)).toLocaleString("ru-RU", {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                          })}{" "}
                          ₽
                        </td>
                      </tr>
                    ))}
                    {(!aiAnalytics?.byType || aiAnalytics.byType.length === 0) && (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-300 text-sm">
                          Нет данных в таблице logs
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Recent Logs Table with Search */}
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                  Последние запросы в нейросеть и функции ({aiAnalytics?.recentLogs?.length || 0})
                </h3>
                <div className="relative min-w-[260px]">
                  <Search className="w-4 h-4 text-[#E7C768] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={analyticsSearch}
                    onChange={(e) => setAnalyticsSearch(e.target.value)}
                    placeholder="Поиск по типу, сообщению, параметрам, log_url..."
                    className="w-full bg-transparent border border-white/20 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768]"
                  />
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar max-h-[540px]">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="sticky top-0 bg-[#17344F] border-b border-white/15 text-[#E7C768]">
                    <tr>
                      <th className="p-3">ID / Дата</th>
                      <th className="p-3">Канал / Тип</th>
                      <th className="p-3">Бот / Модель</th>
                      <th className="p-3">Запрос / Параметры функции</th>
                      <th className="p-3">Ответ ИИ / Функции</th>
                      <th className="p-3 text-right">Вход / Выход</th>
                      <th className="p-3 text-right">Всего токенов</th>
                      <th className="p-3 text-right">Расход, ₽</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(aiAnalytics?.recentLogs || [])
                      .filter((r) => {
                        if (!analyticsSearch.trim()) return true;
                        const q = analyticsSearch.toLowerCase();
                        return [
                          r.channel_id,
                          r.channel_name,
                          r.llm,
                          r.bot_id,
                          r.user_message,
                          r.bot_reply,
                          r.function_call_params,
                        ].some((v) => v && String(v).toLowerCase().includes(q));
                      })
                      .map((r) => {
                        const tokIn = Number(r.tokens_in_source || 0);
                        const tokOut = Number(r.tokens_out_source || 0);
                        const tokTot = Number(r.tokens_total || (tokIn + tokOut) || 0);
                        const rub = Number(r.cost_rub || (tokTot * 0.00003) || 0);
                        return (
                          <tr key={r.id} className="hover:bg-white/5 transition align-top">
                            <td className="p-3 font-mono text-slate-300 whitespace-nowrap">
                              <div className="text-white font-bold">#{r.id}</div>
                              <div className="text-sm text-slate-400">{r.created_at || "—"}</div>
                            </td>
                            <td className="p-3 font-mono">
                              <div className="text-[#E7C768] font-semibold">{r.channel_name || "—"}</div>
                              <div className="text-sm text-slate-300">{r.channel_id || "—"}</div>
                            </td>
                            <td className="p-3 font-mono text-white">
                              <div>Бот: {r.bot_id || "—"}</div>
                              <div className="text-slate-300">{r.llm || "—"}</div>
                            </td>
                            <td className="p-3 max-w-[320px]">
                              <div className="line-clamp-2 text-white break-words">{r.user_message || "—"}</div>
                              {r.function_call_params && (
                                <div className="mt-1 text-sm font-mono text-[#E7C768] line-clamp-2 break-all">
                                  {String(r.function_call_params)}
                                </div>
                              )}
                            </td>
                            <td className="p-3 max-w-[320px]">
                              <div className="line-clamp-3 text-slate-200 break-words">{r.bot_reply || r.ai_reply || "—"}</div>
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300 whitespace-nowrap">
                              {tokIn.toLocaleString("ru-RU")} / {tokOut.toLocaleString("ru-RU")}
                            </td>
                            <td className="p-3 text-right font-mono text-[#E7C768] font-bold whitespace-nowrap">
                              {tokTot.toLocaleString("ru-RU")}
                            </td>
                            <td className="p-3 text-right font-mono text-[#F4EE8E] font-bold whitespace-nowrap">
                              {rub.toLocaleString("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ₽
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeTab === "gallery" && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <ProTalkGallery />
          </div>
        )}
        {activeTab === "tables" && (
          <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
            {/* Sidebar Table List */}
            <div className="col-span-3 bg-[#1E4468]/60 backdrop-blur-xl border border-white/15 rounded-3xl p-4 flex flex-col overflow-hidden shadow-xl">
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Поиск таблицы..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-[#0F2338]/80 border border-white/15 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {filteredTables.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => loadTableRows(t.name)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all ${
                      selectedTable === t.name
                        ? "bg-[#E7C768] text-[#17344F] font-extrabold shadow-md"
                        : "text-slate-200 hover:bg-[#265582]/60 border border-transparent"
                    }`}
                  >
                    <span className="truncate flex items-center gap-2">
                      <TableIcon className={`w-3.5 h-3.5 shrink-0 ${selectedTable === t.name ? "text-[#17344F]" : "text-sky-300"}`} />
                      {t.name}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-mono font-bold ${
                      selectedTable === t.name ? "bg-[#17344F]/20 text-[#17344F]" : "bg-[#132A40] text-amber-300"
                    }`}>
                      {t.rowCount}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Table Viewer */}
            <div className="col-span-9 bg-[#1E4468]/60 backdrop-blur-xl border border-white/15 rounded-3xl p-5 flex flex-col overflow-hidden shadow-xl">
              {selectedTable ? (
                <>
                  {/* Table Header & Primary Actions */}
                  <div className="flex flex-wrap items-center justify-between pb-3.5 border-b border-white/10 mb-3.5 gap-3">
                    <div>
                      <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                        <span>Таблица: <code className="text-[#E7C768] font-mono">{selectedTable}</code></span>
                        <span className="text-xs font-semibold text-slate-300">({tableData.total} всего)</span>
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExportCsv(selectedTable)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#265582] hover:bg-[#1E4468] text-white text-xs font-semibold border border-white/15 transition-all shadow-md active:scale-95"
                        title="Скачать эту таблицу в формате CSV"
                      >
                        <Download className="w-3.5 h-3.5 text-[#E7C768]" />
                        <span>Экспорт CSV</span>
                      </button>

                      <input
                        type="file"
                        ref={directTableCsvRef}
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e, selectedTable)}
                      />
                      <button
                        onClick={() => directTableCsvRef.current?.click()}
                        disabled={isImportingCsv}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-transparent backdrop-blur-md hover:border-[#E7C768] text-white text-sm font-semibold border border-white/20 transition-all shadow-md active:scale-95"
                        title="Загрузить CSV файл в эту таблицу"
                      >
                        <UploadCloud className="w-4 h-4 text-[#E7C768]" />
                        <span>Импорт CSV</span>
                      </button>

                      <button
                        onClick={openAddModal}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                        <span>Добавить запись</span>
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="mb-3.5 p-3 rounded-xl bg-transparent border border-[#E7C768]/50 text-white text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-[#E7C768]" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Summary Totals Bar when viewing logs table */}
                  {selectedTable === "logs" && (
                    <div className="mb-3.5 p-4 rounded-2xl border border-[#E7C768]/40 bg-transparent backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
                      {(() => {
                        const sumIn = filteredRows.reduce((acc, r) => acc + (Number(r.tokens_in_source) || 0), 0);
                        const sumOut = filteredRows.reduce((acc, r) => acc + (Number(r.tokens_out_source) || 0), 0);
                        const sumTot = filteredRows.reduce(
                          (acc, r) => acc + (Number(r.tokens_total) || ((Number(r.tokens_in_source) || 0) + (Number(r.tokens_out_source) || 0))),
                          0
                        );
                        const sumRub = filteredRows.reduce(
                          (acc, r) => acc + (r.cost_rub !== undefined && r.cost_rub !== null && Number(r.cost_rub) > 0 ? Number(r.cost_rub) : ((Number(r.tokens_total) || 0) * 0.00003)),
                          0
                        );
                        return (
                          <>
                            <div className="flex flex-wrap items-center gap-6">
                              <div>
                                <div className="text-sm text-slate-300">Записей в выборке</div>
                                <div className="text-lg font-bold text-white font-mono">{filteredRows.length.toLocaleString("ru-RU")}</div>
                              </div>
                              <div>
                                <div className="text-sm text-slate-300">Токены вход / выход</div>
                                <div className="text-lg font-bold text-[#E7C768] font-mono">
                                  {sumIn.toLocaleString("ru-RU")} / {sumOut.toLocaleString("ru-RU")}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-slate-300">Сумма токенов (tokens_total)</div>
                                <div className="text-lg font-bold text-[#E7C768] font-mono">{sumTot.toLocaleString("ru-RU")}</div>
                              </div>
                              <div>
                                <div className="text-sm text-[#E7C768] font-semibold">Сумма расхода (cost_rub)</div>
                                <div className="text-lg font-bold text-[#F4EE8E] font-mono">
                                  {sumRub.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₽
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("analytics");
                                navigate("/system-admin/analytics");
                              }}
                              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-md hover:brightness-110 transition cursor-pointer"
                            >
                              Открыть подстраницу аналитики ИИ
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Quick Function log_url Banner when viewing protalk_prompts table */}
                  {selectedTable === "protalk_prompts" && (
                    <div className="mb-3.5 p-4 rounded-2xl border border-[#E7C768]/40 bg-transparent backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-[#E7C768]">
                          Поле log_url (ссылка на таблицу логирования для функций)
                        </div>
                        <div className="text-sm text-slate-300">
                          Нажмите «Редактировать» (карандаш) у любого промпта, чтобы изменить или убрать ссылку логирования <code className="text-[#E7C768] font-mono">log_url</code> отдельным полем, или перейдите на подстраницу «Аналитика ИИ и Логов».
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("analytics");
                          navigate("/system-admin/analytics");
                        }}
                        className="px-4 py-2 rounded-xl bg-transparent border border-[#E7C768] text-[#E7C768] hover:bg-white/5 text-sm font-bold transition cursor-pointer shrink-0"
                      >
                        Управление log_url и Аналитика
                      </button>
                    </div>
                  )}

                  {/* Filter & Table Navigation Controls Toolbar */}
                  <div className="bg-[#132A40]/60 backdrop-blur-md p-3 rounded-2xl border border-white/10 mb-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Global Table Search (Ctrl+F equivalent) */}
                      <div className="flex-1 min-w-[260px] relative">
                        <Search className="w-4 h-4 text-[#E7C768] absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="Поиск по всем полям таблицы..."
                          value={tableGlobalSearch}
                          onChange={(e) => {
                            setTableGlobalSearch(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full bg-[#0F2338]/80 border border-white/15 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition-colors"
                        />
                        {tableGlobalSearch && (
                          <button
                            onClick={() => {
                              setTableGlobalSearch("");
                              setCurrentPage(1);
                            }}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Pagination Size Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-300 font-medium">Строк на стр.:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="bg-[#0F2338]/80 border border-white/15 rounded-xl px-2.5 py-1 text-xs text-[#E7C768] font-bold focus:outline-none focus:border-[#E7C768] cursor-pointer"
                        >
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={300}>300</option>
                          <option value={1000}>1000</option>
                        </select>
                      </div>

                      {/* Horizontal Scrolling Arrows Above Table */}
                      <div className="flex items-center gap-1.5 bg-[#0F2338]/80 px-2 py-1 rounded-xl border border-white/10">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono mr-1 hidden sm:inline">
                          Прокрутка:
                        </span>
                        <button
                          onClick={() => scrollTableHorizontal("left")}
                          className="p-1 rounded-lg bg-[#265582] hover:bg-[#1E4468] text-white transition-colors"
                          title="Прокрутить влево"
                        >
                          <ChevronLeft className="w-4 h-4 text-[#E7C768]" />
                        </button>
                        <button
                          onClick={() => scrollTableHorizontal("right")}
                          className="p-1 rounded-lg bg-[#265582] hover:bg-[#1E4468] text-white transition-colors"
                          title="Прокрутить вправо"
                        >
                          <ChevronRight className="w-4 h-4 text-[#E7C768]" />
                        </button>
                      </div>
                    </div>

                    {/* Stats & Pagination Navigation Row */}
                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-300 pt-1 border-t border-white/5 gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm">
                          Найдено: <strong className="text-[#E7C768] font-mono">{filteredRows.length}</strong> из {tableData.rows.length} строк
                        </span>
                        {selectedRowIds.size > 0 && (
                          <button
                            onClick={handleExecuteBatchDelete}
                            disabled={loading}
                            className="bg-transparent backdrop-blur-md border border-[#E7C768] text-[#E7C768] hover:text-white font-bold text-sm px-3 py-1 rounded-xl shadow transition-all flex items-center gap-1.5 animate-pulse cursor-pointer"
                            title="Удалить все выбранные галочками строки из базы данных"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Удалить выбранные ({selectedRowIds.size})</span>
                          </button>
                        )}
                        {sortColumn && (
                          <span className="bg-transparent backdrop-blur-md text-[#E7C768] text-sm px-2.5 py-0.5 rounded-md font-mono border border-white/20 flex items-center gap-1">
                            <span>Сортировка: {sortColumn} ({sortDirection === "asc" ? "▲ по возр." : "▼ по убыв."})</span>
                            <button
                              onClick={() => {
                                setSortColumn(null);
                                setSortDirection(null);
                              }}
                              className="hover:text-white ml-1"
                              title="Сбросить сортировку"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                      </div>

                      {/* Page Navigation Controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={safeCurrentPage <= 1}
                          className="p-1 rounded bg-[#265582] hover:bg-[#1E4468] disabled:opacity-40 text-white transition-colors"
                          title="Первая страница"
                        >
                          <ChevronsLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                          disabled={safeCurrentPage <= 1}
                          className="p-1 rounded bg-[#265582] hover:bg-[#1E4468] disabled:opacity-40 text-white transition-colors"
                          title="Предыдущая страница"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs px-2 font-mono text-[#E7C768] font-bold">
                          Стр. {safeCurrentPage} из {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                          disabled={safeCurrentPage >= totalPages}
                          className="p-1 rounded bg-[#265582] hover:bg-[#1E4468] disabled:opacity-40 text-white transition-colors"
                          title="Следующая страница"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={safeCurrentPage >= totalPages}
                          className="p-1 rounded bg-[#265582] hover:bg-[#1E4468] disabled:opacity-40 text-white transition-colors"
                          title="Последняя страница"
                        >
                          <ChevronsRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Top Horizontal Scrollbar (Synced) */}
                  <div
                    ref={topScrollRef}
                    onScroll={handleTopScroll}
                    className="overflow-x-auto custom-scrollbar h-3 bg-[#0F2338]/60 backdrop-blur-md rounded-t-xl border-x border-t border-white/10"
                  >
                    <div style={{ width: `${tableScrollWidth}px`, height: "1px" }} />
                  </div>

                  {/* Table Data Grid Container */}
                  <div
                    ref={tableContainerRef}
                    onScroll={handleTableScroll}
                    className="flex-1 overflow-auto border border-white/10 rounded-b-xl bg-[#0F2338]/60 backdrop-blur-md custom-scrollbar"
                  >
                    {loading ? (
                      <div className="p-12 text-center text-slate-300 text-xs font-mono">Загрузка записей базы данных...</div>
                    ) : paginatedRows.length === 0 ? (
                      <div className="p-12 text-center text-slate-300 text-xs">
                        {tableGlobalSearch
                          ? "По вашему запросу ничего не найдено. Попробуйте изменить поисковую фразу."
                          : "Таблица пуста. Нажмите «Добавить запись», чтобы создать первую строку."}
                      </div>
                    ) : (
                      <table ref={tableContentRef} className="w-full text-left text-xs border-collapse min-w-max">
                        <thead>
                          <tr className="bg-[#17344F] text-slate-200 sticky top-0 border-b border-white/15 z-10 shadow-sm">
                            <th className="p-3 w-28 text-center border-r border-white/10 bg-[#17344F]">
                              <div className="flex items-center justify-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={
                                    paginatedRows.length > 0 &&
                                    paginatedRows.every((r) => {
                                      const pkCol = tableData.schema.find((col) => col.pk === 1)?.name || "id";
                                      const id = r[pkCol] ?? r.id ?? r.public_id;
                                      return selectedRowIds.has(id);
                                    })
                                  }
                                  onChange={() => toggleSelectAllPaginated(paginatedRows)}
                                  className="w-4 h-4 rounded border-slate-600 bg-[#0F2338] text-[#E7C768] focus:ring-0 cursor-pointer"
                                  title="Выбрать все видимые строки"
                                />
                                <span>Действия</span>
                              </div>
                            </th>
                            {tableData.schema.map((col) => {
                              const isSorted = sortColumn === col.name;
                              return (
                                <th
                                  key={col.name}
                                  onClick={() => handleHeaderSort(col.name)}
                                  className="p-3 border-r border-white/10 whitespace-nowrap font-bold text-white cursor-pointer hover:bg-[#265582] transition-colors select-none group"
                                  title={`Нажмите для сортировки по ${col.name}`}
                                >
                                  <div className="flex items-center gap-1.5 justify-between">
                                    <span>
                                      {col.name}{" "}
                                      <span className="text-[10px] text-slate-400 font-normal">({col.type})</span>
                                    </span>
                                    <span className="text-[#E7C768]">
                                      {isSorted ? (
                                        sortDirection === "asc" ? (
                                          <ArrowUp className="w-3.5 h-3.5 text-[#E7C768]" />
                                        ) : (
                                          <ArrowDown className="w-3.5 h-3.5 text-[#E7C768]" />
                                        )
                                      ) : (
                                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity" />
                                      )}
                                    </span>
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {paginatedRows.map((row, idx) => {
                            const pkCol = tableData.schema.find((col) => col.pk === 1)?.name || "id";
                            const rowId = row[pkCol] ?? row.id ?? row.public_id;
                            const rowLabel = row.title || row.name || row.question || row.trigger_name || row.task_name || String(rowId ?? "");

                            return (
                              <tr
                                key={rowId || idx}
                                className={`transition-colors ${
                                  selectedRowIds.has(rowId)
                                    ? "bg-[#265582]/70 border-l-2 border-[#E7C768]"
                                    : "hover:bg-[#265582]/40"
                                }`}
                              >
                                <td className="p-2 border-r border-white/10 text-center whitespace-nowrap bg-[#0F2338]/80">
                                  <div className="flex items-center justify-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedRowIds.has(rowId)}
                                      onChange={() => toggleSelectRow(rowId)}
                                      className="w-4 h-4 rounded border-slate-600 bg-[#0F2338] text-[#E7C768] focus:ring-0 cursor-pointer"
                                      title="Выбрать строку для отметки/удаления"
                                    />
                                    <button
                                      onClick={() => openEditModal(row)}
                                      className="p-1.5 text-sky-300 hover:bg-[#265582] rounded-lg transition-colors"
                                      title="Редактировать"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    {rowId !== undefined && rowId !== null && (
                                      <button
                                        onClick={() => handleDeleteRow(rowId, String(rowLabel))}
                                        className="p-1.5 text-slate-300 hover:text-[#E7C768] border border-transparent hover:border-white/20 rounded-lg transition-colors"
                                        title="Удалить строку"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {tableData.schema.map((col) => {
                                  const val = row[col.name];
                                  const strVal = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
                                  const isEditing = editingCell?.rowId === rowId && editingCell?.colName === col.name;

                                  if (isEditing && editingCell) {
                                    const cellVal = editingCell.value;
                                    const isLongText = strVal.length > 50 || col.type === "TEXT" || ["content", "text", "description", "json", "body", "answers", "prompt", "vacancy_text", "customWiki", "content_md"].includes(col.name);
                                    const isBool = ["enabled", "is_active", "is_published", "is_basic"].includes(col.name) || col.name.startsWith("is_");

                                    return (
                                      <td key={col.name} className="p-2 border-r border-white/5 bg-[#17344F] min-w-[220px]">
                                        <div className="flex flex-col gap-1.5">
                                          {isBool ? (
                                            <select
                                              autoFocus
                                              value={cellVal === "1" || cellVal === "true" ? "1" : "0"}
                                              onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
                                              className="w-full bg-[#0F2338] border border-[#E7C768] rounded px-2 py-1 text-xs text-white"
                                            >
                                              <option value="1">1 (True / Да)</option>
                                              <option value="0">0 (False / Нет)</option>
                                            </select>
                                          ) : isLongText ? (
                                            <textarea
                                              autoFocus
                                              rows={4}
                                              value={cellVal}
                                              onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter" && e.ctrlKey) {
                                                  e.preventDefault();
                                                  handleSaveInlineCell(rowId, col.name, cellVal);
                                                }
                                                if (e.key === "Escape") setEditingCell(null);
                                              }}
                                              className="w-full bg-[#0F2338] border border-[#E7C768] rounded p-2 text-xs font-mono text-white resize-y"
                                              placeholder="Ctrl+Enter сохранить, Esc отмена"
                                            />
                                          ) : (
                                            <input
                                              autoFocus
                                              type="text"
                                              value={cellVal}
                                              onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  handleSaveInlineCell(rowId, col.name, cellVal);
                                                }
                                                if (e.key === "Escape") setEditingCell(null);
                                              }}
                                              className="w-full bg-[#0F2338] border border-[#E7C768] rounded px-2 py-1 text-xs font-mono text-white"
                                            />
                                          )}

                                          <div className="flex items-center gap-1 justify-end">
                                            <button
                                              type="button"
                                              onClick={() => handleSaveInlineCell(rowId, col.name, cellVal)}
                                              disabled={isSavingCell}
                                              className="px-2 py-0.5 rounded bg-[#E7C768] text-[#17344F] font-bold text-[10px] flex items-center gap-1 hover:bg-[#F4EE8E] disabled:opacity-50"
                                              title="Сохранить изменения (Enter)"
                                            >
                                              {isSavingCell ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                              <span>Сохранить</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingCell(null)}
                                              className="px-2 py-0.5 rounded bg-white/10 text-slate-300 hover:bg-white/20 text-[10px]"
                                              title="Отмена (Esc)"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  }

                                  return (
                                    <td
                                      key={col.name}
                                      onClick={() => {
                                        if (selectedTable === "employers" && (col.name === "balance" || col.name.startsWith("balance_"))) {
                                          setEmployerBalanceModal({
                                            open: true,
                                            row,
                                            currentBalance: Number(row.balance || 0),
                                            delta: 0,
                                            busy: false,
                                          });
                                          return;
                                        }
                                        setEditingCell({ rowId, colName: col.name, value: strVal });
                                      }}
                                      className="p-3 border-r border-white/5 text-slate-200 font-mono text-sm max-w-xs truncate cursor-pointer hover:bg-[#E7C768]/15 hover:text-white transition-colors group relative"
                                      title={selectedTable === "employers" && (col.name === "balance" || col.name.startsWith("balance_")) ? "Кликните для изменения баланса через транзакцию" : `Кликните для редактирования ячейки "${col.name}"`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="truncate">{strVal || <span className="text-slate-500 italic">пусто</span>}</span>
                                        <Edit2 className="w-3.5 h-3.5 text-[#E7C768] opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-300 text-xs">
                  Выберите таблицу слева для просмотра данных
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "csv" && (
          <div className="flex-1 bg-[#1E4468]/60 backdrop-blur-xl border border-white/15 rounded-3xl p-6 overflow-y-auto space-y-6 shadow-xl custom-scrollbar">
            <div>
              <h2 className="text-base font-extrabold text-white mb-1 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#E7C768]" />
                Резервное копирование и Ручной Перенос Данных (CSV / JSON)
              </h2>
              <p className="text-xs text-slate-300">
                Экспортируйте данные в файлы CSV или сделайте полный дамп базы данных в JSON для сохранения или переезда.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#132A40] p-5 rounded-2xl border border-[#E7C768]/40 space-y-3 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#E7C768]/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Archive className="w-5 h-5 text-[#E7C768]" />
                  <span>Массовый Экспорт в CSV (.zip)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Скачайте единый ZIP-архив, содержащий отдельные файлы CSV для всех {tables.length} таблиц вашей базы данных.
                </p>
                <button
                  onClick={handleExportAllCsvZip}
                  className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-extrabold text-xs shadow-md hover:brightness-110 transition flex items-center justify-center gap-2 active:scale-95"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Экспорт Всех Таблиц в CSV (ZIP)</span>
                </button>
              </div>

              <div className="bg-transparent backdrop-blur-md p-5 rounded-2xl border border-white/20 space-y-3">
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  <FileJson className="w-5 h-5 text-[#E7C768]" />
                  <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Выгрузка базы данных в JSON</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Полный снимок всех {tables.length} таблиц базы данных PostgreSQL ProTalk в одном структурированном файле JSON.
                </p>
                <button
                  onClick={handleExportFullDump}
                  className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-sm shadow-md hover:brightness-110 transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Скачать дамп БД (.json)</span>
                </button>
              </div>

              <div className="bg-transparent backdrop-blur-md p-5 rounded-2xl border border-white/20 space-y-3">
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  <Code className="w-5 h-5 text-[#E7C768]" />
                  <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Выгрузка SQL-дампа (.sql)</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Стандартный PostgreSQL SQL-скрипт с инструкциями INSERT, готовый к развертыванию в любую СУБД PostgreSQL.
                </p>
                <button
                  onClick={handleExportSqlDump}
                  className="w-full px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/10 text-white border border-[#E7C768]/70 font-bold text-sm shadow-md transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  <Code className="w-4 h-4 text-[#E7C768]" />
                  <span>Скачать SQL-дамп (.sql)</span>
                </button>
              </div>

              <div className="bg-transparent backdrop-blur-md p-5 rounded-2xl border border-white/20 space-y-3">
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  <Archive className="w-5 h-5 text-[#E7C768]" />
                  <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Полный архив бэкапа (.zip)</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Универсальный сжатый архив: содержит SQL-дамп, JSON-снимок и текстовый манифест со статистикой строк.
                </p>
                <button
                  onClick={handleExportZipDump}
                  className="w-full px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/10 text-white border border-white/20 font-bold text-sm shadow-md transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  <Archive className="w-4 h-4 text-[#E7C768]" />
                  <span>Скачать архив (.zip)</span>
                </button>
              </div>

              <div className="bg-transparent backdrop-blur-md p-5 rounded-2xl border border-white/20 space-y-3">
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  <UploadCloud className="w-5 h-5 text-[#E7C768]" />
                  <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Восстановление базы данных</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Восстановление всех таблиц из файла <b>.json</b>, <b>.sql</b> или <b>.zip</b> архива (включая ежедневные бэкапы из Telegram).
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => jsonDumpFileRef.current?.click()}
                    disabled={isImportingCsv}
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] text-sm font-bold transition flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                    <span>Выбрать файл для восстановления (.json, .sql, .zip)...</span>
                  </button>

                  <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
                    <span className="text-xs text-slate-400">Импорт отдельного CSV файла в таблицу:</span>
                    <select
                      value={csvTargetTable}
                      onChange={(e) => setCsvTargetTable(e.target.value)}
                      className="w-full bg-transparent border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                    >
                      <option value="" className="bg-[#17344F] text-white">-- Автовыбор таблицы по имени файла --</option>
                      {tables.map((t) => (
                        <option key={t.name} value={t.name} className="bg-[#17344F] text-white">
                          Таблица: {t.name} ({t.rowCount} строк)
                        </option>
                      ))}
                    </select>

                    <input
                      type="file"
                      ref={csvFileRef}
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e)}
                    />

                    <button
                      onClick={() => csvFileRef.current?.click()}
                      disabled={isImportingCsv}
                      className="w-full px-4 py-2 rounded-xl bg-transparent hover:bg-white/10 text-white border border-white/20 text-sm font-semibold transition flex items-center justify-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>Выбрать CSV файл...</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {csvUploadStatus && (
              <div className={`p-4 rounded-2xl text-sm flex items-center gap-2.5 border bg-transparent backdrop-blur-md ${
                csvUploadStatus.includes("Ошибка")
                  ? "border-white/40 text-white"
                  : "border-[#E7C768]/50 text-[#E7C768]"
              }`}>
                {csvUploadStatus.includes("Ошибка") ? (
                  <AlertCircle className="w-5 h-5 shrink-0 text-white" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-[#E7C768]" />
                )}
                <span>{csvUploadStatus}</span>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-200 tracking-wider">
                Экспорт / Импорт CSV по таблицам ({tables.length})
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tables.map((t) => (
                  <div key={t.name} className="bg-transparent backdrop-blur-xl p-4 rounded-2xl border border-white/15 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white font-mono flex items-center gap-2 truncate">
                        <TableIcon className="w-4 h-4 text-[#E7C768] shrink-0" />
                        <span className="truncate">{t.name}</span>
                      </div>
                      <div className="text-sm text-slate-300 mt-1">
                        {t.rowCount} строк | Поля: {t.columns.map((c) => c.name).slice(0, 3).join(", ")}{t.columns.length > 3 ? "..." : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleExportCsv(t.name)}
                        className="px-3 py-1.5 rounded-xl bg-transparent hover:border-[#E7C768] border border-white/20 text-[#E7C768] text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Скачать эту таблицу в формате CSV"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV</span>
                      </button>

                      <button
                        onClick={() => {
                          setCsvTargetTable(t.name);
                          csvFileRef.current?.click();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-transparent hover:border-[#E7C768] border border-white/20 text-white text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Загрузить CSV в эту таблицу"
                      >
                        <UploadCloud className="w-3.5 h-3.5 text-[#E7C768]" />
                        <span>Импорт</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "crons" && (
          <div className="flex-1 bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 overflow-y-auto space-y-6 shadow-2xl custom-scrollbar">
            <div>
              <h2 className="text-lg font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mb-1.5 flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-[#E7C768]" />
                <span>Настройки платформы, версия, Telegram и планировщик бэкапов</span>
              </h2>
              <p className="text-sm text-slate-200 leading-relaxed">
                Управление версией приложения в подвалах и дампах бэкапов, безопасное хранение токенов в базе данных ProTalk PostgreSQL и ежедневное резервное копирование в 06:00 MSK.
              </p>
            </div>

            {/* App Version Card */}
            <div className="bg-transparent backdrop-blur-2xl p-6 rounded-2xl border border-white/20 space-y-4 shadow-xl">
              <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <Code className="w-5 h-5 text-[#E7C768]" />
                  <h3 className="text-base font-bold text-white">
                    Версия приложения (подвалы и бэкапы)
                  </h3>
                </div>
                <span className="text-sm px-3 py-1 rounded-xl border border-[#E7C768]/40 font-mono text-[#E7C768] backdrop-blur-md">
                  Текущая: {appVersion}
                </span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Указанная версия автоматически отображается в подвалах публичных страниц лендинга и подставляется в имена и описания дампов резервных копий в Telegram.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  value={appVersion}
                  onChange={(e) => setAppVersion(e.target.value)}
                  placeholder="v.2.29"
                  className="w-full sm:max-w-xs px-4 py-2.5 rounded-xl bg-transparent border border-white/25 text-white text-sm font-mono focus:border-[#E7C768] outline-none backdrop-blur-md"
                />
                <button
                  type="button"
                  onClick={saveAppVersion}
                  disabled={isSavingVersion}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] text-sm font-bold shadow-lg hover:opacity-90 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingVersion ? <Loader2 className="w-4 h-4 animate-spin text-[#17344F]" /> : <Check className="w-4 h-4 text-[#17344F]" />}
                  <span>Сохранить версию</span>
                </button>
              </div>
            </div>

            {/* Telegram Bot & Gateway Settings Card */}
            <div className="bg-transparent backdrop-blur-2xl p-6 rounded-2xl border border-white/20 space-y-5 shadow-xl">
              <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-5 h-5 text-[#E7C768]" />
                  <h3 className="text-base font-bold text-white">
                    Шлюз отправки и токен Telegram бота
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-300">Статус токена:</span>
                  <span className="text-sm px-2.5 py-0.5 rounded-lg border border-white/20 font-medium text-[#E7C768] backdrop-blur-md">
                    {isTokenConfigured ? "Токен настроен" : "Не настроен"}
                  </span>
                </div>
              </div>

              {/* Gateway Selection */}
              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-slate-200 block">
                  Выбор шлюза (Proxy Gateway)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProxyType("dialog_ai");
                      setApiBaseUrl("https://eu1.account.dialog.ai.atiks.org");
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
                      proxyType === "dialog_ai"
                        ? "border-[#E7C768] bg-transparent shadow-lg shadow-[#E7C768]/10"
                        : "border-white/15 bg-transparent hover:border-white/40"
                    }`}
                  >
                    <div className="text-sm font-bold text-white flex items-center justify-between">
                      <span>Европейский шлюз (Dialog AI)</span>
                      {proxyType === "dialog_ai" && <Check className="w-4 h-4 text-[#E7C768]" />}
                    </div>
                    <div className="text-sm text-slate-300 mt-1 font-mono break-all">
                      eu1.account.dialog.ai.atiks.org
                    </div>
                    <div className="text-sm text-[#E7C768] mt-1.5 font-medium">
                      Рекомендуется: устойчив к блокировкам
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProxyType("custom_cloudflare");
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
                      proxyType === "custom_cloudflare"
                        ? "border-[#E7C768] bg-transparent shadow-lg shadow-[#E7C768]/10"
                        : "border-white/15 bg-transparent hover:border-white/40"
                    }`}
                  >
                    <div className="text-sm font-bold text-white flex items-center justify-between">
                      <span>Собственный Cloudflare Worker</span>
                      {proxyType === "custom_cloudflare" && <Check className="w-4 h-4 text-[#E7C768]" />}
                    </div>
                    <div className="text-sm text-slate-300 mt-1">
                      Пользовательский reverse-proxy
                    </div>
                    <div className="text-sm text-slate-300 mt-1.5 font-medium">
                      Ввод индивидуального адреса
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProxyType("direct");
                      setApiBaseUrl("https://api.telegram.org");
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
                      proxyType === "direct"
                        ? "border-[#E7C768] bg-transparent shadow-lg shadow-[#E7C768]/10"
                        : "border-white/15 bg-transparent hover:border-white/40"
                    }`}
                  >
                    <div className="text-sm font-bold text-white flex items-center justify-between">
                      <span>Прямое подключение</span>
                      {proxyType === "direct" && <Check className="w-4 h-4 text-[#E7C768]" />}
                    </div>
                    <div className="text-sm text-slate-300 mt-1 font-mono">
                      api.telegram.org
                    </div>
                    <div className="text-sm text-slate-300 mt-1.5 font-medium">
                      Без использования сторонних прокси
                    </div>
                  </button>
                </div>

                {proxyType === "custom_cloudflare" && (
                  <div className="mt-3 space-y-1.5">
                    <label className="text-sm font-semibold text-slate-200 block">
                      Адрес собственного прокси (URL)
                    </label>
                    <input
                      type="text"
                      value={apiBaseUrl}
                      onChange={(e) => setApiBaseUrl(e.target.value)}
                      placeholder="https://telegram-proxy.example.workers.dev"
                      className="w-full px-4 py-2.5 rounded-xl bg-transparent border border-white/20 text-white text-sm focus:border-[#E7C768] outline-none backdrop-blur-md"
                    />
                  </div>
                )}
              </div>

              {/* Bot Token and Username */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-200 block">
                    Токен Telegram бота
                  </label>
                  <div className="relative">
                    <input
                      type={showBotToken ? "text" : "password"}
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="8969850170:AAEQLiyXNTJvoXCXElzmCndGjnC-e9t00mQ"
                      className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-transparent border border-white/20 text-white text-sm font-mono focus:border-[#E7C768] outline-none backdrop-blur-md"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBotToken(!showBotToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white cursor-pointer"
                    >
                      {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-sm text-slate-300">
                    Токен сохраняется в зашифрованном хранилище базы данных ProTalk. Если не меняете — оставьте как есть.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-200 block">
                    Юзернейм бота
                  </label>
                  <input
                    type="text"
                    value={botUsername}
                    onChange={(e) => setBotUsername(e.target.value)}
                    placeholder="@RoboRecrutBot"
                    className="w-full px-4 py-2.5 rounded-xl bg-transparent border border-white/20 text-white text-sm focus:border-[#E7C768] outline-none backdrop-blur-md"
                  />
                  <p className="text-sm text-slate-300">
                    Отображаемый юзернейм бота для ссылок и сообщений кандидатам.
                  </p>
                </div>
              </div>

              {/* Admin Telegram ID */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-200 block">
                  ID администратора Telegram для получения бэкапов
                </label>
                <div className="max-w-md">
                  <input
                    type="text"
                    value={adminTelegramId}
                    onChange={(e) => setAdminTelegramId(e.target.value)}
                    placeholder="169262990"
                    className="w-full px-4 py-2.5 rounded-xl bg-transparent border border-white/20 text-white text-sm font-mono focus:border-[#E7C768] outline-none backdrop-blur-md"
                  />
                </div>
                <p className="text-sm text-slate-300">
                  На этот Chat ID каждый день в 06:00 МСК отправляется JSON-файл резервной копии базы данных.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 flex-wrap pt-2">
                <button
                  type="button"
                  onClick={saveBotSettings}
                  disabled={isSavingTg}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] text-sm font-bold shadow-lg hover:opacity-90 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingTg ? <Loader2 className="w-4 h-4 animate-spin text-[#17344F]" /> : <Check className="w-4 h-4 text-[#17344F]" />}
                  <span>Сохранить настройки бота</span>
                </button>

                <button
                  type="button"
                  onClick={triggerManualBackup}
                  disabled={isTriggeringBackup}
                  className="px-5 py-2.5 rounded-xl border border-white/30 hover:border-[#E7C768] text-white hover:text-[#E7C768] text-sm font-bold backdrop-blur-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isTriggeringBackup ? <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" /> : <DownloadCloud className="w-4 h-4" />}
                  <span>Запустить резервное копирование сейчас</span>
                </button>
              </div>
            </div>

            {/* Cron Tasks List Card */}
            <div className="bg-transparent backdrop-blur-2xl p-6 rounded-2xl border border-white/20 space-y-4 shadow-xl">
              <div>
                <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <Database className="w-5 h-5 text-[#E7C768]" />
                  <span>Зарегистрированные задачи планировщика</span>
                </h3>
                <p className="text-sm text-slate-300">
                  Автоматический бэкап срабатывает ежедневно в 06:00 по времени Москвы (MSK). Вы также можете выполнить тестовый запуск любой задачи вручную.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                {status?.activeCrons?.map((cron) => (
                  <div
                    key={cron.id}
                    className="bg-transparent backdrop-blur-md p-4 rounded-xl border border-white/15 flex items-center justify-between flex-wrap gap-3"
                  >
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2.5">
                        <span>{cron.task_name}</span>
                        <span className="text-sm px-2.5 py-0.5 rounded-md text-[#E7C768] font-mono border border-white/15 backdrop-blur-sm">
                          {cron.schedule}
                        </span>
                      </div>
                      <div className="text-sm text-slate-300 mt-1">
                        Последний запуск: {cron.last_run || "Не запускался"} | Статус:{" "}
                        <span className="text-[#E7C768] font-bold">{cron.status}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => runCronTask(cron.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-transparent hover:border-[#E7C768] text-white hover:text-[#E7C768] text-sm font-bold border border-white/20 transition-all cursor-pointer backdrop-blur-sm"
                    >
                      <Play className="w-4 h-4 text-[#E7C768]" />
                      <span>Тестовый запуск</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit / Add Modal */}
      {(isAddingNew || editingRow) && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl w-full max-w-2xl p-6 max-h-[88vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/15 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[#E7C768]" />
                <span className="bg-gradient-to-r from-[#E7C768] via-white to-[#E7C768] bg-clip-text text-transparent">
                  {isAddingNew ? `Добавить запись в ${selectedTable}` : `Редактировать запись (${editingRow?.id || editingRow?.public_id})`}
                </span>
              </h3>
              <button
                onClick={() => {
                  setIsAddingNew(false);
                  setEditingRow(null);
                }}
                className="text-slate-300 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {/* Special Balance & Limits management block for employers */}
              {selectedTable === "employers" && editingRow && (
                <div className="p-4 rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Баланс и лимиты работодателя</div>
                      <div className="text-sm text-slate-300">
                        Все изменения баланса и лимитов проводятся через транзакции
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Текущий баланс</div>
                      <div className="text-lg font-bold bg-gradient-to-r from-[#E7C768] to-[#F4EE8E] bg-clip-text text-transparent">
                        {Number(rowFormData.balance || editingRow.balance || 0).toLocaleString("ru-RU")} RR
                      </div>
                    </div>
                  </div>

                  {/* Sub-balances breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-white/10">
                    <div className="p-2 rounded-xl border border-white/10 bg-transparent">
                      <div className="text-xs text-slate-400">Старт</div>
                      <div className="text-sm font-bold text-white font-mono">{Number(rowFormData.balance_start ?? editingRow.balance_start ?? 0).toLocaleString("ru-RU")}</div>
                    </div>
                    <div className="p-2 rounded-xl border border-white/10 bg-transparent">
                      <div className="text-xs text-slate-400">Оплаты</div>
                      <div className="text-sm font-bold text-white font-mono">{Number(rowFormData.balance_pay ?? editingRow.balance_pay ?? 0).toLocaleString("ru-RU")}</div>
                    </div>
                    <div className="p-2 rounded-xl border border-white/10 bg-transparent">
                      <div className="text-xs text-slate-400">Рефералы</div>
                      <div className="text-sm font-bold text-white font-mono">{Number(rowFormData.balance_referral ?? editingRow.balance_referral ?? 0).toLocaleString("ru-RU")}</div>
                    </div>
                    <div className="p-2 rounded-xl border border-white/10 bg-transparent">
                      <div className="text-xs text-slate-400">Админ</div>
                      <div className="text-sm font-bold text-white font-mono">{Number(rowFormData.balance_admin ?? editingRow.balance_admin ?? 0).toLocaleString("ru-RU")}</div>
                    </div>
                    <div className="p-2 rounded-xl border border-white/10 bg-transparent">
                      <div className="text-xs text-slate-400">Расход лимитов</div>
                      <div className="text-sm font-bold text-white font-mono">{Number(rowFormData.balance_limits ?? editingRow.balance_limits ?? 0).toLocaleString("ru-RU")}</div>
                    </div>
                  </div>

                  {/* Balance Adjustment Button/Input */}
                  <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-white mb-1">
                        Начислить / списать баланс (±RR):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={modalDeltaInput || ""}
                          onChange={(e) => setModalDeltaInput(Number(e.target.value))}
                          placeholder="Например, 1000 или -500"
                          className="w-full bg-transparent border border-white/20 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#E7C768]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!modalDeltaInput) {
                              alert("Укажите сумму для изменения баланса");
                              return;
                            }
                            setEmployerBalanceModal({
                              open: true,
                              row: editingRow,
                              currentBalance: Number(rowFormData.balance || editingRow.balance || 0),
                              delta: modalDeltaInput,
                              busy: false,
                            });
                          }}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-sm shadow-md hover:brightness-110 shrink-0 cursor-pointer"
                        >
                          Изменить баланс
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Individual Limit Fields */}
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <div className="text-sm font-bold text-white">Индивидуальные лимиты</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        { key: "landing_credits", label: "Вакансии (лендинги)" },
                        { key: "interview_setup_credits", label: "Системы найма" },
                        { key: "training_setup_credits", label: "Системы обучения" },
                        { key: "interview_credits", label: "Интервью" },
                        { key: "training_credits", label: "Обучения" },
                      ].map((item) => {
                        const curVal = Number(editingRow[item.key] || 0);
                        const draftVal = rowFormData[item.key] !== undefined ? Number(rowFormData[item.key]) : curVal;
                        return (
                          <div key={item.key} className="p-2.5 rounded-xl border border-white/15 bg-transparent flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-slate-300 truncate">{item.label}</div>
                              <input
                                type="number"
                                value={draftVal}
                                onChange={(e) => setRowFormData({ ...rowFormData, [item.key]: e.target.value })}
                                className="w-full bg-transparent border border-white/20 rounded-lg px-2.5 py-1 text-sm text-white font-mono mt-1 focus:outline-none focus:border-[#E7C768]"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEmployerLimitModal({
                                  open: true,
                                  row: editingRow,
                                  field: item.key,
                                  label: item.label,
                                  currentValue: curVal,
                                  newValue: draftVal,
                                  busy: false,
                                });
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#E7C768] text-[#17344F] font-bold text-sm hover:brightness-110 shrink-0 self-end mb-0.5 cursor-pointer"
                            >
                              Сохранить
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tableData.schema.map((col) => {
                const isEmployerBalanceCol = selectedTable === "employers" && (col.name === "balance" || col.name.startsWith("balance_"));
                if (isEmployerBalanceCol) {
                  return (
                    <div key={col.name}>
                      <label className="block text-sm font-semibold text-white mb-1">
                        {col.name} <span className="text-sm text-slate-400 font-normal">({col.type})</span>
                      </label>
                      <div className="w-full bg-transparent border border-white/15 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono flex items-center justify-between">
                        <span>{rowFormData[col.name] || "0"}</span>
                        <span className="text-sm text-[#E7C768] font-sans flex items-center gap-1">
                          <Lock className="w-4 h-4" />
                          Фиксируется через транзакции
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={col.name}>
                    <label className="block text-sm font-semibold text-white mb-1">
                      {col.name} <span className="text-sm text-slate-400 font-normal">({col.type})</span>
                    </label>
                    <textarea
                      rows={rowFormData[col.name]?.length > 60 ? 3 : 1}
                      value={rowFormData[col.name] || ""}
                      onChange={(e) => setRowFormData({ ...rowFormData, [col.name]: e.target.value })}
                      className="w-full bg-transparent border border-white/20 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#E7C768]"
                    />
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-white/15 mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setIsAddingNew(false);
                  setEditingRow(null);
                }}
                className="px-5 py-2 rounded-xl bg-transparent border border-white/20 hover:border-white/40 text-white text-sm font-bold transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveRow}
                disabled={loading}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-sm shadow-md hover:brightness-110 transition cursor-pointer"
              >
                {loading ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-white font-bold text-base">
              <AlertCircle className="w-6 h-6 shrink-0 text-[#E7C768]" />
              <span className="bg-gradient-to-r from-[#E7C768] to-white bg-clip-text text-transparent">Массовое удаление записей</span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              Вы действительно хотите безвозвратно удалить <strong className="text-white font-bold">{selectedRowIds.size} выбранных записей</strong> из таблицы <strong className="text-[#E7C768] font-mono">{selectedTable}</strong>?
            </p>
            <div className="bg-transparent p-3.5 rounded-xl border border-white/15 text-sm text-slate-300 font-mono space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
              <div className="text-sm text-[#E7C768] font-bold mb-1">Выбранные ID для удаления:</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedRowIds).map((id, i) => (
                  <span key={i} className="bg-transparent border border-white/20 px-2 py-0.5 rounded text-sm text-white">
                    {String(id)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                className="px-5 py-2 rounded-xl bg-transparent border border-white/20 hover:border-white/40 text-white text-sm font-bold transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={executeBatchDelete}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-sm shadow-lg transition flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Удалить выбранные ({selectedRowIds.size})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {rowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-white font-bold text-base">
              <AlertCircle className="w-6 h-6 shrink-0 text-[#E7C768]" />
              <span className="bg-gradient-to-r from-[#E7C768] to-white bg-clip-text text-transparent">Подтверждение удаления</span>
            </div>
            <p className="text-sm text-slate-200">
              Вы действительно хотите удалить эту запись из таблицы <strong className="text-[#E7C768] font-mono">{selectedTable}</strong>?
            </p>
            <div className="bg-transparent p-3.5 rounded-xl border border-white/15 font-mono text-sm text-[#E7C768] truncate">
              ID: <span className="text-white">{String(rowToDelete.id)}</span>
              {rowToDelete.label !== String(rowToDelete.id) && (
                <div className="text-slate-300 text-sm mt-1 font-sans">
                  Название / текст: {rowToDelete.label}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setRowToDelete(null)}
                className="px-5 py-2 rounded-xl bg-transparent border border-white/20 hover:border-white/40 text-white text-sm font-bold transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={executeDeleteRow}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-sm shadow-lg transition flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Удалить из базы</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cron Notice Modal */}
      {cronNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 font-bold text-base text-white">
              <AlertCircle className="w-6 h-6 shrink-0 text-[#E7C768]" />
              <span className="bg-gradient-to-r from-[#E7C768] to-white bg-clip-text text-transparent">{cronNoticeModal.title}</span>
            </div>
            <p className="text-sm text-slate-200 whitespace-pre-line leading-relaxed">
              {cronNoticeModal.message}
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCronNoticeModal(null)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] text-sm font-bold transition shadow-md cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employer Balance Change Modal */}
      <ConfirmBalanceChangeModal
        open={employerBalanceModal.open}
        onClose={() => setEmployerBalanceModal((s) => ({ ...s, open: false }))}
        employerName={employerBalanceModal.row?.name || employerBalanceModal.row?.email || `Клиент #${employerBalanceModal.row?.public_id || employerBalanceModal.row?.id}`}
        employerId={employerBalanceModal.row?.id || ""}
        currentBalance={employerBalanceModal.currentBalance}
        delta={employerBalanceModal.delta}
        onConfirm={handleConfirmEmployerBalanceChange}
        busy={employerBalanceModal.busy}
      />

      {/* Employer Limit Change Modal */}
      <ConfirmLimitChangeModal
        open={employerLimitModal.open}
        onClose={() => setEmployerLimitModal((s) => ({ ...s, open: false }))}
        employerName={employerLimitModal.row?.name || employerLimitModal.row?.email || `Клиент #${employerLimitModal.row?.public_id || employerLimitModal.row?.id}`}
        employerId={employerLimitModal.row?.id || ""}
        limitKey={employerLimitModal.field}
        limitLabel={employerLimitModal.label}
        currentValue={employerLimitModal.currentValue}
        newValue={employerLimitModal.newValue}
        onConfirm={handleConfirmEmployerLimitSave}
        busy={employerLimitModal.busy}
      />

      {/* JSON Restore Confirmation Modal — Apple Liquid Glass Style */}
      {jsonRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-white">
            <div className="flex items-center gap-3 border-b border-white/15 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-transparent border border-[#E7C768]/60 flex items-center justify-center text-[#E7C768] shrink-0">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base md:text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-tight">
                  Восстановление базы данных из json
                </h3>
                <p className="text-sm text-slate-300">
                  {jsonRestoreModal.meta?.reason ? `Бэкап: ${jsonRestoreModal.meta.reason}` : "Проверка структуры перед импортом"}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-200">
              <div className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-2 backdrop-blur-sm">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300">Файл дампа:</span>
                  <span className="font-mono text-white font-medium truncate max-w-[240px]">{jsonRestoreModal.fileName}</span>
                </div>
                {jsonRestoreModal.meta?.exportedAtMSK && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-300">Дата экспорта:</span>
                    <span className="text-white font-medium">{jsonRestoreModal.meta.exportedAtMSK}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300">Таблиц к загрузке:</span>
                  <span className="text-[#F5D67A] font-bold">{jsonRestoreModal.totalTables}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300">Всего строк данных:</span>
                  <span className="text-white font-bold">{jsonRestoreModal.totalRows}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm text-slate-300 block font-medium">Список таблиц в файле:</span>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {jsonRestoreModal.tablesSummary.map((t) => (
                    <div
                      key={t.name}
                      className="flex justify-between items-center text-sm py-1 px-3 rounded-xl border border-white/10 bg-transparent backdrop-blur-sm"
                    >
                      <span className="font-mono text-white">{t.name}</span>
                      <span className="text-[#F5D67A] text-sm">{t.count} строк</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed border-t border-white/10 pt-3">
                Существующие записи с совпадающими первичными ключами (id) будут обновлены, новые записи добавлены. Доступ супер-администратора 100007 будет сохранен.
              </p>

              {isImportingCsv && jsonRestoreProgress && (
                <div className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-3 space-y-2 backdrop-blur-sm">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#E7C768] font-medium truncate">
                      Таблица: {jsonRestoreProgress.currentTable}
                    </span>
                    <span className="font-mono text-white shrink-0">
                      {jsonRestoreProgress.current} / {jsonRestoreProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full border border-white/15 overflow-hidden bg-transparent">
                    <div
                      className="h-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] transition-all duration-300"
                      style={{
                        width: `${Math.round((jsonRestoreProgress.current / Math.max(1, jsonRestoreProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/15">
              <button
                type="button"
                onClick={() => setJsonRestoreModal(null)}
                disabled={isImportingCsv}
                className="px-5 py-2.5 rounded-2xl bg-transparent border border-white/20 hover:border-white/40 text-white text-sm font-medium transition cursor-pointer backdrop-blur-sm disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmJsonRestore}
                disabled={isImportingCsv}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-sm shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isImportingCsv ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>
                      {jsonRestoreProgress
                        ? `Загрузка (${jsonRestoreProgress.current}/${jsonRestoreProgress.total})...`
                        : "Восстановление..."}
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Подтвердить восстановление</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Restore Success Modal */}
      {jsonSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
          <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-white text-center">
            <div className="w-14 h-14 rounded-full bg-transparent border border-[#E7C768] mx-auto flex items-center justify-center text-[#E7C768] shadow-lg">
              <Check className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-bold text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                База данных успешно восстановлена
              </h3>
              <p className="text-sm text-slate-300 mt-1">
                Импортировано таблиц: {jsonSuccessModal.totalTables}. Все данные синхронизированы на сервере.
              </p>
            </div>
            <div className="max-h-40 overflow-y-auto p-3 rounded-2xl border border-white/10 bg-transparent text-sm font-mono text-slate-300 text-left custom-scrollbar leading-relaxed">
              {jsonSuccessModal.details}
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setJsonSuccessModal(null)}
                className="w-full px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#E7C768] to-[#C8A748] text-[#17344F] font-bold text-sm shadow-md hover:brightness-110 transition cursor-pointer"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
