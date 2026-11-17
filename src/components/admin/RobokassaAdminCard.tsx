import React, { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw, Save, ShieldCheck, Database, CreditCard, ChevronDown, ChevronUp } from "lucide-react";

interface RobokassaSettings {
  merchantLogin: string;
  password1: string;
  password2: string;
  isTest: boolean;
  taxRate: string | null;
  itemName: string;
  domain1: string;
  domain2: string;
}

const DEFAULT_SETTINGS: RobokassaSettings = {
  merchantLogin: "qaiz",
  password1: "hrPass1_2026",
  password2: "hrPass2_2026",
  isTest: false,
  taxRate: null,
  itemName: "Цифровые единицы RR",
  domain1: "https://hr-rr.online",
  domain2: "https://hr-rr.ru",
};

export default function RobokassaAdminCard() {
  const [settings, setSettings] = useState<RobokassaSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDocsOpen, setIsDocsOpen] = useState(true);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/robokassa/settings");
      if (res.ok) {
        const data = await res.json();
        if (data?.settings) {
          setSettings(data.settings);
        }
      }
    } catch (err) {
      console.warn("Could not load Robokassa settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/robokassa/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.settings) setSettings(data.settings);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const cleanDomain1 = (settings.domain1 || "https://hr-rr.online").replace(/\/$/, "");
  const cleanDomain2 = (settings.domain2 || "https://hr-rr.ru").replace(/\/$/, "");

  return (
    <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 md:p-6 shadow-xl space-y-6 text-white text-[14px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl border border-[#d4af37]/60 flex items-center justify-center text-[#fceabb] bg-transparent">
            <CreditCard className="w-5 h-5 text-[#E7C768]" />
          </div>
          <div>
            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
              <span>Интеграция Робокассы и PostgreSQL база данных оплат</span>
              <span className="text-[14px] font-mono px-2.5 py-0.5 rounded-xl border border-[#d4af37] text-[#fceabb]">
                {settings.isTest ? "тестовый режим" : "боевой режим"}
              </span>
            </h3>
            <p className="text-[14px] text-white/70 mt-0.5">
              Управление магазином, хэш-подписью MD5, фискальным чеком (Receipt) и синхронизацией таблиц
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadSettings}
            disabled={loading}
            className="p-2 rounded-xl border border-white/20 hover:border-white/40 text-white/80 hover:text-white transition"
            title="Обновить настройки из БД"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsDocsOpen(!isDocsOpen)}
            className="inline-flex items-center gap-1.5 text-[14px] font-bold px-3 py-1.5 rounded-xl border border-white/20 hover:border-[#d4af37] text-white transition"
          >
            <span>{isDocsOpen ? "Свернуть инструкцию" : "Развернуть инструкцию"}</span>
            {isDocsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Идентификатор магазина (Merchant Login)</label>
            <input
              type="text"
              value={settings.merchantLogin}
              onChange={(e) => setSettings({ ...settings, merchantLogin: e.target.value })}
              className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-white font-mono text-[14px] focus:outline-none focus:border-[#d4af37]"
              placeholder="qaiz"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Пароль #1 (Password 1 — генерация ссылки)</label>
            <input
              type="text"
              value={settings.password1}
              onChange={(e) => setSettings({ ...settings, password1: e.target.value })}
              className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-white font-mono text-[14px] focus:outline-none focus:border-[#d4af37]"
              placeholder="hrPass1_2026"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Пароль #2 (Password 2 — проверка Result URL)</label>
            <input
              type="text"
              value={settings.password2}
              onChange={(e) => setSettings({ ...settings, password2: e.target.value })}
              className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-white font-mono text-[14px] focus:outline-none focus:border-[#d4af37]"
              placeholder="hrPass2_2026"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Наименование услуги/товара в чеке</label>
            <input
              type="text"
              value={settings.itemName}
              onChange={(e) => setSettings({ ...settings, itemName: e.target.value })}
              className="w-full bg-transparent border border-white/20 rounded-xl px-3.5 py-2.5 text-white text-[14px] focus:outline-none focus:border-[#d4af37]"
              placeholder="Цифровые единицы RR"
              required
            />
            <p className="text-[12px] text-white/60">Дословно из договора публичной оферты</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Ставка НДС (tax в объекте Receipt)</label>
            <input
              type="text"
              value={settings.taxRate ?? "null"}
              disabled
              className="w-full bg-transparent border border-white/10 rounded-xl px-3.5 py-2.5 text-white/60 font-mono text-[14px]"
            />
            <p className="text-[12px] text-white/60">По закону РФ: tax = null (ОСН НДС 5% указан в оферте)</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Тестовый режим (IsTest)</label>
            <div className="pt-2">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.isTest}
                  onChange={(e) => setSettings({ ...settings, isTest: e.target.checked })}
                  className="w-4 h-4 rounded accent-[#E7C768]"
                />
                <span className="text-[14px] text-white/85">Включить тестовую оплату без списания реальных рублей</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {saveSuccess && (
            <span className="text-[#fceabb] font-semibold text-[14px] inline-flex items-center gap-1.5">
              <Check className="w-4 h-4 text-[#E7C768]" />
              <span>Настройки успешно сохранены в базе данных ProTalk (таблица system_configs)!</span>
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#d4af37] bg-transparent text-[#fceabb] font-bold text-[14px] shadow-[0_0_14px_rgba(212,175,55,0.25)] hover:brightness-110 active:scale-95 transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Сохранение..." : "Сохранить настройки в базе данных"}</span>
          </button>
        </div>
      </form>

      {/* Documentation & Copy Settings Accordion */}
      {isDocsOpen && (
        <div className="space-y-5 pt-4 border-t border-white/10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Domain 1: hr-rr.online */}
            <div className="p-4 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[15px] font-bold text-[#fceabb]">Кабинет Робокассы 1: {cleanDomain1}</h4>
                <a
                  href="https://merchant.robokassa.ru"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#E7C768] hover:underline inline-flex items-center gap-1 text-[12px]"
                >
                  <span>Кабинет</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="space-y-2 text-[13px] font-mono">
                <div className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-transparent">
                  <div className="truncate mr-2">
                    <span className="text-slate-400 block text-[11px] font-sans">Result URL:</span>
                    <span className="text-white">{cleanDomain1}/api/payments/robokassa/result</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${cleanDomain1}/api/payments/robokassa/result`, "d1_result")}
                    className="p-1.5 rounded-lg border border-white/20 hover:border-white/40 text-white shrink-0"
                    title="Копировать"
                  >
                    {copiedKey === "d1_result" ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-transparent">
                  <div className="truncate mr-2">
                    <span className="text-slate-400 block text-[11px] font-sans">Success URL:</span>
                    <span className="text-white">{cleanDomain1}/payment/success</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${cleanDomain1}/payment/success`, "d1_success")}
                    className="p-1.5 rounded-lg border border-white/20 hover:border-white/40 text-white shrink-0"
                    title="Копировать"
                  >
                    {copiedKey === "d1_success" ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-transparent">
                  <div className="truncate mr-2">
                    <span className="text-slate-400 block text-[11px] font-sans">Fail URL:</span>
                    <span className="text-white">{cleanDomain1}/payment/fail</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${cleanDomain1}/payment/fail`, "d1_fail")}
                    className="p-1.5 rounded-lg border border-white/20 hover:border-white/40 text-white shrink-0"
                    title="Копировать"
                  >
                    {copiedKey === "d1_fail" ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Domain 2: hr-rr.ru */}
            <div className="p-4 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[15px] font-bold text-[#fceabb]">Кабинет Робокассы 2: {cleanDomain2}</h4>
                <a
                  href="https://merchant.robokassa.ru"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#E7C768] hover:underline inline-flex items-center gap-1 text-[12px]"
                >
                  <span>Кабинет</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="space-y-2 text-[13px] font-mono">
                <div className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-transparent">
                  <div className="truncate mr-2">
                    <span className="text-slate-400 block text-[11px] font-sans">Result URL:</span>
                    <span className="text-white">{cleanDomain2}/api/payments/robokassa/result</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${cleanDomain2}/api/payments/robokassa/result`, "d2_result")}
                    className="p-1.5 rounded-lg border border-white/20 hover:border-white/40 text-white shrink-0"
                    title="Копировать"
                  >
                    {copiedKey === "d2_result" ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-transparent">
                  <div className="truncate mr-2">
                    <span className="text-slate-400 block text-[11px] font-sans">Success URL:</span>
                    <span className="text-white">{cleanDomain2}/payment/success</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${cleanDomain2}/payment/success`, "d2_success")}
                    className="p-1.5 rounded-lg border border-white/20 hover:border-white/40 text-white shrink-0"
                    title="Копировать"
                  >
                    {copiedKey === "d2_success" ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl border border-white/10 bg-transparent">
                  <div className="truncate mr-2">
                    <span className="text-slate-400 block text-[11px] font-sans">Fail URL:</span>
                    <span className="text-white">{cleanDomain2}/payment/fail</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${cleanDomain2}/payment/fail`, "d2_fail")}
                    className="p-1.5 rounded-lg border border-white/20 hover:border-white/40 text-white shrink-0"
                    title="Копировать"
                  >
                    {copiedKey === "d2_fail" ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Database Architecture & Receipt Specification */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-2.5">
              <h5 className="font-bold text-[#fceabb] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#E7C768]" />
                <span>Фискальный чек (Receipt) и расчет подписи MD5</span>
              </h5>
              <div className="space-y-1.5 text-white/85 text-[13px] leading-relaxed">
                <div>
                  <strong className="text-white">Параметр Receipt:</strong>{" "}
                  <code className="text-[#fceabb] bg-white/5 px-1.5 py-0.5 rounded">
                    {`{"items":[{"name":"${settings.itemName}","quantity":кол-во,"sum":СУММА,"tax":null}]}`}
                  </code>
                </div>
                <div>
                  <strong className="text-white">Формула MD5 инициализации:</strong>{" "}
                  <code className="text-[#fceabb] bg-white/5 px-1.5 py-0.5 rounded break-all">
                    MerchantLogin:OutSum:InvId:Receipt:Pass1:Shp_employerId=...:Shp_rrAmount=...:Shp_userId=...
                  </code>
                </div>
                <div>
                  <strong className="text-white">Формула MD5 Result URL:</strong>{" "}
                  <code className="text-[#fceabb] bg-white/5 px-1.5 py-0.5 rounded break-all">
                    OutSum:InvId:Pass2:Shp_employerId=...:Shp_rrAmount=...:Shp_userId=...
                  </code>
                </div>
                <div>
                  <strong className="text-white">Ответ серверу Робокассы:</strong>{" "}
                  <code className="text-[#fceabb] bg-white/5 px-1.5 py-0.5 rounded">OK[InvId]</code> (например, <code>OK10001</code>)
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-2.5">
              <h5 className="font-bold text-[#fceabb] flex items-center gap-1.5 text-[14px]">
                <Database className="w-4 h-4 text-[#E7C768]" />
                <span>Связанные таблицы PostgreSQL и триггеры пересчета</span>
              </h5>
              <ul className="space-y-1 text-white/85 text-[14px] leading-relaxed">
                <li>
                  • <strong className="text-white">payments_robokassa:</strong> номер счета <code>inv_id</code>, сумма <code>amount_rub</code>, ресурс <code>rr_Resource</code>, статус <code>completed</code>.
                </li>
                <li>
                  • <strong className="text-white">wallets:</strong> кошелек компании с полем <code>units_balance</code>.
                </li>
                <li>
                  • <strong className="text-white">transactions:</strong> проводка пополнения <code>topup</code> с пересчетом баланса.
                </li>
                <li>
                  • <strong className="text-white">payments:</strong> единый журнал выставленных и оплаченных счетов.
                </li>
                <li>
                  • <strong className="text-white">payment_history:</strong> история начислений с комментарием и номером чека.
                </li>
                <li>
                  • <strong className="text-white">recalculateEmployerBalances:</strong> функция пересчета балансов в БД и отправка уведомления в Telegram.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
