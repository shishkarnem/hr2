import React from "react";
import { Info, CheckCircle2 } from "lucide-react";

export interface TelegramTargetsValidation {
  personalTokens: string[];
  personalInvalid: string[];
  personalHasNegative: boolean;
  groupTokens: string[];
  groupInvalid: string[];
  groupNeedsSupergroup: string[];
  groupHasPositive: boolean;
  channelTokens: string[];
  channelInvalid: string[];
  hasErrors: boolean;
}

export function splitTargetsRaw(raw: string): string[] {
  return String(raw || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeTargetsCommaList(raw: string): string {
  return Array.from(new Set(splitTargetsRaw(raw))).join(", ");
}

export function validateTelegramTargetsInput(
  personalRaw: string,
  groupRaw: string,
  channelRaw: string
): TelegramTargetsValidation {
  const personalTokens = splitTargetsRaw(personalRaw);
  const personalInvalid: string[] = [];
  let personalHasNegative = false;

  for (const t of personalTokens) {
    if (/^-\d+$/.test(t)) {
      personalHasNegative = true;
      personalInvalid.push(t);
    } else if (!/^\d{5,20}$/.test(t)) {
      personalInvalid.push(t);
    }
  }

  const groupTokens = splitTargetsRaw(groupRaw);
  const groupInvalid: string[] = [];
  const groupNeedsSupergroup: string[] = [];
  let groupHasPositive = false;

  for (const t of groupTokens) {
    if (/^\d+$/.test(t)) {
      groupHasPositive = true;
      groupInvalid.push(t);
    } else if (/^-\d{5,20}$/.test(t)) {
      if (!t.startsWith("-100")) {
        groupNeedsSupergroup.push(t);
      }
    } else {
      groupInvalid.push(t);
    }
  }

  const channelTokens = splitTargetsRaw(channelRaw);
  const channelInvalid: string[] = [];

  for (const t of channelTokens) {
    const clean = t.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "").replace(/\/+$/, "");
    if (/^-100\d{5,20}$/.test(clean) || /^-\d{5,20}$/.test(clean)) {
      continue;
    }
    const withAt = clean.startsWith("@") ? clean : `@${clean}`;
    if (!/^@[A-Za-z0-9_]{3,64}$/.test(withAt)) {
      channelInvalid.push(t);
    }
  }

  return {
    personalTokens,
    personalInvalid,
    personalHasNegative,
    groupTokens,
    groupInvalid,
    groupNeedsSupergroup,
    groupHasPositive,
    channelTokens,
    channelInvalid,
    hasErrors:
      personalInvalid.length > 0 || groupInvalid.length > 0 || channelInvalid.length > 0,
  };
}

interface Props {
  personalIds: string;
  onPersonalIdsChange: (val: string) => void;
  groupIds: string;
  onGroupIdsChange: (val: string) => void;
  channelIds: string;
  onChannelIdsChange: (val: string) => void;
}

export default function TelegramTargetsEditor({
  personalIds,
  onPersonalIdsChange,
  groupIds,
  onGroupIdsChange,
  channelIds,
  onChannelIdsChange,
}: Props) {
  const v = validateTelegramTargetsInput(personalIds, groupIds, channelIds);

  return (
    <div className="space-y-4">
      <div className="bg-transparent border border-white/20 rounded-2xl p-4 text-[14px] text-white leading-relaxed space-y-2.5 backdrop-blur-md">
        <div className="font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent text-[14px]">
          Подключение Telegram-бота для оповещений:
        </div>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-200 text-[14px]">
          <li>
            Откройте бота{" "}
            <a
              href="https://t.me/RoboRecrutBot"
              target="_blank"
              rel="noreferrer"
              className="underline bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent font-mono font-bold"
            >
              @RoboRecrutBot
            </a>{" "}
            и нажмите <b>Start</b> (без этого бот не сможет писать в личные сообщения).
          </li>
          <li>
            Нажмите кнопку <b>Мой ID</b> в меню бота или отправьте <code className="font-mono text-[#F4EE8E]">/id</code> — бот пришлёт положительный числовой ID для поля «личные чаты».
          </li>
          <li>
            Несколько значений можно перечислять <b>через запятую — с пробелом или без пробела</b> (например, <code className="font-mono text-white">123456789, 987654321</code> или <code className="font-mono text-white">123456789,987654321</code> — оба варианта сохраняются верно).
          </li>
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
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-[14px] text-slate-200 font-bold">
            ID личных чатов Telegram (личка):
          </label>
          {v.personalTokens.length > 0 && v.personalInvalid.length === 0 && (
            <span className="inline-flex items-center gap-1.5 text-[14px] text-[#F4EE8E]">
              <CheckCircle2 className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Корректный личный ID ({v.personalTokens.length})</span>
            </span>
          )}
        </div>
        <input
          type="text"
          value={personalIds}
          onChange={(e) => onPersonalIdsChange(e.target.value)}
          placeholder="например: 123456789, 987654321"
          className={`w-full bg-transparent border rounded-xl px-3.5 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none transition-colors ${
            v.personalInvalid.length > 0 ? "border-[#E7C768]" : "border-white/20 focus:border-[#E7C768]"
          }`}
        />
        <p className="text-[14px] text-slate-300">
          Указываются положительные числа без минуса (ID пользователя). Если поле очистить и нажать «Сохранить», личные ID удаляются из базы данных.
        </p>
        {v.personalInvalid.length > 0 && (
          <div className="bg-transparent border border-[#E7C768]/70 rounded-xl px-3.5 py-2.5 text-[14px] text-[#F4EE8E] flex items-start gap-2 backdrop-blur-md">
            <Info className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
            <div className="space-y-1">
              {v.personalHasNegative ? (
                <div>
                  Значение с минусом (<span className="font-mono">{v.personalInvalid.join(", ")}</span>) — это <b>ID группы или супергруппы</b>, а не личный чат. Перенесите его в поле «ID групповых чатов» ниже.
                </div>
              ) : (
                <div>
                  Для личных чатов нужен только числовой Telegram ID (без @ и ссылок). Некорректно: <span className="font-mono">{v.personalInvalid.join(", ")}</span>. Узнайте ID через бота <span className="font-mono">@RoboRecrutBot</span>.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Group Chat IDs */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-[14px] text-slate-200 font-bold">
            ID групповых чатов (для команд и отделов):
          </label>
          {v.groupTokens.length > 0 && v.groupInvalid.length === 0 && v.groupNeedsSupergroup.length === 0 && (
            <span className="inline-flex items-center gap-1.5 text-[14px] text-[#F4EE8E]">
              <CheckCircle2 className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Супергруппа определена ({v.groupTokens.length})</span>
            </span>
          )}
        </div>
        <input
          type="text"
          value={groupIds}
          onChange={(e) => onGroupIdsChange(e.target.value)}
          placeholder="например: -1001234567890, -1009876543210"
          className={`w-full bg-transparent border rounded-xl px-3.5 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none transition-colors ${
            v.groupInvalid.length > 0 || v.groupNeedsSupergroup.length > 0
              ? "border-[#E7C768]"
              : "border-white/20 focus:border-[#E7C768]"
          }`}
        />
        <p className="text-[14px] text-slate-300">
          ID супергруппы начинается с <code className="font-mono text-white">-100...</code> (через запятую, пробел после запятой не обязателен). Бот должен быть добавлен в группу и желательно назначен администратором.
        </p>

        {v.groupNeedsSupergroup.length > 0 && (
          <div className="bg-transparent border border-[#E7C768]/70 rounded-xl px-3.5 py-2.5 text-[14px] text-[#F4EE8E] flex items-start gap-2 backdrop-blur-md">
            <Info className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div>
                ID <span className="font-mono">{v.groupNeedsSupergroup.join(", ")}</span> похож на обычную группу (без префикса <span className="font-mono">-100</span>). Для стабильной доставки и переходов переведите группу в <b>супергруппу</b>:
              </div>
              <div className="text-slate-200">
                Откройте настройки группы → «Изменить» → «История чата для новых участников» → выберите «Видна» (или назначьте бота администратором с правами управления сообщениями), затем снова отправьте <code className="font-mono text-[#F4EE8E]">/id</code> — ID обновится на формат <code className="font-mono text-white">-100...</code>.
              </div>
            </div>
          </div>
        )}

        {v.groupInvalid.length > 0 && (
          <div className="bg-transparent border border-[#E7C768]/70 rounded-xl px-3.5 py-2.5 text-[14px] text-[#F4EE8E] flex items-start gap-2 backdrop-blur-md">
            <Info className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
            <div>
              {v.groupHasPositive ? (
                <span>
                  Положительные ID (<span className="font-mono">{v.groupInvalid.join(", ")}</span>) относятся к личным чатам, а не группам. ID группы всегда начинается с минуса (<span className="font-mono">-100...</span>).
                </span>
              ) : (
                <span>
                  Для групп нужен числовой ID вида <span className="font-mono">-1001234567890</span>. Проверьте: <span className="font-mono">{v.groupInvalid.join(", ")}</span>. Добавьте бота в группу и отправьте <span className="font-mono">/id</span>.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Public Channel IDs */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-[14px] text-slate-200 font-bold">
            Каналы и публичные ссылки (username, t.me или -100...):
          </label>
          {v.channelTokens.length > 0 && v.channelInvalid.length === 0 && (
            <span className="inline-flex items-center gap-1.5 text-[14px] text-[#F4EE8E]">
              <CheckCircle2 className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span>Каналы распознаны ({v.channelTokens.length})</span>
            </span>
          )}
        </div>
        <input
          type="text"
          value={channelIds}
          onChange={(e) => onChannelIdsChange(e.target.value)}
          placeholder="например: @company_vacancies, https://t.me/hr_announcements"
          className={`w-full bg-transparent border rounded-xl px-3.5 py-2.5 text-[14px] text-white font-mono placeholder-slate-400 focus:outline-none transition-colors ${
            v.channelInvalid.length > 0 ? "border-[#E7C768]" : "border-white/20 focus:border-[#E7C768]"
          }`}
        />
        <p className="text-[14px] text-slate-300">
          Для приватных каналов укажите ID вида <code className="font-mono text-white">-100...</code>, для публичных — <code className="font-mono text-white">@channel</code> или ссылку <code className="font-mono text-white">https://t.me/channel</code>. Бот должен быть администратором канала с правом публикации.
        </p>
        {v.channelInvalid.length > 0 && (
          <div className="bg-transparent border border-[#E7C768]/70 rounded-xl px-3.5 py-2.5 text-[14px] text-[#F4EE8E] flex items-start gap-2 backdrop-blur-md">
            <Info className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
            <div>
              Проверьте формат канала (<span className="font-mono">{v.channelInvalid.join(", ")}</span>): допускаются <span className="font-mono">@username</span>, ссылка <span className="font-mono">https://t.me/...</span> или ID <span className="font-mono">-100...</span> через запятую (с пробелом или без).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
