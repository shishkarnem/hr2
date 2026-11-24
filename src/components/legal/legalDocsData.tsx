import React from "react";
import OfferContent from "../OfferContent";

export type LegalDocType = "offer" | "privacy" | "terms" | "consent";
export type LegalAudience = "employer" | "candidate";

export interface LegalDocMeta {
  type: LegalDocType;
  title: string;
  shortLabel: string;
  route: string;
  versionDate: string;
}

export const CURRENT_LEGAL_DATE = "17.11.2026";
export const DEFAULT_PRODUCTION_DOMAIN = "hr-rr.ru";

const INTERNAL_PREVIEW_HOSTS = [".run.app", "localhost", "127.0.0.1", "0.0.0.0"];

function isInternalPreviewHost(host: string): boolean {
  const clean = host.toLowerCase().trim();
  if (!clean) return true;
  return INTERNAL_PREVIEW_HOSTS.some((marker) =>
    marker.startsWith(".") ? clean.endsWith(marker) : clean === marker
  );
}

export function getCurrentLegalDomain(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("hr-rr.ru")) return "hr-rr.ru";
    if (host.includes("hr-rr.online")) return "hr-rr.online";
    if (!isInternalPreviewHost(host)) return host;
  }
  return DEFAULT_PRODUCTION_DOMAIN;
}

export function getCurrentLegalLocation(): {
  domain: string;
  baseUrl: string;
  currentPageUrl: string;
} {
  const domain = getCurrentLegalDomain();
  const baseUrl = `https://${domain}`;
  if (typeof window !== "undefined") {
    const pathname = window.location.pathname || "/";
    const cleanPath = pathname === "/" ? "" : pathname;
    return {
      domain,
      baseUrl,
      currentPageUrl: `${baseUrl}${cleanPath}`,
    };
  }
  return {
    domain,
    baseUrl,
    currentPageUrl: baseUrl,
  };
}

export function getLegalDocsList(audience: LegalAudience): LegalDocMeta[] {
  if (audience === "candidate") {
    return [
      {
        type: "privacy",
        title: "Политика конфиденциальности соискателя",
        shortLabel: "Политика конфиденциальности",
        route: "/candidate-privacy",
        versionDate: CURRENT_LEGAL_DATE,
      },
      {
        type: "terms",
        title: "Пользовательское соглашение для соискателя",
        shortLabel: "Пользовательское соглашение",
        route: "/candidate-terms",
        versionDate: CURRENT_LEGAL_DATE,
      },
      {
        type: "consent",
        title: "Согласие соискателя на обработку персональных данных",
        shortLabel: "Согласие на обработку персональных данных",
        route: "/candidate-consent",
        versionDate: CURRENT_LEGAL_DATE,
      },
    ];
  }

  return [
    {
      type: "offer",
      title: "Публичная оферта",
      shortLabel: "Публичная оферта",
      route: "/offer",
      versionDate: CURRENT_LEGAL_DATE,
    },
    {
      type: "privacy",
      title: "Политика конфиденциальности",
      shortLabel: "Политика конфиденциальности",
      route: "/privacy",
      versionDate: CURRENT_LEGAL_DATE,
    },
    {
      type: "terms",
      title: "Пользовательское соглашение",
      shortLabel: "Пользовательское соглашение",
      route: "/terms",
      versionDate: CURRENT_LEGAL_DATE,
    },
    {
      type: "consent",
      title: "Согласие на обработку персональных данных",
      shortLabel: "Согласие на обработку персональных данных",
      route: "/consent",
      versionDate: CURRENT_LEGAL_DATE,
    },
  ];
}

export function getLegalDocMeta(docType: LegalDocType, audience: LegalAudience): LegalDocMeta {
  const list = getLegalDocsList(audience);
  return list.find((d) => d.type === docType) || list[0];
}

function GlassSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-transparent backdrop-blur-xl border border-[#E7C768]/25 rounded-2xl p-5 md:p-6 shadow-lg">
      <h2 className="text-base md:text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mb-3 tracking-tight">
        <span className="font-mono text-[14px] text-[#D99E41] mr-2">§ {n}</span>
        {title}
      </h2>
      <div className="text-[14px] text-slate-100 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function OperatorRequisites({ baseUrl, currentPageUrl }: { baseUrl: string; currentPageUrl: string }) {
  return (
    <GlassSection n="Реквизиты" title="Сведения об операторе платформы">
      <div className="bg-transparent backdrop-blur-md rounded-xl p-4 space-y-1.5 font-mono text-[14px] text-slate-100 border border-white/15 break-all">
        <div><span className="text-[#E7C768]">Наименование:</span> ООО «РентРоп»</div>
        <div><span className="text-[#E7C768]">ИНН / ОГРН:</span> 7726477438 / 1217700234157</div>
        <div><span className="text-[#E7C768]">Налоговый режим:</span> ОСН (НДС 5%)</div>
        <div><span className="text-[#E7C768]">Юридический адрес:</span> 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2</div>
        <div><span className="text-[#E7C768]">E-mail для обращений:</span> <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] underline">info@arenda-ropa.com</a></div>
        <div><span className="text-[#E7C768]">Платформа:</span> <a href={baseUrl} className="text-[#E7C768] underline">{baseUrl}</a></div>
        {currentPageUrl !== baseUrl && (
          <div><span className="text-[#E7C768]">Страница обращения:</span> <a href={currentPageUrl} className="text-[#E7C768] underline">{currentPageUrl}</a></div>
        )}
      </div>
    </GlassSection>
  );
}

function InlineUrl({ href, label }: { href: string; label?: string }) {
  return (
    <a href={href} className="text-[#E7C768] underline underline-offset-2 break-all">
      {label || href}
    </a>
  );
}

