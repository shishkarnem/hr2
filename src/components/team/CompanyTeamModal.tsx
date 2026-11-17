/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  Users, 
  X, 
  Search, 
  Check, 
  Trash2, 
  ShieldCheck, 
  Building2, 
  Briefcase, 
  UserCheck, 
  Palette, 
  GraduationCap, 
  HelpCircle,
  Plus,
  Edit3
} from "lucide-react";

export interface TeamMemberPermissions {
  company: "view" | "edit";
  vacancies: "view" | "edit";
  can_create_vacancies: boolean;
  crm_candidates: "view" | "edit";
  style_editor: "view" | "edit";
  training: "view" | "edit";
  can_create_trainings: boolean;
  interviews: "view" | "edit";
  can_create_interviews: boolean;
}

const defaultPermissions: TeamMemberPermissions = {
  company: "edit",
  vacancies: "edit",
  can_create_vacancies: true,
  crm_candidates: "edit",
  style_editor: "edit",
  training: "edit",
  can_create_trainings: true,
  interviews: "edit",
  can_create_interviews: true,
};

interface CompanyTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: any;
  currentEmployerId?: string | number;
  onSuccessNotification?: (title: string, message: string) => void;
}

export default function CompanyTeamModal({
  isOpen,
  onClose,
  company,
  currentEmployerId,
  onSuccessNotification,
}: CompanyTeamModalProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [owner, setOwner] = useState<any>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState<string>("");
  
  // New member permissions form
  const [newPermissions, setNewPermissions] = useState<TeamMemberPermissions>(defaultPermissions);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Edit member modal state
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<TeamMemberPermissions>(defaultPermissions);

  const companyId = company?.id;

  // Load team members
  const fetchMembers = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/companies/${companyId}/members`);
      if (resp.ok) {
        const data = await resp.json();
        setMembers(data.members || []);
        setOwner(data.owner || null);
        setIsOwner(Boolean(data.isOwner));
      }
    } catch (err) {
      console.error("Ошибка загрузки команды:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && companyId) {
      fetchMembers();
      setSearchQuery("");
      setSearchResult(null);
      setSearchError("");
      setNewPermissions(defaultPermissions);
      setEditingMemberId(null);
    }
  }, [isOpen, companyId]);

  if (!isOpen || !company) return null;

  // Search user by UID, phone or email
  const handleSearchUser = async () => {
    if (!searchQuery.trim()) {
      setSearchError("Введите UID, телефон или e-mail");
      return;
    }
    setIsSearching(true);
    setSearchError("");
    setSearchResult(null);

    try {
      const resp = await fetch(`/api/employer/find-user?query=${encodeURIComponent(searchQuery.trim())}`);
      const data = await resp.json();
      if (!resp.ok || !data.user) {
        setSearchError(data.error || "Работодатель не найден в системе. Проверьте правильность введенных данных.");
      } else {
        setSearchResult(data.user);
      }
    } catch {
      setSearchError("Сетевая ошибка при поиске пользователя");
    } finally {
      setIsSearching(false);
    }
  };

  // Add member to company
  const handleAddMember = async () => {
    if (!searchResult?.id) return;
    setIsSubmitting(true);
    setSearchError("");

    try {
      const resp = await fetch(`/api/companies/${companyId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmployerId: searchResult.id,
          role: "member",
          permissions: newPermissions,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setSearchError(data.error || "Не удалось добавить участника в команду");
      } else {
        if (onSuccessNotification) {
          onSuccessNotification("Участник добавлен", `Пользователь ${searchResult.name || searchResult.public_id} успешно подключен к компании.`);
        }
        setSearchResult(null);
        setSearchQuery("");
        setNewPermissions(defaultPermissions);
        await fetchMembers();
      }
    } catch {
      setSearchError("Ошибка при отправке запроса на добавление");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save updated permissions for a member
  const handleUpdatePermissions = async (memberId: string) => {
    try {
      const resp = await fetch(`/api/companies/${companyId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: editPermissions,
        }),
      });

      if (resp.ok) {
        if (onSuccessNotification) {
          onSuccessNotification("Права обновлены", "Права доступа участника успешно сохранены.");
        }
        setEditingMemberId(null);
        await fetchMembers();
      }
    } catch (err) {
      console.error("Ошибка обновления прав:", err);
    }
  };

  // Remove member from company
  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!window.confirm(`Вы уверены, что хотите отозвать доступ у пользователя ${memberName}?`)) {
      return;
    }

    try {
      const resp = await fetch(`/api/companies/${companyId}/members/${memberId}`, {
        method: "DELETE",
      });

      if (resp.ok) {
        if (onSuccessNotification) {
          onSuccessNotification("Доступ отозван", `Пользователь ${memberName} удален из команды компании.`);
        }
        await fetchMembers();
      }
    } catch (err) {
      console.error("Ошибка при удалении участника:", err);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] bg-transparent backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div 
        className="relative w-full max-w-3xl bg-[#17344F]/95 backdrop-blur-2xl border border-[#E7C768]/40 shadow-2xl rounded-3xl p-5 sm:p-7 flex flex-col max-h-[90vh] overflow-y-auto text-white space-y-6 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-[#E7C768]" />
              <h3 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Команда компании «{company.name}»
              </h3>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              Совместное управление компанией, вакансиями, кандидатами и стилем. Все лимиты и балансы списываются с материнского аккаунта владельца.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white border border-white/20 bg-transparent backdrop-blur-md rounded-2xl transition cursor-pointer shrink-0"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section: Add new member */}
        <div className="bg-transparent border border-white/15 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#E7C768]" />
            <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Пригласить работодателя в команду
            </h4>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchUser()}
                placeholder="UID (например 100007), ссылка на кабинет (/emp100007), e-mail или телефон"
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition"
              />
            </div>
            <button
              type="button"
              onClick={handleSearchUser}
              disabled={isSearching}
              className="cursor-pointer bg-white/10 hover:bg-white/15 border border-[#E7C768]/60 text-[#E7C768] hover:text-white font-bold text-sm py-2.5 px-5 rounded-xl transition flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              <span>{isSearching ? "Поиск..." : "Найти"}</span>
            </button>
          </div>

          {searchError && (
            <div className="text-sm text-[#E7C768] bg-transparent border border-[#E7C768]/40 p-3 rounded-xl">
              {searchError}
            </div>
          )}

          {/* User Preview & Permissions Form */}
          {searchResult && (
            <div className="bg-transparent border border-[#E7C768]/50 rounded-2xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="space-y-0.5">
                  <span className="text-xs text-[#E7C768] uppercase font-mono tracking-wider block">
                    Пользователь найден в системе
                  </span>
                  <div className="text-base font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#E7C768]" />
                    <span>{searchResult.name || "Работодатель"}</span>
                    <span className="text-xs text-slate-300 font-mono">UID: {searchResult.public_id || searchResult.id}</span>
                  </div>
                  {(searchResult.email || searchResult.phone) && (
                    <div className="text-sm text-slate-300 flex items-center gap-3">
                      {searchResult.email && <span>{searchResult.email}</span>}
                      {searchResult.phone && <span>{searchResult.phone}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Permissions matrix for new user */}
              <div className="space-y-3">
                <div className="text-sm font-bold text-[#E7C768]">
                  Настройка прав доступа для приглашаемого участника:
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {/* Company settings */}
                  <div className="bg-transparent border border-white/15 p-3 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#E7C768] shrink-0" />
                      <span>Данные компании</span>
                    </div>
                    <select
                      value={newPermissions.company}
                      onChange={(e) => setNewPermissions({ ...newPermissions, company: e.target.value as any })}
                      className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                    >
                      <option value="edit">Редактирование</option>
                      <option value="view">Только просмотр</option>
                    </select>
                  </div>

                  {/* Vacancies */}
                  <div className="bg-transparent border border-white/15 p-3 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-[#E7C768] shrink-0" />
                      <span>Вакансии компании</span>
                    </div>
                    <select
                      value={newPermissions.vacancies}
                      onChange={(e) => setNewPermissions({ ...newPermissions, vacancies: e.target.value as any })}
                      className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                    >
                      <option value="edit">Редактирование</option>
                      <option value="view">Только просмотр</option>
                    </select>
                  </div>

                  {/* CRM Candidates */}
                  <div className="bg-transparent border border-white/15 p-3 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-[#E7C768] shrink-0" />
                      <span>Кандидаты в CRM</span>
                    </div>
                    <select
                      value={newPermissions.crm_candidates}
                      onChange={(e) => setNewPermissions({ ...newPermissions, crm_candidates: e.target.value as any })}
                      className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                    >
                      <option value="edit">Редактирование</option>
                      <option value="view">Только просмотр</option>
                    </select>
                  </div>

                  {/* Style Editor */}
                  <div className="bg-transparent border border-white/15 p-3 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-[#E7C768] shrink-0" />
                      <span>Редактор стиля</span>
                    </div>
                    <select
                      value={newPermissions.style_editor}
                      onChange={(e) => setNewPermissions({ ...newPermissions, style_editor: e.target.value as any })}
                      className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                    >
                      <option value="edit">Редактирование</option>
                      <option value="view">Только просмотр</option>
                    </select>
                  </div>

                  {/* Training systems */}
                  <div className="bg-transparent border border-white/15 p-3 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-[#E7C768] shrink-0" />
                      <span>Системы обучения</span>
                    </div>
                    <select
                      value={newPermissions.training}
                      onChange={(e) => setNewPermissions({ ...newPermissions, training: e.target.value as any })}
                      className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                    >
                      <option value="edit">Редактирование</option>
                      <option value="view">Только просмотр</option>
                    </select>
                  </div>

                  {/* Interview systems */}
                  <div className="bg-transparent border border-white/15 p-3 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-[#E7C768] shrink-0" />
                      <span>Интервью и найм</span>
                    </div>
                    <select
                      value={newPermissions.interviews}
                      onChange={(e) => setNewPermissions({ ...newPermissions, interviews: e.target.value as any })}
                      className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-[#E7C768]"
                    >
                      <option value="edit">Редактирование</option>
                      <option value="view">Только просмотр</option>
                    </select>
                  </div>
                </div>

                {/* Additional creation checkboxes */}
                <div className="space-y-2 pt-2 border-t border-white/10 text-sm">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newPermissions.can_create_vacancies}
                      onChange={(e) => setNewPermissions({ ...newPermissions, can_create_vacancies: e.target.checked })}
                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                    />
                    <span>Разрешить создавать новые вакансии для этой компании</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newPermissions.can_create_trainings}
                      onChange={(e) => setNewPermissions({ ...newPermissions, can_create_trainings: e.target.checked })}
                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                    />
                    <span>Разрешить создавать новые обучающие курсы</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newPermissions.can_create_interviews}
                      onChange={(e) => setNewPermissions({ ...newPermissions, can_create_interviews: e.target.checked })}
                      className="w-4 h-4 rounded border-white/30 text-[#E7C768] focus:ring-0 cursor-pointer"
                    />
                    <span>Разрешить создавать новые системы интервью</span>
                  </label>
                </div>
              </div>

              {/* Action button */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSearchResult(null)}
                  className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-2 px-4 rounded-xl transition"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleAddMember}
                  disabled={isSubmitting}
                  className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-95 text-[#17344F] font-bold text-sm py-2 px-5 rounded-xl transition flex items-center gap-2 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? "Добавление..." : "Подключить к компании"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section: Current Team Members */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Состав участников компании
            </h4>
            <span className="text-xs text-slate-300 font-mono">
              Всего: {members.length + (owner ? 1 : 0)}
            </span>
          </div>

          {loading ? (
            <div className="text-sm text-slate-300 py-6 text-center">Загрузка команды...</div>
          ) : (
            <div className="space-y-3">
              {/* Owner card */}
              {owner && (
                <div className="bg-transparent border border-[#E7C768]/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-[#E7C768]" />
                      <span className="text-base font-bold text-white">
                        {owner.company_name || owner.contact_person || owner.email || "Владелец компании"}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-lg border border-[#E7C768]/60 text-[#E7C768]">
                        Материнский аккаунт
                      </span>
                    </div>
                    <div className="text-sm text-slate-300 flex items-center gap-3">
                      <span>UID: {owner.public_id || owner.id}</span>
                      {owner.email && <span>{owner.email}</span>}
                      {owner.phone && <span>{owner.phone}</span>}
                    </div>
                    <div className="text-xs text-slate-400">
                      Полный доступ ко всем модулям. Списание лимитов и балансов производится с этого аккаунта.
                    </div>
                  </div>
                </div>
              )}

              {/* Members cards */}
              {members.length === 0 ? (
                <div className="bg-transparent border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-300">
                  К этой компании еще не подключены приглашенные работодатели. Вы можете пригласить коллег по их UID, e-mail или телефону выше.
                </div>
              ) : (
                members.map((m) => {
                  const isEditing = editingMemberId === String(m.id);
                  const p: TeamMemberPermissions = m.permissions || defaultPermissions;

                  return (
                    <div 
                      key={m.id}
                      className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-[#E7C768]" />
                            <span className="text-base font-bold text-white">
                              {m.name || m.contact_person || m.email || "Участник команды"}
                            </span>
                            <span className="text-xs font-mono px-2 py-0.5 rounded-lg border border-white/20 text-slate-200">
                              UID: {m.public_id || m.employer_id}
                            </span>
                          </div>
                          {(m.email || m.phone) && (
                            <div className="text-sm text-slate-300 flex items-center gap-3">
                              {m.email && <span>{m.email}</span>}
                              {m.phone && <span>{m.phone}</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                setEditingMemberId(null);
                              } else {
                                setEditingMemberId(String(m.id));
                                setEditPermissions(p);
                              }
                            }}
                            className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768] text-sm font-bold py-1.5 px-3 rounded-xl transition flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{isEditing ? "Скрыть" : "Права"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(String(m.id), m.name || m.public_id || "участника")}
                            className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-slate-300 hover:text-white text-sm font-bold p-1.5 rounded-xl transition"
                            title="Отозвать доступ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Summary badges when not editing */}
                      {!isEditing && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="px-2.5 py-1 rounded-lg border border-white/15 text-slate-200">
                            Компания: <strong className="text-white">{p.company === "edit" ? "редактирование" : "просмотр"}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-lg border border-white/15 text-slate-200">
                            Вакансии: <strong className="text-white">{p.vacancies === "edit" ? "редактирование" : "просмотр"}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-lg border border-white/15 text-slate-200">
                            CRM: <strong className="text-white">{p.crm_candidates === "edit" ? "редактирование" : "просмотр"}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-lg border border-white/15 text-slate-200">
                            Стиль: <strong className="text-white">{p.style_editor === "edit" ? "редактирование" : "просмотр"}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-lg border border-white/15 text-slate-200">
                            Обучение: <strong className="text-white">{p.training === "edit" ? "редактирование" : "просмотр"}</strong>
                          </span>
                          <span className="px-2.5 py-1 rounded-lg border border-white/15 text-slate-200">
                            Интервью: <strong className="text-white">{p.interviews === "edit" ? "редактирование" : "просмотр"}</strong>
                          </span>
                          {p.can_create_vacancies && (
                            <span className="px-2.5 py-1 rounded-lg border border-[#E7C768]/40 text-[#E7C768]">
                              + создание вакансий
                            </span>
                          )}
                        </div>
                      )}

                      {/* Edit permissions form when open */}
                      {isEditing && (
                        <div className="bg-transparent border border-[#E7C768]/40 rounded-xl p-4 space-y-3">
                          <div className="text-sm font-bold text-[#E7C768]">
                            Изменение прав доступа:
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="bg-transparent border border-white/15 p-2.5 rounded-xl flex items-center justify-between gap-2">
                              <span>Компания</span>
                              <select
                                value={editPermissions.company}
                                onChange={(e) => setEditPermissions({ ...editPermissions, company: e.target.value as any })}
                                className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white"
                              >
                                <option value="edit">Редактирование</option>
                                <option value="view">Только просмотр</option>
                              </select>
                            </div>

                            <div className="bg-transparent border border-white/15 p-2.5 rounded-xl flex items-center justify-between gap-2">
                              <span>Вакансии</span>
                              <select
                                value={editPermissions.vacancies}
                                onChange={(e) => setEditPermissions({ ...editPermissions, vacancies: e.target.value as any })}
                                className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white"
                              >
                                <option value="edit">Редактирование</option>
                                <option value="view">Только просмотр</option>
                              </select>
                            </div>

                            <div className="bg-transparent border border-white/15 p-2.5 rounded-xl flex items-center justify-between gap-2">
                              <span>CRM Кандидаты</span>
                              <select
                                value={editPermissions.crm_candidates}
                                onChange={(e) => setEditPermissions({ ...editPermissions, crm_candidates: e.target.value as any })}
                                className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white"
                              >
                                <option value="edit">Редактирование</option>
                                <option value="view">Только просмотр</option>
                              </select>
                            </div>

                            <div className="bg-transparent border border-white/15 p-2.5 rounded-xl flex items-center justify-between gap-2">
                              <span>Редактор стиля</span>
                              <select
                                value={editPermissions.style_editor}
                                onChange={(e) => setEditPermissions({ ...editPermissions, style_editor: e.target.value as any })}
                                className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white"
                              >
                                <option value="edit">Редактирование</option>
                                <option value="view">Только просмотр</option>
                              </select>
                            </div>

                            <div className="bg-transparent border border-white/15 p-2.5 rounded-xl flex items-center justify-between gap-2">
                              <span>Обучение</span>
                              <select
                                value={editPermissions.training}
                                onChange={(e) => setEditPermissions({ ...editPermissions, training: e.target.value as any })}
                                className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white"
                              >
                                <option value="edit">Редактирование</option>
                                <option value="view">Только просмотр</option>
                              </select>
                            </div>

                            <div className="bg-transparent border border-white/15 p-2.5 rounded-xl flex items-center justify-between gap-2">
                              <span>Интервью</span>
                              <select
                                value={editPermissions.interviews}
                                onChange={(e) => setEditPermissions({ ...editPermissions, interviews: e.target.value as any })}
                                className="bg-[#17344F] border border-white/20 rounded-lg px-2 py-1 text-sm text-white"
                              >
                                <option value="edit">Редактирование</option>
                                <option value="view">Только просмотр</option>
                              </select>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-white/10 text-sm">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editPermissions.can_create_vacancies}
                                onChange={(e) => setEditPermissions({ ...editPermissions, can_create_vacancies: e.target.checked })}
                                className="w-4 h-4 rounded border-white/30 text-[#E7C768]"
                              />
                              <span>Разрешить создавать вакансии</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editPermissions.can_create_trainings}
                                onChange={(e) => setEditPermissions({ ...editPermissions, can_create_trainings: e.target.checked })}
                                className="w-4 h-4 rounded border-white/30 text-[#E7C768]"
                              />
                              <span>Разрешить создавать курсы обучения</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editPermissions.can_create_interviews}
                                onChange={(e) => setEditPermissions({ ...editPermissions, can_create_interviews: e.target.checked })}
                                className="w-4 h-4 rounded border-white/30 text-[#E7C768]"
                              />
                              <span>Разрешить создавать интервью</span>
                            </label>
                          </div>

                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setEditingMemberId(null)}
                              className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-1.5 px-3 rounded-xl transition"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdatePermissions(String(m.id))}
                              className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-sm py-1.5 px-4 rounded-xl transition"
                            >
                              Сохранить права
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer info & close */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <div className="text-xs text-slate-300">
            Режим команды «Робот Рекрутер» • Безопасное распределение доступа
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm py-2 px-5 rounded-xl transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}
