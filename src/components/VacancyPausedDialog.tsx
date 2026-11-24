/**
 * Информационный диалог, показываемый кандидату, когда списать лимит интервью/обучения
 * у работодателя не удалось (вакансия фактически приостановлена). Показывает
 * публичные контакты работодателя из `get_vacancy_employer_contacts` RPC.
 */
import { useEffect, useState } from "react";
import { dbClient } from "@/lib/dbClient";
import { Mail, MessageCircle, AlertTriangle, X } from "lucide-react";

type ResponsibleContactItem = {
  id?: string;
  name?: string | null;
  roleTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  telegram?: string | null;
};

type Contacts = {
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_tg?: string | null;
  list?: ResponsibleContactItem[];
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
        if (d && (d.ok || d.email || d.phone || d.telegram || (Array.isArray(d.contacts) && d.contacts.length > 0))) {
          setContacts({
            company_name: d.company_name || d.companyName,
            contact_name: d.contact_name || d.name,
            contact_email: d.contact_email || d.email,
            contact_phone: d.contact_phone || d.phone,
            contact_tg: d.contact_tg || d.telegram,
            list: Array.isArray(d.contacts) ? d.contacts : [],
          });
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, projectId]);

  if (!open) return null;

  const listItems: ResponsibleContactItem[] =
    contacts?.list && contacts.list.length > 0
      ? contacts.list
      : contacts && (contacts.contact_name || contacts.contact_email || contacts.contact_phone || contacts.contact_tg)
      ? [
          {
            name: contacts.contact_name,
            email: contacts.contact_email,
            phone: contacts.contact_phone,
            telegram: contacts.contact_tg,
          },
        ]
      : [];

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
          <div className="relative z-10 rounded-2xl bg-transparent backdrop-blur-md border border-white/25 p-4 space-y-3 text-sm max-h-[45vh] overflow-y-auto">
            {contacts.company_name ? (
              <div className="font-bold text-[#E7C768]">{contacts.company_name}</div>
            ) : null}
            {listItems.length > 0 ? (
              <div className="space-y-3">
                {listItems.map((person, idx) => {
                  const tgClean = (person.telegram || "").replace(/^@/, "");
                  return (
                    <div
                      key={person.id || `${idx}`}
                      className={idx > 0 ? "pt-3 border-t border-white/15 space-y-1.5" : "space-y-1.5"}
                    >
                      {person.name ? (
                        <div className="font-semibold text-white">
                          {person.name}
                          {person.roleTitle ? <span className="text-white/70 font-normal"> · {person.roleTitle}</span> : null}
                        </div>
                      ) : null}
                      {person.email ? (
                        <a href={`mailto:${person.email}`} className="flex items-center gap-2 text-white hover:text-[#E7C768] break-all">
                          <Mail className="w-4 h-4 text-[#E7C768] shrink-0" /> {person.email}
                        </a>
                      ) : null}
                      {person.phone ? (
                        <a href={`tel:${person.phone}`} className="flex items-center gap-2 text-white hover:text-[#E7C768]">
                          <MessageCircle className="w-4 h-4 text-[#E7C768] shrink-0" /> {person.phone}
                        </a>
                      ) : null}
                      {tgClean ? (
                        <a href={`https://t.me/${tgClean}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white hover:text-[#E7C768]">
                          <MessageCircle className="w-4 h-4 text-[#E7C768] shrink-0" /> @{tgClean}
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-white/70">Контакты работодателя не указаны. Попробуйте позже.</div>
            )}
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