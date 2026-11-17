/**
 * Информационный диалог, показываемый кандидату, когда списать лимит интервью/обучения
 * у работодателя не удалось (вакансия фактически приостановлена). Показывает
 * публичные контакты работодателя из `get_vacancy_employer_contacts` RPC.
 */
import { useEffect, useState } from "react";
import { dbClient } from "@/lib/dbClient";
import { Mail, MessageCircle, AlertTriangle, X } from "lucide-react";

type Contacts = {
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_tg?: string | null;
};

export function VacancyPausedDialog({
  open,
  projectId,
  onClose,
}: {
  open: boolean;
  projectId: string | null | undefined;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await dbClient.rpc("get_vacancy_employer_contacts", { _project_id: projectId });
        if (cancelled) return;
        const d: any = data;
        if (d?.ok) setContacts({
          company_name: d.company_name,
          contact_name: d.contact_name,
          contact_email: d.contact_email,
          contact_tg: d.contact_tg,
        });
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, projectId]);

  if (!open) return null;

  const tg = (contacts?.contact_tg || "").replace(/^@/, "");

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-transparent backdrop-blur-md">
      <div className="brand-editor relative max-w-md w-full rounded-3xl p-6 space-y-4 bg-transparent backdrop-blur-2xl border border-[#E7C768]/40 shadow-2xl text-white overflow-hidden">
        <button onClick={onClose} className="absolute top-3 right-3 z-20 text-white/70 hover:text-white cursor-pointer" aria-label="Закрыть">
          <X className="w-5 h-5" />
        </button>
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-transparent backdrop-blur-md border border-[#E7C768]/40 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[#E7C768]" />
          </div>
          <h3 className="font-extrabold text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            Вакансия временно приостановлена
          </h3>
        </div>
        <p className="relative z-10 text-sm text-white/90 leading-relaxed">
          Работодатель приостановил приём на этой вакансии или закончились оплаченные лимиты ИИ-этапов.
          Пожалуйста, свяжитесь с работодателем напрямую по контактам ниже — он сообщит, когда отбор возобновится.
        </p>
        {loading ? (
          <div className="relative z-10 text-sm text-white/70">Загружаем контакты…</div>
        ) : contacts ? (
          <div className="relative z-10 rounded-2xl bg-transparent backdrop-blur-md border border-white/25 p-4 space-y-2 text-sm">
            {contacts.company_name ? (
              <div className="font-bold text-[#E7C768]">{contacts.company_name}</div>
            ) : null}
            {contacts.contact_name ? (
              <div className="text-white/90">{contacts.contact_name}</div>
            ) : null}
            {contacts.contact_email ? (
              <a href={`mailto:${contacts.contact_email}`} className="flex items-center gap-2 text-white hover:text-[#E7C768]">
                <Mail className="w-4 h-4 text-[#E7C768]" /> {contacts.contact_email}
              </a>
            ) : null}
            {tg ? (
              <a href={`https://t.me/${tg}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white hover:text-[#E7C768]">
                <MessageCircle className="w-4 h-4 text-[#E7C768]" /> @{tg}
              </a>
            ) : null}
            {!contacts.contact_email && !tg ? (
              <div className="text-sm text-white/70">Контакты работодателя не указаны. Попробуйте позже.</div>
            ) : null}
          </div>
        ) : null}
        <div className="relative z-10 flex justify-end">
          <button onClick={onClose} className="btn-brand-primary text-sm px-4 py-2 rounded-xl cursor-pointer">Понятно</button>
        </div>
      </div>
    </div>
  );
}

/** Возвращает true, если ошибка похожа на «нет кредитов / вакансия приостановлена». */
export function isVacancyPausedError(err: unknown): boolean {
  const m = String((err as any)?.message || err || "").toLowerCase();
  return /no_credits|insufficient|billing_failed|forbidden/.test(m);
}