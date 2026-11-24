import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Mail, Phone, RotateCcw, Search, Send, UserCheck, Users, X } from "lucide-react";

export interface TeamMemberCandidate {
  id: string;
  public_id?: string;
  name: string;
  email?: string;
  phone?: string;
  telegram?: string;
  avatar_url?: string;
  roleLabel: string;
  isCreator?: boolean;
}

interface VacancyResponsiblesModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  vacancyTitle: string;
  companyId?: string;
  companyName?: string;
  creatorEmployerId?: string;
  creatorProfileFallback?: {
    id: string;
    public_id?: string;
    name?: string;
    email?: string;
    phone?: string;
    telegram?: string;
    avatar_url?: string;
  };
  initialSelectedIds: string[];
  persistDirectly?: boolean;
  onSaved: (selectedIds: string[], contacts: TeamMemberCandidate[]) => void;
}

function normId(val?: string | null): string {
  return String(val || "").trim().replace(/^emp-?/i, "").trim();
}

export const VacancyResponsiblesModal: React.FC<VacancyResponsiblesModalProps> = ({
  open,
  onClose,
  projectId,
  vacancyTitle,
  companyId,
  companyName,
  creatorEmployerId,
  creatorProfileFallback,
  initialSelectedIds,
  persistDirectly = true,
  onSaved,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<TeamMemberCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const initialSelectedKey = (initialSelectedIds || []).join(",");
  const creatorFallbackRef = React.useRef(creatorProfileFallback);
  creatorFallbackRef.current = creatorProfileFallback;
  const initialSelectedRef = React.useRef(initialSelectedIds);
  initialSelectedRef.current = initialSelectedIds;

  useEffect(() => {
    if (!open) return;
    setNotice("");
    setSearch("");

    let cancelled = false;
    const loadMembers = async () => {
      setLoading(true);
      try {
        const list: TeamMemberCandidate[] = [];
        const seen = new Set<string>();
        const pushPerson = (raw: any, roleLabel: string, isCreator = false) => {
          if (!raw) return;
          const uid = String(raw.employer_id || raw.id || "").trim();
          const pub = String(raw.employer_public_id || raw.public_id || "").trim();
          const key = normId(pub || uid);
          if (!key || seen.has(key)) return;
          seen.add(key);
          list.push({
            id: uid || pub,
            public_id: pub || undefined,
            name: String(raw.name || raw.contact_name || raw.email || `Сотрудник #${key}`).trim(),
            email: String(raw.email || raw.contact_email || "").trim(),
            phone: String(raw.phone || raw.contact_phone || "").trim(),
            telegram: String(raw.telegram || raw.contact_telegram || "").trim().replace(/^@+/, ""),
            avatar_url: String(raw.avatar_url || "").trim(),
            roleLabel,
            isCreator,
          });
        };

        if (companyId) {
          const res = await fetch(`/api/companies/${encodeURIComponent(companyId)}/members`);
          if (res.ok) {
            const data = await res.json();
            if (data?.owner) {
              const isCr = normId(data.owner.public_id || data.owner.id) === normId(creatorEmployerId);
              pushPerson(data.owner, "Владелец компании", isCr);
            }
            if (Array.isArray(data?.members)) {
              for (const m of data.members) {
                if (["revoked", "removed", "inactive"].includes(String(m?.status || "").toLowerCase())) continue;
                const roleLabel =
                  m?.role === "admin"
                    ? "Администратор команды"
                    : m?.role === "owner"
                    ? "Владелец компании"
                    : "Менеджер команды";
                const isCr = normId(m.employer_public_id || m.employer_id || m.id) === normId(creatorEmployerId);
                pushPerson(m, roleLabel, isCr);
              }
            }
          }
        }

        const fb = creatorFallbackRef.current;
        if (fb && (fb.id || fb.public_id)) {
          pushPerson(fb, "Создатель вакансии", true);
        }

        const curInitIds = initialSelectedRef.current || [];
        for (const sid of curInitIds) {
          const k = normId(sid);
          if (k && !seen.has(k)) {
            seen.add(k);
            list.push({
              id: sid,
              public_id: k,
              name: `Сотрудник #${k}`,
              roleLabel: "Текущий ответственный",
            });
          }
        }

        if (!cancelled) {
          setMembers(list);
          const initialNorms = new Set(curInitIds.map(normId).filter(Boolean));
          let matched = list
            .filter((m) => initialNorms.has(normId(m.public_id || m.id)))
            .map((m) => String(m.public_id || m.id));
          if (matched.length === 0 && list.length > 0) {
            const creatorMatch = list.find((m) => normId(m.public_id || m.id) === normId(creatorEmployerId));
            matched = [String((creatorMatch || list[0]).public_id || (creatorMatch || list[0]).id)];
          }
          setSelectedIds(matched);
        }
      } catch {
        if (!cancelled) {
          setNotice("Не удалось загрузить полный список команды — показаны доступные профили.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, companyId, creatorEmployerId, initialSelectedKey]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.name, m.email, m.telegram, m.phone, m.roleLabel, m.public_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [members, search]);

  if (!open) return null;

  const isSelected = (m: TeamMemberCandidate) => {
    const target = normId(m.public_id || m.id);
    return selectedIds.some((id) => normId(id) === target);
  };

  const toggleMember = (m: TeamMemberCandidate) => {
    const keyVal = String(m.public_id || m.id);
    const target = normId(keyVal);
    setNotice("");
    if (isSelected(m)) {
      if (selectedIds.length <= 1) {
        setNotice("У вакансии должен оставаться хотя бы один ответственный.");
        return;
      }
      setSelectedIds((prev) => prev.filter((id) => normId(id) !== target));
    } else {
      setSelectedIds((prev) => [...prev, keyVal]);
    }
  };

  const handleResetCreator = () => {
    setNotice("");
    const creator =
      members.find((m) => normId(m.public_id || m.id) === normId(creatorEmployerId)) ||
      members.find((m) => m.isCreator) ||
      members[0];
    if (creator) {
      setSelectedIds([String(creator.public_id || creator.id)]);
    }
  };

  const handleSave = async () => {
    if (selectedIds.length === 0) {
      setNotice("Выберите хотя бы одного ответственного за вакансию.");
      return;
    }
    const chosenContacts = members.filter((m) =>
      selectedIds.some((sid) => normId(sid) === normId(m.public_id || m.id))
    );

    if (!persistDirectly || !projectId || projectId.startsWith("draft")) {
      onSaved(selectedIds, chosenContacts);
      onClose();
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/responsibles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsible_employer_ids: selectedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Ошибка сохранения ответственных");
      }
      onSaved(
        Array.isArray(data.responsible_employer_ids) ? data.responsible_employer_ids : selectedIds,
        chosenContacts
      );
      onClose();
    } catch (err: any) {
      setNotice(err?.message || "Не удалось сохранить список ответственных.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-transparent backdrop-blur-xl flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="brand-editor w-full max-w-2xl bg-transparent backdrop-blur-2xl border border-[#E7C768]/45 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/15 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
              <Users className="w-5 h-5 text-[#E7C768] shrink-0" />
              <span>Ответственные за вакансию</span>
            </h3>
            <p className="text-[14px] text-slate-200 leading-snug break-words">
              Вакансия: <span className="font-bold text-white">{vacancyTitle || "Без названия"}</span>
              {companyName ? ` · Компания: ${companyName}` : ""}
            </p>
            <p className="text-[14px] text-slate-300 leading-snug">
              Можно выбрать одного или нескольких сотрудников команды. Их контакты увидят соискатели, а уведомления придут согласно личным настройкам каждого выбранного ответственного.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer p-2 rounded-2xl border border-white/20 text-white hover:border-[#E7C768] bg-transparent backdrop-blur-xl transition shrink-0"
            aria-label="Закрыть окно"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Reset Toolbar */}
        <div className="px-5 sm:px-6 pt-4 pb-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#E7C768] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по ФИО, Email или Telegram..."
              className="w-full bg-transparent backdrop-blur-md border border-white/25 rounded-2xl pl-10 pr-4 py-2.5 text-[14px] text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768]"
            />
          </div>
          <button
            type="button"
            onClick={handleResetCreator}
            className="cursor-pointer px-4 py-2.5 rounded-2xl border border-white/25 bg-transparent backdrop-blur-md text-white hover:border-[#E7C768] text-[14px] font-bold flex items-center justify-center gap-2 transition shrink-0"
          >
            <RotateCcw className="w-4 h-4 text-[#E7C768]" />
            <span>По умолчанию</span>
          </button>
        </div>

        {/* Team Members List */}
        <div className="p-5 sm:p-6 pt-3 overflow-y-auto space-y-3 flex-1">
          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2.5 text-[14px] text-slate-200">
              <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" />
              <span>Загружаем команду компании...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-slate-300 border border-white/15 rounded-2xl p-4">
              Участники команды по запросу не найдены.
            </div>
          ) : (
            filteredMembers.map((member) => {
              const checked = isSelected(member);
              return (
                <button
                  key={String(member.public_id || member.id)}
                  type="button"
                  onClick={() => toggleMember(member)}
                  className={`cursor-pointer w-full text-left p-4 rounded-2xl border backdrop-blur-xl transition flex items-start gap-3.5 ${
                    checked
                      ? "border-[#E7C768] bg-transparent backdrop-blur-2xl shadow-[0_0_20px_rgba(231,199,104,0.18)]"
                      : "border-white/20 bg-transparent hover:border-white/45"
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition ${
                      checked
                        ? "bg-gradient-to-br from-[#FFE580] to-[#C8A038] border-[#FFE580] text-[#17344F]"
                        : "border-white/40 bg-transparent text-transparent"
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>

                  {/* Avatar */}
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.name}
                      className="w-11 h-11 rounded-2xl object-cover border border-[#E7C768]/50 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-2xl border border-[#E7C768]/50 bg-transparent backdrop-blur-md flex items-center justify-center text-[15px] font-bold text-[#F4EE8E] shrink-0">
                      {(member.name || "С").charAt(0)}
                    </div>
                  )}

                  {/* Details */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-bold text-white break-words">{member.name}</span>
                      <span className="text-[14px] px-2.5 py-0.5 rounded-xl border border-[#E7C768]/45 text-[#F4EE8E]">
                        {member.roleLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-slate-300">
                      {member.email && (
                        <span className="inline-flex items-center gap-1.5 break-all">
                          <Mail className="w-3.5 h-3.5 text-[#E7C768] shrink-0" />
                          <span>{member.email}</span>
                        </span>
                      )}
                      {member.phone && (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[#E7C768] shrink-0" />
                          <span>{member.phone}</span>
                        </span>
                      )}
                      {member.telegram && (
                        <span className="inline-flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-[#E7C768] shrink-0" />
                          <span>@{member.telegram}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-5 sm:p-6 border-t border-white/15 space-y-3">
          {notice && (
            <div className="px-4 py-2.5 rounded-2xl border border-[#E7C768]/60 bg-transparent backdrop-blur-md text-[14px] text-[#F4EE8E]">
              {notice}
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-[14px] text-slate-200 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Выбрано ответственных: <b className="text-white">{selectedIds.length}</b></span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer px-5 py-2.5 rounded-2xl border border-white/25 bg-transparent backdrop-blur-md text-white text-[14px] font-bold hover:border-white/50 transition"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={saving || selectedIds.length === 0}
                onClick={handleSave}
                className="cursor-pointer px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] text-[14px] font-bold shadow-lg hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Сохранить выбор ({selectedIds.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
