import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Bold,
  Code,
  Eye,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Mail,
  Minus,
  Pencil,
  Quote,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/dbClient";
import { GLASS_CARD_CLASS, GOLD_BUTTON_CLASS, GOLD_TEXT_CLASS, safeArray } from "../panel/adminConfig";
import { ADMIN_PAGE_SIZE, InfiniteScrollTrigger } from "../panel/PaginationControls";
import { MailingDualPreview, stripMarkdownPreview } from "./MarkdownPreview";
import { RecipientPickerModal, SelectedRecipient } from "./RecipientPickerModal";

type AudienceType =
  | "all_users"
  | "employers"
  | "employers_paying"
  | "employers_active"
  | "employers_setup"
  | "employers_new"
  | "candidates"
  | "custom";

const AUDIENCE_OPTIONS: Array<{ key: AudienceType; label: string }> = [
  { key: "employers", label: "Все работодатели" },
  { key: "employers_paying", label: "Платящие клиенты" },
  { key: "employers_active", label: "Клиенты с откликами" },
  { key: "employers_setup", label: "Настраивают систему" },
  { key: "employers_new", label: "Новые клиенты" },
  { key: "candidates", label: "Все кандидаты" },
  { key: "all_users", label: "Все пользователи" },
  { key: "custom", label: "Выборочно (список)" },
];