export function LegalDocContent({
  docType,
  audience,
  companyName,
  roleName,
}: {
  docType: LegalDocType;
  audience: LegalAudience;
  companyName?: string;
  roleName?: string;
}) {
  const { domain, baseUrl, currentPageUrl } = getCurrentLegalLocation();

  if (audience === "employer" && docType === "offer") {
    return <OfferContent />;
  }

  if (audience === "candidate") {
    const employerDisplay = companyName ? `«${companyName}»` : "выбранного работодателя";
    const vacancyDisplay = roleName ? `«${roleName}»` : "выбранную вакансию";

    if (docType === "privacy") {
      return (
        <div className="space-y-5">
          <header className="text-center space-y-2 pb-4 border-b border-white/15">
            <p className="text-[14px] text-[#E7C768] font-mono">Редакция от {CURRENT_LEGAL_DATE}</p>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
              Политика конфиденциальности соискателя
            </h1>
            <p className="text-[14px] text-slate-200">
              Порядок обработки персональных данных кандидатов на сайте <InlineUrl href={currentPageUrl} />
            </p>
          </header>

          <GlassSection n="1" title="Общие положения">
            <p>1.1. Настоящая Политика определяет порядок обработки и защиты персональных данных физических лиц (далее — «Соискатель»), регистрирующихся на странице компании или вакансии {employerDisplay} по адресу <InlineUrl href={currentPageUrl} /> с использованием платформы «Робот Рекрутер» (<InlineUrl href={baseUrl} label={domain} />), оператором которой является ООО «РентРоп».</p>
            <p>1.2. Документ разработан в соответствии с Федеральным законом РФ от 27.07.2006 № 152-ФЗ «О персональных данных».</p>
          </GlassSection>

          <GlassSection n="2" title="Состав обрабатываемых данных соискателя">
            <p>2.1. В рамках прохождения отклика, ИИ-интервью и обучения могут обрабатываться следующие данные:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>фамилия, имя и отчество;</li>
              <li>адрес электронной почты, номер телефона, логин мессенджера Telegram;</li>
              <li>сведения об опыте работы, резюме, ответы на вопросы скрининга и текстовых/голосовых интервью;</li>
              <li>результаты прохождения кейсов, тестов и модулей обучения по вакансии;</li>
              <li>технические данные (IP-адрес, сведения о браузере, cookie-файлы для сохранения сессии кабинета).</li>
            </ul>
          </GlassSection>

          <GlassSection n="3" title="Цели обработки и передача данных работодателю">
            <p>3.1. Данные обрабатываются для создания личного кабинета соискателя, проведения автоматизированного первичного интервью и онбординга, а также формирования итогового отчёта по вакансии {vacancyDisplay}.</p>
            <p>3.2. Результаты отклика, резюме и отчёты по прохождению этапов передаются уполномоченным представителям {employerDisplay}, разместившего вакансию на странице <InlineUrl href={currentPageUrl} />, для принятия кадрового решения.</p>
            <p>3.3. Платформа <InlineUrl href={baseUrl} label={domain} /> не передаёт данные соискателя сторонним лицам, не связанным с рассмотрением отклика или обеспечением работы сервиса.</p>
          </GlassSection>

          <GlassSection n="4" title="Хранение, защита и права соискателя">
            <p>4.1. Персональные данные хранятся на защищённых серверах в соответствии с требованиями законодательства РФ и с применением шифрования паролей и каналов связи.</p>
            <p>4.2. Соискатель вправе запросить уточнение, блокирование или удаление своих персональных данных, а также отозвать согласие, направив обращение на электронную почту <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] underline">info@arenda-ropa.com</a>.</p>
          </GlassSection>

          <OperatorRequisites baseUrl={baseUrl} currentPageUrl={currentPageUrl} />
        </div>
      );
    }

    if (docType === "terms") {
      return (
        <div className="space-y-5">
          <header className="text-center space-y-2 pb-4 border-b border-white/15">
            <p className="text-[14px] text-[#E7C768] font-mono">Редакция от {CURRENT_LEGAL_DATE}</p>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
              Пользовательское соглашение для соискателя
            </h1>
            <p className="text-[14px] text-slate-200">
              Правила использования личного кабинета соискателя на сайте <InlineUrl href={currentPageUrl} />
            </p>
          </header>

          <GlassSection n="1" title="Предмет соглашения">
            <p>1.1. Сайт <InlineUrl href={currentPageUrl} /> (платформа <InlineUrl href={baseUrl} label={domain} />) предоставляет Соискателю бесплатный доступ к личному кабинету кандидата для отклика на вакансию {vacancyDisplay}, прохождения автоматизированного ИИ-интервью и ознакомительного обучения компании {employerDisplay}.</p>
            <p>1.2. Использование сервисов платформы для Соискателя не требует оплаты и осуществляется добровольно.</p>
          </GlassSection>

          <GlassSection n="2" title="Права и обязанности соискателя">
            <p>2.1. Соискатель обязуется указывать достоверные контактные данные и сведения о профессиональном опыте, а также самостоятельно проходить этапы интервью и тестирования.</p>
            <p>2.2. Запрещается использовать автоматизированные скрипты для имитации ответов, пытаться нарушить работу ИИ-интервьюера или загружать вредоносные материалы.</p>
            <p>2.3. Соискатель сохраняет за собой доступ к материалам обучения и результатам собственных прохождений в рамках активной вакансии.</p>
          </GlassSection>

          <GlassSection n="3" title="Роль платформы и ответственность">
            <p>3.1. ООО «РентРоп» предоставляет технологическую инфраструктуру подбора и оценки на домене <InlineUrl href={baseUrl} label={domain} />, однако окончательное решение о приглашении на работу и заключении трудового или гражданско-правового договора принимает непосредственно работодатель ({employerDisplay}).</p>
            <p>3.2. По техническим вопросам работы кабинета Соискатель может обратиться на <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] underline">info@arenda-ropa.com</a>.</p>
          </GlassSection>

          <OperatorRequisites baseUrl={baseUrl} currentPageUrl={currentPageUrl} />
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <header className="text-center space-y-2 pb-4 border-b border-white/15">
          <p className="text-[14px] text-[#E7C768] font-mono">Редакция от {CURRENT_LEGAL_DATE}</p>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
            Согласие соискателя на обработку персональных данных
          </h1>
          <p className="text-[14px] text-slate-200">
            В соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных»
          </p>
        </header>

        <GlassSection n="1" title="Предоставляемое согласие">
          <p>Регистрируясь на странице <InlineUrl href={currentPageUrl} /> и откликаясь на вакансию {vacancyDisplay} через платформу <InlineUrl href={baseUrl} label={domain} />, я свободно, своей волей и в своём интересе даю согласие ООО «РентРоп» (ИНН 7726477438, ОГРН 1217700234157, 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2) и работодателю {employerDisplay} на обработку моих персональных данных.</p>
        </GlassSection>

        <GlassSection n="2" title="Перечень данных и действий с ними">
          <p>2.1. Согласие распространяется на: фамилию, имя, отчество; адрес электронной почты; номер контактного телефона; идентификатор Telegram; сведения резюме и опыта работы; аудио- и текстовые ответы в ходе интервью и обучения.</p>
          <p>2.2. Обработка включает сбор, запись, систематизацию, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передачу работодателю {employerDisplay}, обезличивание, блокирование и удаление данных с использованием средств автоматизации и ИИ-анализа.</p>
        </GlassSection>

        <GlassSection n="3" title="Срок действия и отзыв согласия">
          <p>3.1. Настоящее согласие действует с момента его предоставления до достижения целей содействия в трудоустройстве (проведения отбора и онбординга) либо до момента отзыва согласия субъектом персональных данных.</p>
          <p>3.2. Я уведомлён(а), что могу в любой момент отозвать настоящее согласие, направив уведомление в свободной форме на адрес <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] underline">info@arenda-ropa.com</a>.</p>
        </GlassSection>

        <OperatorRequisites baseUrl={baseUrl} currentPageUrl={currentPageUrl} />
      </div>
    );
  }

  // Audience: employer / platform-wide legal documents
  if (docType === "privacy") {
    return (
      <div className="space-y-5">
        <header className="text-center space-y-2 pb-4 border-b border-white/15">
          <p className="text-[14px] text-[#E7C768] font-mono">Редакция от {CURRENT_LEGAL_DATE}</p>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
            Политика конфиденциальности
          </h1>
          <p className="text-[14px] text-slate-200">
            Порядок сбора, хранения и защиты информации пользователей сайта <InlineUrl href={currentPageUrl} />
          </p>
        </header>

        <GlassSection n="1" title="Общие положения">
          <p>1.1. Настоящая Политика конфиденциальности регулирует обработку персональных данных и иной информации пользователей интернет-платформы «Робот Рекрутер» (<InlineUrl href={baseUrl} label={domain} />), включая страницу <InlineUrl href={currentPageUrl} />, оператором которой является ООО «РентРоп».</p>
          <p>1.2. Использование платформы, регистрация личного кабинета и проведение оплат означают согласие пользователя с условиями настоящей Политики.</p>
        </GlassSection>

        <GlassSection n="2" title="Какие данные мы собираем">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>регистрационные данные: ФИО, адрес электронной почты, контактный телефон, реквизиты компании;</li>
            <li>данные о платежах и начислениях цифровых единиц RR (история счетов, суммы, статусы транзакций без хранения реквизитов банковских карт — оплата проходит на защищённой стороне платёжного агрегатора «Робокасса»);</li>
            <li>материалы вакансий, баз знаний и настроек лендингов, загружаемые работодателем;</li>
            <li>технические метаданные сессии (cookie, IP-адрес, параметры браузера).</li>
          </ul>
        </GlassSection>

        <GlassSection n="3" title="Цели обработки данных">
          <p>3.1. Идентификация пользователя и предоставление доступа к личному кабинету, CRM-воронке и ИИ-инструментам подбора и обучения.</p>
          <p>3.2. Приём платежей, начисление баланса RR, направление фискальных чеков и уведомлений о статусе операций.</p>
          <p>3.3. Техническая поддержка, защита от несанкционированного доступа и выполнение требований законодательства Российской Федерации.</p>
        </GlassSection>

        <GlassSection n="4" title="Защита и передача данных третьим лицам">
          <p>4.1. Оператор применяет организационные и технические меры защиты данных (HTTPS-шифрование, разграничение прав доступа, резервное копирование).</p>
          <p>4.2. Данные передаются третьим лицам только в случаях, необходимых для работы сервиса (платёжный шлюз «Робокасса» для проведения платежей и фискализации чеков) либо по законному требованию государственных органов.</p>
          <p>4.3. Пользователь вправе запросить изменение или удаление данных по адресу <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] underline">info@arenda-ropa.com</a>.</p>
        </GlassSection>

        <OperatorRequisites baseUrl={baseUrl} currentPageUrl={currentPageUrl} />
      </div>
    );
  }

  if (docType === "terms") {
    return (
      <div className="space-y-5">
        <header className="text-center space-y-2 pb-4 border-b border-white/15">
          <p className="text-[14px] text-[#E7C768] font-mono">Редакция от {CURRENT_LEGAL_DATE}</p>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
            Пользовательское соглашение
          </h1>
          <p className="text-[14px] text-slate-200">
            Условия использования онлайн-сервиса «Робот Рекрутер» по адресу <InlineUrl href={currentPageUrl} />
          </p>
        </header>

        <GlassSection n="1" title="Статус соглашения и термины">
          <p>1.1. Настоящее Пользовательское соглашение регулирует отношения между ООО «РентРоп» (Администрация платформы) и лицом, использующим функционал сайта <InlineUrl href={baseUrl} label={domain} /> и его разделов, включая <InlineUrl href={currentPageUrl} /> (Пользователь).</p>
          <p>1.2. Платформа предоставляет программные инструменты автоматизации рекрутинга: создание лендингов вакансий, проведение ИИ-интервью, интерактивное обучение кандидатов и ведение базы откликов.</p>
        </GlassSection>

        <GlassSection n="2" title="Учётная запись и правила работы">
          <p>2.1. Пользователь обязуется обеспечивать конфиденциальность учётных данных и не передавать доступ третьим лицам без соответствующих полномочий.</p>
          <p>2.2. Пользователь несёт ответственность за законность размещаемых вакансий, текстов, изображений и соблюдение прав третьих лиц (в том числе при работе с персональными данными своих соискателей).</p>
          <p>2.3. Запрещено использовать сервис для рассылки спама, распространения запрещённой законом информации или проведения нагрузочных атак на инфраструктуру платформы.</p>
        </GlassSection>

        <GlassSection n="3" title="Платные функции и цифровые единицы RR">
          <p>3.1. Базовое ознакомление и стартовые бонусные единицы позволяют протестировать платформу. Пополнение баланса и приобретение пакетов лимитов регулируются <a href={`${baseUrl}/offer`} className="text-[#E7C768] underline">Публичной офертой</a>.</p>
          <p>3.2. Администрация оставляет за собой право обновлять алгоритмы ИИ, дизайн и перечень модулей сервиса для повышения качества его работы.</p>
        </GlassSection>

        <GlassSection n="4" title="Интеллектуальная собственность и разрешение споров">
          <p>4.1. Все элементы интерфейса, программный код, фирменная графика и тексты платформы принадлежат ООО «РентРоп».</p>
          <p>4.2. Споры разрешаются в досудебном претензионном порядке путём направления обращения на <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] underline">info@arenda-ropa.com</a> (срок ответа — до 10 рабочих дней), а при недостижении согласия — в соответствии с законодательством РФ.</p>
        </GlassSection>

        <OperatorRequisites baseUrl={baseUrl} currentPageUrl={currentPageUrl} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="text-center space-y-2 pb-4 border-b border-white/15">
        <p className="text-[14px] text-[#E7C768] font-mono">Редакция от {CURRENT_LEGAL_DATE}</p>
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
          Согласие на обработку персональных данных
        </h1>
        <p className="text-[14px] text-slate-200">
          В соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных»
        </p>
      </header>

      <GlassSection n="1" title="Субъект и оператор персональных данных">
        <p>Присоединяясь к настоящему Соглашению при регистрации, авторизации или оплате услуг на странице <InlineUrl href={currentPageUrl} /> платформы <InlineUrl href={baseUrl} label={domain} />, я (далее — «Пользователь») свободно, своей волей и в своём интересе даю согласие ООО «РентРоп» (ИНН 7726477438, ОГРН 1217700234157, 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2) на обработку моих персональных данных.</p>
      </GlassSection>

      <GlassSection n="2" title="Состав данных, цели и способы обработки">
        <p>2.1. Перечень обрабатываемых данных: фамилия, имя, отчество; адрес электронной почты; номер телефона; реквизиты организации или плательщика; сведения о транзакциях и заказах; технические данные (IP-адрес, файлы cookie).</p>
        <p>2.2. Цели обработки: регистрация и ведение личного кабинета работодателя, предоставление функционала платформы «Робот Рекрутер» (<InlineUrl href={baseUrl} label={domain} />), приём и обработка платежей через систему «Робокасса», формирование чеков, техническая поддержка и информирование пользователя.</p>
        <p>2.3. Обработка осуществляется смешанным способом (автоматизированным и неавтоматизированным) и включает сбор, запись, систематизацию, накопление, хранение, уточнение, извлечение, использование, передачу партнёрам по приёму платежей, блокирование и удаление данных.</p>
      </GlassSection>

      <GlassSection n="3" title="Срок действия и порядок отзыва">
        <p>3.1. Согласие действует в течение всего периода использования аккаунта и исполнения договорных обязательств, а также в сроки, предусмотренные законодательством РФ о бухгалтерском и налоговом учёте.</p>
        <p>3.2. Пользователь вправе отозвать согласие в любой момент, направив письменное уведомление на адрес электронной почты <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] underline">info@arenda-ropa.com</a>.</p>
      </GlassSection>

      <OperatorRequisites baseUrl={baseUrl} currentPageUrl={currentPageUrl} />
    </div>
  );
}