export default function MailingsAdmin({ setToast }: { setToast?: (t: any) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("employers");
  const [selectedRecipients, setSelectedRecipients] = useState<SelectedRecipient[]>([]);
  const [sendInApp, setSendInApp] = useState(true);
  const [sendPush, setSendPush] = useState(true);
  const [sendTelegram, setSendTelegram] = useState(true);
  const [testChatId, setTestChatId] = useState("");

  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [audienceStats, setAudienceStats] = useState<{
    totalCount: number;
    employersCount: number;
    candidatesCount: number;
    telegramReachableUsers: number;
  } | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);

  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const notify = (kind: "ok" | "err", text: string) => {
    if (setToast) setToast({ kind, text });
  };

  useEffect(() => {
    const t = setTimeout(() => setHistorySearchQuery(historySearch.trim()), 280);
    return () => clearTimeout(t);
  }, [historySearch]);

  const loadHistory = async (append = false, currentLen = 0) => {
    if (append) setLoadingMoreHistory(true);
    else setLoadingHistory(true);
    try {
      const offset = append ? currentLen : 0;
      const res = await fetch(
        `/api/admin/mailings?limit=${ADMIN_PAGE_SIZE}&offset=${offset}&q=${encodeURIComponent(
          historySearchQuery
        )}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        const items = safeArray(data?.items);
        setHistory((prev) => (append ? [...prev, ...items] : items));
        setHistoryTotal(Number(data?.total ?? items.length));
        setHistoryHasMore(Boolean(data?.hasMore));
      }
    } finally {
      setLoadingHistory(false);
      setLoadingMoreHistory(false);
    }
  };

  useEffect(() => {
    loadHistory(false, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearchQuery]);

  useEffect(() => {
    let active = true;
    const fetchAudience = async () => {
      setLoadingAudience(true);
      try {
        const res = await fetch("/api/admin/mailings/preview-audience", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            audience_type: audienceType,
            selected_recipients: selectedRecipients.map((r) => ({ kind: r.kind, id: r.id })),
          }),
        });
        if (res.ok && active) {
          const data = await res.json();
          setAudienceStats({
            totalCount: Number(data.totalCount || 0),
            employersCount: Number(data.employersCount || 0),
            candidatesCount: Number(data.candidatesCount || 0),
            telegramReachableUsers: Number(data.telegramReachableUsers || 0),
          });
        }
      } catch {}
      if (active) setLoadingAudience(false);
    };
    fetchAudience();
    return () => {
      active = false;
    };
  }, [audienceType, selectedRecipients]);

  const wrapSelection = (before: string, after = before, placeholder = "текст") => {
    const ta = textareaRef.current;
    if (!ta) {
      setBodyMd((prev) => `${prev}${prev ? "\n" : ""}${before}${placeholder}${after}`);
      return;
    }
    const start = ta.selectionStart ?? bodyMd.length;
    const end = ta.selectionEnd ?? bodyMd.length;
    const selected = bodyMd.slice(start, end) || placeholder;
    const next = `${bodyMd.slice(0, start)}${before}${selected}${after}${bodyMd.slice(end)}`;
    setBodyMd(next);
    requestAnimationFrame(() => {
      ta.focus();
      const sPos = start + before.length;
      ta.setSelectionRange(sPos, sPos + selected.length);
    });
  };

  const insertAtCursor = (snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setBodyMd((prev) => `${prev}${prev ? "\n\n" : ""}${snippet}`);
      return;
    }
    const start = ta.selectionStart ?? bodyMd.length;
    const end = ta.selectionEnd ?? bodyMd.length;
    const next = `${bodyMd.slice(0, start)}${snippet}${bodyMd.slice(end)}`;
    setBodyMd(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const buildPayload = () => ({
    id: editingId,
    title: title.trim(),
    body_md: bodyMd,
    image_url: imageUrl.trim() || null,
    button_text: buttonText.trim() || null,
    button_url: buttonUrl.trim() || null,
    audience_type: audienceType,
    selected_recipients: selectedRecipients.map((r) => ({ kind: r.kind, id: r.id })),
    send_in_app: sendInApp,
    send_push: sendPush,
    send_telegram: sendTelegram,
  });

  const handleSaveDraft = async () => {
    if (!title.trim() || !bodyMd.trim()) {
      notify("err", "Заполните заголовок и текст письма");
      return;
    }
    setSavingDraft(true);
    try {
      const res = await fetch("/api/admin/mailings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("err", data.error || "Не удалось сохранить черновик");
        return;
      }
      if (data?.mailing?.id) setEditingId(data.mailing.id);
      notify("ok", "Черновик письма сохранён в базе данных");
      loadHistory(false, 0);
    } catch (e: any) {
      notify("err", e?.message || "Ошибка сети");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!title.trim() || !bodyMd.trim()) {
      notify("err", "Заполните заголовок и текст письма для тестовой отправки");
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch("/api/admin/mailings/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          chat_id: testChatId.trim() || undefined,
          title: title.trim(),
          body_md: bodyMd,
          image_url: imageUrl.trim() || null,
          button_text: buttonText.trim() || null,
          button_url: buttonUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("err", data.error || "Ошибка тестовой отправки в Telegram");
        return;
      }
      notify("ok", `Тест отправлен в Telegram (чат ${data.chatId})`);
    } catch (e: any) {
      notify("err", e?.message || "Ошибка сети");
    } finally {
      setSendingTest(false);
    }
  };

  const handleOpenConfirmSend = () => {
    if (!title.trim() || !bodyMd.trim()) {
      notify("err", "Укажите заголовок и текст письма");
      return;
    }
    if (!sendInApp && !sendPush && !sendTelegram) {
      notify("err", "Выберите хотя бы один канал доставки");
      return;
    }
    if (audienceType === "custom" && selectedRecipients.length === 0) {
      notify("err", "Выберите хотя бы одного получателя");
      return;
    }
    setConfirmSendOpen(true);
  };

  const handleConfirmSend = async () => {
    setConfirmSendOpen(false);
    setSendingCampaign(true);
    try {
      const res = await fetch("/api/admin/mailings/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("err", data.error || "Ошибка отправки рассылки");
        return;
      }
      const m = data.mailing;
      notify(
        "ok",
        `Рассылка отправлена! Уведомлений: ${m?.in_app_sent ?? 0}, Push: ${m?.push_sent ?? 0}, Telegram: ${m?.telegram_sent ?? 0}`
      );
      setEditingId(null);
      loadHistory(false, 0);
    } catch (e: any) {
      notify("err", e?.message || "Ошибка отправки");
    } finally {
      setSendingCampaign(false);
    }
  };

  const handleDeleteMailing = async (id: string) => {
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/admin/mailings/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        if (editingId === id) setEditingId(null);
        notify("ok", "Запись рассылки удалена");
        loadHistory(false, 0);
      }
    } catch {}
  };

  const loadIntoConstructor = (m: any) => {
    setEditingId(m.status === "draft" ? m.id : null);
    setTitle(m.title || "");
    setBodyMd(m.body_md || "");
    setImageUrl(m.image_url || "");
    setButtonText(m.button_text || "");
    setButtonUrl(m.button_url || "");
    setAudienceType((m.audience_type as AudienceType) || "employers");
    setSelectedRecipients(safeArray(m.selected_recipients));
    setSendInApp(m.send_in_app !== false);
    setSendPush(m.send_push !== false);
    setSendTelegram(m.send_telegram !== false);
    setEditorMode("edit");
    notify("ok", m.status === "draft" ? "Черновик загружен в конструктор" : "Шаблон рассылки скопирован в конструктор");
  };

  const resetConstructor = () => {
    setEditingId(null);
    setTitle("");
    setBodyMd("");
    setImageUrl("");
    setButtonText("");
    setButtonUrl("");
    setAudienceType("employers");
    setSelectedRecipients([]);
    setSendInApp(true);
    setSendPush(true);
    setSendTelegram(true);
  };

  const toolbarButtons = [
    { icon: Bold, label: "Жирный", action: () => wrapSelection("**", "**", "жирный текст") },
    { icon: Italic, label: "Курсив", action: () => wrapSelection("_", "_", "курсив") },
    { icon: Heading2, label: "Заголовок", action: () => insertAtCursor("\n## Подзаголовок\n") },
    { icon: List, label: "Список", action: () => insertAtCursor("\n- Пункт списка") },
    { icon: ListOrdered, label: "Нумерация", action: () => insertAtCursor("\n1. Первый шаг") },
    { icon: Quote, label: "Цитата", action: () => insertAtCursor("\n> Важная заметка") },
    { icon: Code, label: "Код", action: () => wrapSelection("`", "`", "код") },
    { icon: Link2, label: "Ссылка", action: () => insertAtCursor("[Открыть страницу](https://hr-rr.ru)") },
    { icon: Minus, label: "Разделитель", action: () => insertAtCursor("\n---\n") },
  ];

  return (
    <div className="space-y-5">
      <div className={`${GLASS_CARD_CLASS} p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="min-w-0">
          <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS} inline-flex items-center gap-2`}>
            <Mail className="w-5 h-5 text-[#E7C768] shrink-0" />
            <span>Рассылки и конструктор писем (Markdown)</span>
          </h2>
          <p className="text-sm text-slate-200 mt-0.5 break-words">
            Отправка писем в колокольчик уведомлений, Web Push и Telegram пользователям платформы
          </p>
        </div>
        {(title || bodyMd || editingId) && (
          <button
            type="button"
            onClick={resetConstructor}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm font-semibold text-white cursor-pointer shrink-0"
          >
            Новое письмо
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Constructor Left/Main Column */}
        <div className={`xl:col-span-7 ${GLASS_CARD_CLASS} p-4 sm:p-5 space-y-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEditorMode("edit")}
              className={`w-full px-3.5 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer ${
                editorMode === "edit"
                  ? "border-[#E7C768] text-[#F4EE8E]"
                  : "border-white/20 text-white/85 hover:border-white/45"
              }`}
            >
              <Pencil className="w-4 h-4 text-[#E7C768]" />
              <span>Конструктор письма</span>
            </button>
            <button
              type="button"
              onClick={() => setEditorMode("preview")}
              className={`w-full px-3.5 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer ${
                editorMode === "preview"
                  ? "border-[#E7C768] text-[#F4EE8E]"
                  : "border-white/20 text-white/85 hover:border-white/45"
              }`}
            >
              <Eye className="w-4 h-4 text-[#E7C768]" />
              <span>Предпросмотр письма</span>
            </button>
          </div>

          {editorMode === "edit" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Заголовок письма / уведомления
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Новые возможности ИИ-рекрутинга в RoboRecrut"
                  className="w-full bg-transparent border border-white/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-200">
                    Текст письма (Markdown)
                  </label>
                  <span className="text-sm text-slate-300 font-mono">
                    {bodyMd.length} симв.
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl border border-white/20 bg-transparent">
                  {toolbarButtons.map((btn) => {
                    const Icon = btn.icon;
                    return (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={btn.action}
                        title={btn.label}
                        className="px-2.5 py-1.5 rounded-xl border border-white/15 hover:border-[#E7C768] text-sm text-white inline-flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Icon className="w-4 h-4 text-[#E7C768]" />
                        <span className="hidden sm:inline">{btn.label}</span>
                      </button>
                    );
                  })}
                </div>

                <textarea
                  ref={textareaRef}
                  rows={9}
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  placeholder={
                    "## Приветствуем!\n\nМы обновили платформу — теперь **автоматический подбор кандидатов** работает ещё быстрее.\n\n- Добавлен новый отчёт по вакансиям\n- Улучшен ИИ-ассистент\n\n[Открыть кабинет](/setup)"
                  }
                  className="w-full bg-transparent border border-white/25 rounded-2xl px-3.5 py-3 text-sm text-white font-mono leading-relaxed focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-[#E7C768]" />
                      <span>URL изображения (необязательно)</span>
                    </span>
                  </label>
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-transparent border border-white/25 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Текст кнопки (необязательно)
                  </label>
                  <input
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    placeholder="Открыть платформу"
                    className="w-full bg-transparent border border-white/25 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Ссылка кнопки (необязательно)
                  </label>
                  <input
                    value={buttonUrl}
                    onChange={(e) => setButtonUrl(e.target.value)}
                    placeholder="/setup или https://hr-rr.ru/blog"
                    className="w-full bg-transparent border border-white/25 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
                  />
                </div>
              </div>
            </div>
          ) : (
            <MailingDualPreview
              title={title}
              bodyMd={bodyMd}
              imageUrl={imageUrl}
              buttonText={buttonText}
              buttonUrl={buttonUrl}
            />
          )}
        </div>

        {/* Targeting & Delivery Right Column */}
        <div className={`xl:col-span-5 ${GLASS_CARD_CLASS} p-4 sm:p-5 space-y-5`}>
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={`text-base font-bold ${GOLD_TEXT_CLASS} inline-flex items-center gap-2`}>
                <Users className="w-4 h-4 text-[#E7C768]" />
                <span>Аудитория рассылки</span>
              </h3>
              {loadingAudience ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
              ) : audienceStats ? (
                <span className="text-sm text-[#F4EE8E] font-semibold">
                  {audienceStats.totalCount} получ. · {audienceStats.telegramReachableUsers} в Telegram
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AUDIENCE_OPTIONS.map((opt) => {
                const active = audienceType === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setAudienceType(opt.key)}
                    className={`w-full px-3 py-2 rounded-xl border text-sm font-semibold text-left transition cursor-pointer ${
                      active
                        ? "border-[#E7C768] text-[#F4EE8E]"
                        : "border-white/20 text-white/85 hover:border-white/45"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {audienceType === "custom" && (
              <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-sm text-slate-200">
                  Выбрано пользователей: <strong className="text-[#F4EE8E]">{selectedRecipients.length}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-[#E7C768]/60 hover:border-[#E7C768] text-sm font-semibold text-[#F4EE8E] cursor-pointer"
                >
                  Выбрать из списка
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-3 border-t border-white/15">
            <h3 className={`text-base font-bold ${GOLD_TEXT_CLASS}`}>Каналы отправки</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSendInApp((v) => !v)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-between gap-2 transition cursor-pointer ${
                  sendInApp ? "border-[#E7C768] text-[#F4EE8E]" : "border-white/20 text-white/80"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#E7C768]" />
                  <span>В уведомления (колокольчик)</span>
                </span>
                <span>{sendInApp ? "Вкл" : "Выкл"}</span>
              </button>

              <button
                type="button"
                onClick={() => setSendPush((v) => !v)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-between gap-2 transition cursor-pointer ${
                  sendPush ? "border-[#E7C768] text-[#F4EE8E]" : "border-white/20 text-white/80"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#E7C768]" />
                  <span>Web Push (браузер / PWA)</span>
                </span>
                <span>{sendPush ? "Вкл" : "Выкл"}</span>
              </button>

              <button
                type="button"
                onClick={() => setSendTelegram((v) => !v)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-between gap-2 transition cursor-pointer ${
                  sendTelegram ? "border-[#E7C768] text-[#F4EE8E]" : "border-white/20 text-white/80"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#E7C768]" />
                  <span>В Telegram пользователям</span>
                </span>
                <span>{sendTelegram ? "Вкл" : "Выкл"}</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5 pt-3 border-t border-white/15">
            <label className="block text-sm font-medium text-slate-200">
              Тестовая проверка в Telegram (Chat ID необязателен)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={testChatId}
                onChange={(e) => setTestChatId(e.target.value)}
                placeholder="Ваш Telegram Chat ID (или свой профиль)"
                className="flex-1 bg-transparent border border-white/25 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
              />
              <button
                type="button"
                disabled={sendingTest}
                onClick={handleTestTelegram}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm font-semibold text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer shrink-0"
              >
                {sendingTest ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                ) : (
                  <Send className="w-4 h-4 text-[#E7C768]" />
                )}
                <span>Тест в Telegram</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-3 border-t border-white/15">
            <button
              type="button"
              disabled={savingDraft || sendingCampaign}
              onClick={handleSaveDraft}
              className="w-full sm:flex-1 px-4 py-2.5 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {savingDraft ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
              ) : (
                <Save className="w-4 h-4 text-[#E7C768]" />
              )}
              <span>Сохранить черновик</span>
            </button>

            <button
              type="button"
              disabled={sendingCampaign || savingDraft}
              onClick={handleOpenConfirmSend}
              className={`w-full sm:flex-1 px-5 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 ${GOLD_BUTTON_CLASS}`}
            >
              {sendingCampaign ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Отправить рассылку</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mailings History Card (20 items paginated) */}
      <div className={`${GLASS_CARD_CLASS} p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
            История рассылок и черновики — {historyTotal}
          </h3>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Поиск по заголовку или тексту…"
              className="w-full sm:w-72 bg-transparent border border-white/20 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
            />
            <button
              type="button"
              onClick={() => loadHistory(false, 0)}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-white/20 hover:border-[#E7C768] text-sm font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-[#E7C768] ${loadingHistory ? "animate-spin" : ""}`} />
              <span>Обновить</span>
            </button>
          </div>
        </div>

        {loadingHistory ? (
          <div className="py-10 text-center text-sm text-white flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка рассылок…
          </div>
        ) : history.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-300">
            Пока нет сохранённых или отправленных рассылок
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((m) => {
              const audLabel =
                AUDIENCE_OPTIONS.find((a) => a.key === m.audience_type)?.label || m.audience_type;
              return (
                <div
                  key={m.id}
                  className="rounded-2xl border border-white/20 bg-transparent p-4 space-y-2.5 hover:border-[#E7C768]/60 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-base font-bold text-[#F4EE8E] break-words">
                        {m.title}
                      </div>
                      <div className="text-sm text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>{m.status === "sent" ? "Отправлена" : "Черновик"}</span>
                        <span>·</span>
                        <span>{audLabel}</span>
                        <span>·</span>
                        <span>
                          {m.sent_at || m.created_at
                            ? new Date(m.sent_at || m.created_at).toLocaleString("ru-RU")
                            : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => loadIntoConstructor(m)}
                        className="px-3 py-1.5 rounded-xl border border-[#E7C768]/50 hover:border-[#E7C768] text-sm font-semibold text-[#F4EE8E] cursor-pointer"
                      >
                        {m.status === "draft" ? "Редактировать" : "Повторить"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(m.id)}
                        className="p-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-white cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4 text-[#E7C768]" />
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-slate-200 line-clamp-2 break-words">
                    {stripMarkdownPreview(m.body_md)}
                  </p>

                  {m.status === "sent" && (
                    <div className="flex flex-wrap gap-3 pt-2 border-t border-white/15 text-sm text-slate-200">
                      <span>Получателей: <strong className="text-white">{m.total_targets ?? 0}</strong></span>
                      <span>Уведомления: <strong className="text-[#F4EE8E]">{m.in_app_sent ?? 0}</strong></span>
                      <span>Push: <strong className="text-white">{m.push_sent ?? 0}</strong></span>
                      <span>Telegram: <strong className="text-[#F4EE8E]">{m.telegram_sent ?? 0}</strong></span>
                      {Number(m.telegram_skipped || 0) > 0 && (
                        <span>Без Telegram ID: <strong className="text-slate-300">{m.telegram_skipped}</strong></span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <InfiniteScrollTrigger
              hasMore={historyHasMore}
              loading={loadingMoreHistory}
              loadedCount={history.length}
              total={historyTotal}
              onLoadMore={() => loadHistory(true, history.length)}
            />
          </div>
        )}
      </div>

      <RecipientPickerModal
        open={pickerOpen}
        selected={selectedRecipients}
        onChange={setSelectedRecipients}
        onClose={() => setPickerOpen(false)}
      />

      {confirmSendOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[950] flex items-center justify-center p-4 bg-[#0D2032]/75 backdrop-blur-md"
            onClick={() => setConfirmSendOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/50 rounded-3xl p-6 space-y-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-white"
            >
              <h3 className={`text-base font-bold ${GOLD_TEXT_CLASS}`}>
                Подтверждение рассылки
              </h3>
              <div className="space-y-2 text-sm text-slate-100">
                <p>
                  Письмо: <strong className="text-[#F4EE8E]">{title.trim()}</strong>
                </p>
                <p>
                  Получателей в аудитории:{" "}
                  <strong className="text-white">{audienceStats?.totalCount ?? 0}</strong>
                  {sendTelegram && (
                    <span> (в Telegram: {audienceStats?.telegramReachableUsers ?? 0})</span>
                  )}
                </p>
                <p className="text-slate-200">
                  Каналы:{" "}
                  {[
                    sendInApp && "Уведомления на платформе",
                    sendPush && "Web Push",
                    sendTelegram && "Telegram",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmSendOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm font-semibold text-white cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSend}
                  className={`w-full sm:w-auto px-5 py-2 rounded-xl text-sm ${GOLD_BUTTON_CLASS}`}
                >
                  Отправить сейчас
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {confirmDeleteId &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[950] flex items-center justify-center p-4 bg-[#0D2032]/75 backdrop-blur-md"
            onClick={() => setConfirmDeleteId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/50 rounded-3xl p-6 space-y-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-white"
            >
              <h3 className={`text-base font-bold ${GOLD_TEXT_CLASS}`}>
                Удаление рассылки
              </h3>
              <p className="text-sm text-white">
                Удалить эту запись рассылки из истории админ-панели?
              </p>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm font-semibold text-white cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteMailing(confirmDeleteId)}
                  className={`w-full sm:w-auto px-5 py-2 rounded-xl text-sm ${GOLD_BUTTON_CLASS}`}
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
