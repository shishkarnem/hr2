/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import RRImage from "@/components/RRImage";
import PasswordField from "@/components/PasswordField";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import TrainingCoursePreview from "../components/TrainingCoursePreview";
import CandidateStageTraining from "../components/CandidateStageTraining";
import CandidateInterview from "../components/CandidateInterview";
import TabbedChecklistBlock from "../components/TabbedChecklistBlock";
import CandidatePayoutsBlock from "@/components/CandidatePayoutsBlock";
import CandidateScheduleBlock from "@/components/CandidateScheduleBlock";
import CandidateTeamBlock from "@/components/CandidateTeamBlock";
import CandidateSystemBlock from "@/components/CandidateSystemBlock";
import CandidateOnboardingBlock from "@/components/CandidateOnboardingBlock";
import CandidateVacancyBlock from "@/components/CandidateVacancyBlock";
import { CandidateFieldsEditorBlock } from "@/components/CandidateFieldsEditorBlock";
import AcademyModal from "@/components/AcademyModal";
import { useAIWait } from "@/components/AIWaitProvider";
import NotificationsBell from "@/components/NotificationsBell";
import HireDecisionBanner from "@/components/HireDecisionBanner";
import Reveal from "@/components/Reveal";
import { useLandingTheme } from "@/components/LandingStyleEditor";
import { CompanyThemedLogo } from "@/components/CompanyThemedLogo";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";
import { JobProject, Candidate, Message, TrainingBlock } from "../types";
import { FN } from "@/config";
import { getCandidateSession, saveCandidateSession, clearCandidateSession } from "@/lib/candidateSession";
import { resizeToWebP, cropToSquareWebP } from "@/lib/imageResize";
import { getUploadService } from "@/services/FileUploadService";
import {
  FileText,
  Upload,
  Send,
  Award,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Cpu,
  Bookmark,
  CheckCircle,
  CheckCircle2,
  HelpCircle,
  X,
  ExternalLink,
  Menu,
  User,
  Building,
  Clock,
  Coins,
  Users,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Mail,
  Loader2,
} from "lucide-react";

const get20ChecklistQuestions = (role: string) => {
  const normRole = (role || "").toLowerCase();
  
  let selectQs: any[] = [];
  let textQs: any[] = [];

  if (normRole.includes("продаж") || normRole.includes("торгов") || normRole.includes("клиент")) {
    selectQs = [
      {
        question: "Какая основная цель первого ('холодного') звонка клиенту?",
        type: "select",
        options: [
          "Сразу продать самый дорогой продукт",
          "Завязать контакт, выявить ЛПР и договориться о встрече или следующем шаге",
          "Попросить у клиента личный номер телефона его руководителя",
          "Прочитать весь текст регламента до конца любой ценой"
        ],
        correctAnswer: "Завязать контакт, выявить ЛПР и договориться о встрече или следующем шаге"
      },
      {
        question: "Если клиент говорит: 'Мне это сейчас не интересно', каков лучший ответ?",
        type: "select",
        options: [
          "Сказать 'Хорошо, жаль' и сразу положить трубку",
          "Уточнить: 'Понимаю вашу занятость. Подскажите, вы не заинтересованы именно в [ценность продукта] или просто нет времени?'",
          "Спросить 'А почему вам не интересно то, что приносит миллионы?!'",
          "Продолжать настойчиво читать скрипт без пауз"
        ],
        correctAnswer: "Уточнить: 'Понимаю вашу занятость. Подскажите, вы не заинтересованы именно в [ценность продукта] или просто нет времени?'"
      },
      {
        question: "Что из перечисленного является базовым этапом классических продаж?",
        type: "select",
        options: [
          "Покупка рекламы в Яндексе",
          "Определение бюджетирования компании куратором",
          "Отработка возражений и закрытие сделки",
          "Перевод клиента на другого менеджера"
        ],
        correctAnswer: "Отработка возражений и закрытие сделки"
      },
      {
        question: "Какая CRM-система наиболее популярна в СНГ для автоматизации продаж и контроля звонков?",
        type: "select",
        options: ["Jira", "Figma", "amoCRM", "Visual Studio Code"],
        correctAnswer: "amoCRM"
      },
      {
        question: "Как расшифровывается понятие 'ЛПР' в деловом мире?",
        type: "select",
        options: [
          "Личный Помощник Руководителя",
          "Лицо, принимающее решения",
          "Локальный Представитель Робототехники",
          "Лучший Продавец Региона"
        ],
        correctAnswer: "Лицо, принимающее решения"
      },
      {
        question: "Что означает средний чек (Average Ticket) компании?",
        type: "select",
        options: [
          "Длина квитанции в кассе",
          "Общая выручка, разделенная на количество совершенных продаж за период",
          "Максимальная стоимость одного товара в каталоге",
          "Размер скидки для постоянных VIP-клиентов"
        ],
        correctAnswer: "Общая выручка, разделенная на количество совершенных продаж за период"
      },
      {
        question: "Какой процент конверсии считается хорошим для холодной базы контактов?",
        type: "select",
        options: ["100% без исключений", "От 2% до 10% в зависимости от ниши", "Не более 0.01%", "Конверсию холодных баз невозможно замерить"],
        correctAnswer: "От 2% до 10% в зависимости от ниши"
      },
      {
        question: "Что такое апсейл (Up-sell) в торговой практике компании?",
        type: "select",
        options: [
          "Снижение цены по купону стажера",
          "Продажа клиенту более дорогой версии товара или дополнительного объема услуг",
          "Возврат неиспользованного товара обратно поставщику",
          "Отсутствие звонков в течение рабочего дня"
        ],
        correctAnswer: "Продажа клиенту более дорогой версии товара или дополнительного объема услуг"
      },
      {
        question: "Какой инструмент помогает продавцу правильно вести сложный телефонный диалог?",
        type: "select",
        options: ["Калькулятор валют", "Интерактивный скрипт (регламент) продаж", "Юридический кодекс страны", "Поисковая система Google"],
        correctAnswer: "Интерактивный скрипт (регламент) продаж"
      },
      {
        question: "Что такое воронка продаж (Sales Funnel)?",
        type: "select",
        options: [
          "Фильтр очистки базы данных",
          "Путь, который проходит клиент от первого знакомства с продуктом до завершения сделки",
          "Приспособление для переливания автомобильного масла",
          "Список уволенных сотрудников отдела продаж"
        ],
        correctAnswer: "Путь, который проходит клиент от первого знакомства с продуктом до завершения сделки"
      }
    ];

    textQs = [
      { question: "Опишите ваш самый успешный опыт продаж из прошлой практики (или почему вы хотите работать в продажах).", type: "text" },
      { question: "Как вы готовитесь к разговору с клиентом перед совершением звонка?", type: "text" },
      { question: "Поясните своими словами сущность выявления потребностей клиента.", type: "text" },
      { question: "Опишите ваш личный эффективный метод борьбы с эмоциональным выгоранием на работе.", type: "text" },
      { question: "Как вы аргументируете клиенту ценность дорогостоящего продукта, не прибегая к скидкам?", type: "text" },
      { question: "Что необходимо сделать менеджеру сразу после успешного завершения сложной продажи?", type: "text" },
      { question: "Как вы будете восстанавливать личные показатели эффективности при спаде продаж?", type: "text" },
      { question: "Какую роль в продажах играет дисциплина ведения базы клиентов в CRM-системе?", type: "text" },
      { question: "Опишите, как вы реагируете на резкое возражение клиента со словами 'Мне ничего не нужно!'.", type: "text" },
      { question: "Каковы ваши финансовые цели на данной вакансии на ближайшие 6 месяцев?", type: "text" }
    ];
  } else if (normRole.includes("разработ") || normRole.includes("it") || normRole.includes("програм") || normRole.includes("аналитик") || normRole.includes("тестир")) {
    selectQs = [
      {
        question: "Какая команда используется в Git для отправки локальных коммитов в удаленный репозиторий?",
        type: "select",
        options: ["git commit -m", "git push origin main", "git pull --all", "git clone https://"],
        correctAnswer: "git push origin main"
      },
      {
        question: "Что такое React в современной веб-разработке?",
        type: "select",
        options: [
          "Реляционная база данных компании Oracle",
          "Полноценная операционная система для серверов",
          "Популярная JavaScript-библиотека для создания пользовательских интерфейсов",
          "Облачный хостинг для запуска контейнеров"
        ],
        correctAnswer: "Популярная JavaScript-библиотека для создания пользовательских интерфейсов"
      },
      {
        question: "Какое основное отличие TypeScript от стандартного JavaScript?",
        type: "select",
        options: [
          "TS работает только в мобильных телефонах",
          "TS добавляет строгую статистическую типизацию для раннего предотвращения ошибок",
          "TS не поддерживает циклы и массивы",
          "JavaScript работает медленнее ровно в 10 раз"
        ],
         correctAnswer: "TS добавляет строгую статистическую типизацию для раннего предотвращения ошибок"
      },
      {
        question: "What is DBMS in the context of information architectures?",
        type: "select",
        options: ["Database Management System", "Detailed Binary Mail Service", "Distributed Board Matching Script", "Double Band Memory Selector"],
        correctAnswer: "Database Management System"
      },
      {
        question: "Какое расширение файлов веб-страниц по умолчанию используется в React-проектах с TypeScript?",
        type: "select",
        options: [".css", ".html", ".tsx", ".zip"],
        correctAnswer: ".tsx"
      },
      {
        question: "Что такое Docker в процессах CI/CD команд разработки?",
        type: "select",
        options: [
          "Игровая консоль со встроенными тестами",
          "Платформа контейнеризации приложений, упаковывающая код со всеми зависимостями в один образ",
          "Кабель для подключения монитора к серверной стойке",
          "Язык стилизации CSS-карточек"
        ],
        correctAnswer: "Платформа контейнеризации приложений, упаковывающая код со всеми зависимостями в один образ"
      },
      {
        question: "Какая HTTP-методология используется для полного обновления данных в REST API?",
        type: "select",
        options: ["GET", "DELETE", "PUT", "PATCH"],
        correctAnswer: "PUT"
      },
      {
        question: "Какова основная задача юнит-тестов (Unit Tests)?",
        type: "select",
        options: [
          "Замена ручного тестирования всего интерфейса",
          "Проверка корректности работы отдельных изолированных единиц/функций исходного кода",
          "Сбор аналитики о пользователях системы",
          "Автоматическая загрузка обновленного ПО на сервера"
        ],
        correctAnswer: "Проверка корректности работы отдельных изолированных единиц/функций исходного кода"
      },
      {
        question: "Что означает аббревиатура DRY в программировании?",
        type: "select",
        options: [
          "Do Repeat Yourself",
          "Don't Repeat Yourself (не повторяй свой собственный код)",
          "Data Ready Yes",
          "Developer Real Youth"
        ],
        correctAnswer: "Don't Repeat Yourself (не повторяй свой собственный код)"
      },
      {
        question: "Каким инструментом чаще всего пользуются для описания структуры REST API?",
        type: "select",
        options: ["Photoshop", "Swagger", "Notepad", "Excel"],
        correctAnswer: "Swagger"
      }
    ];

    textQs = [
      { question: "Опишите ваш основной стек технологий и опыт его коммерческого использования.", type: "text" },
      { question: "Como вы организуете процесс поиска и исправления сложной логической ошибки в коде?", type: "text" },
      { question: "Поясните разницу между реляционными и нереляционными базами данных из вашего опыта.", type: "text" },
      { question: "Как вы относитесь к переработкам перед релизами и как оптимизируете свое рабочее время?", type: "text" },
      { question: "Опишите самый запоминающийся проект, который вы реализовали лично или в команде.", type: "text" },
      { question: "Что для вас идеальное проведение код-ревью в дружной команде?", type: "text" },
      { question: "Как вы оцениваете трудоемкость новых технических задач?", type: "text" },
      { question: "Опишите ваш опыт работы под распределенной системой контроля версий Git.", type: "text" },
      { question: "Как вы изучаете новые стандарты веб-технологий или фреймворки?", type: "text" },
      { question: "Каковы ваши профессиональные ожидания от нашей команды инженеров?", type: "text" }
    ];
  } else {
    selectQs = [
      {
        question: "Какой стандартный график работы является классическим?",
        type: "select",
        options: ["2/2 круглые сутки", "5/2 по 8 часов в день", "7/0 без полноценных выходных", "1/3 суточный"],
        correctAnswer: "5/2 по 8 часов в день"
      },
      {
        question: "Что такое корпоративная почта сотрудника?",
        type: "select",
        options: [
          "Развлекательный почтовый ящик семьи",
          "Официальный электронный ящик в домене компании для рабочей переписки",
          "Облачные файлы на домашнем диске",
          "Брошюры в печатном ящике у входа в офис"
        ],
        correctAnswer: "Официальный электронный ящик в домене компании для рабочей переписки"
      },
      {
        question: "Как вести себя при возникновении спорного момента с коллегами?",
        type: "select",
        options: [
          "Игнорировать человека и заблокировать контакт",
          "Проявить вежливость, спокойно выявить причину спора и обсудить конструктивные пути решения",
          "Громко высказать обидные претензии на общем собрании",
          "Попросить куратора немедленно уволить оппонента"
        ],
        correctAnswer: "Проявить вежливость, спокойно выявить причину спора и обсудить конструктивные пути решения"
      },
      {
        question: "Какая основная задача онбординга новых стажеров?",
        type: "select",
        options: ["Проверка терпения новичков", "Плавная и быстрая адаптация стажера в рабочие инструменты, ценности и регламенты", "Организация корпоративных праздников", "Разъяснение личных хобби руководства"],
        correctAnswer: "Плавная и быстрая адаптация стажера в рабочие инструменты, ценности и регламенты"
      },
      {
        question: "Что делать с конфиденциальной внутренней базой знаний компании?",
        type: "select",
        options: [
          "Поделиться ею в открытом доступе на форумах",
          "Строго соблюдать коммерческую тайну и использовать только для выполнения служебных задач",
          "Разослать друзьям для ознакомления",
          "Удалить всю базу из рабочего пространства"
        ],
        correctAnswer: "Строго соблюдать коммерческую тайну и использовать только для выполнения служебных задач"
      },
      {
        question: "Что такое дедлайн в организации работы сотрудника?",
        type: "select",
        options: ["Конец рабочей года", "Крайний срок (дата и время) выполнения поставленной задачи", "Утренний созвон с напарниками", "Начало обеденного часа"],
        correctAnswer: "Крайний срок (дата и время) выполнения поставленной задачи"
      },
      {
        question: "Какая государственная система фиксирует статус профессионального дохода (Самозанятые)?",
        type: "select",
        options: ["Яндекс Почта", "Приложение 'Мой Налог'", "Государственная система здравоохранения РФ", "Сбербанк Онлайн"],
        correctAnswer: "Приложение 'Мой Налог'"
      },
      {
        question: "Зачем сотрудникам нужна регулярная обратная связь от руководителей?",
        type: "select",
        options: [
          "Для выговоров и снижения премий",
          "Для объективного понимания своих успехов, зон роста и повышения профессионализма",
          "Никакой роли ОС не играет",
          "Исключительно ради ведения отчетности"
        ],
        correctAnswer: "Для объективного понимания своих успехов, зон роста и повышения профессионализма"
      },
      {
        question: "Что делать при технической неисправности личного оборудования в рабочее время?",
        type: "select",
        options: [
          "Незамедлительно сообщить своему куратору или наставнику и согласовать действия",
          "Закрыть сессию окон и пойти заниматься личными хобби",
          "Ждать окончания смены, надеясь, что никто не заметит",
          "Попросить у коллег дать вам пароли от их компьютеров"
        ],
        correctAnswer: "Незамедлительно сообщить своему куратору или наставнику и согласовать действия"
      },
      {
        question: "Какой формат файлов является де-факто международным стандартом для сохранения резюме?",
        type: "select",
        options: [".exe", ".zip", ".pdf", ".png"],
        correctAnswer: ".pdf"
      }
    ];

    textQs = [
      { question: "Поделитесь вашим общим профессиональным стажем на аналогичных ролях.", type: "text" },
      { question: "Каким образом вы привыкли планировать свой рабочий день?", type: "text" },
      { question: "Что для вас является залогом успешной командной работы?", type: "text" },
      { question: "Опишите ваш самый запоминающийся опыт преодоления рабочих затруднений.", type: "text" },
      { question: "Как вы осваиваете новые рабочие программы и служебные инструкции?", type: "text" },
      { question: "Опишите ваше отношение к регулярной оценке качества вашей работы.", type: "text" },
      { question: "Какими способами вы боретесь с повседневным стрессом на рабочем месте?", type: "text" },
      { question: "Как вы организуете хранение своих профессиональных записей и планов?", type: "text" },
      { question: "Какую профессиональную планку на этой работе вы ставите перед собой на год?", type: "text" },
      { question: "Почему наша открытая вакансия заинтересовала вас в данный момент?", type: "text" }
    ];
  }

  const shuffledSelect = [...selectQs].sort(() => Math.random() - 0.5).slice(0, 10);
  const shuffledText = [...textQs].sort(() => Math.random() - 0.5).slice(0, 10);
  const combined = [...shuffledSelect, ...shuffledText];
  return combined.sort(() => Math.random() - 0.5);
};

const getSmartDefaultAnswer = (q: string, role: string): string => {
  const qLower = q.toLowerCase();
  if (qLower.includes("опыт в активных") || qLower.includes("опыт работы на")) {
    return "Более 3 лет успешного коммерческого опыта в данной сфере.";
  }
  if (qLower.includes("стек технологий")) {
    return "React, TypeScript, Node.js, Express, PostgreSQL, TailwindCSS, Git.";
  }
  if (qLower.includes("возражени") || qLower.includes("отказы")) {
    return "Отношусь конструктивно. Выслушиваю клиента, соглашаюсь с его правом на сомнение, перевожу разговор на ценность и выгоду продукта.";
  }
  if (qLower.includes("crm")) {
    return "Уверенно владею amoCRM, Bitrix24, Jira, фиксирую все этапы движения лида и ставлю напоминания.";
  }
  if (qLower.includes("рекорд по сумме") || qLower.includes("когда-либо")) {
    return "Закрыл крупный контракт на поставку ПО на сумму 1.2 млн рублей за один календарный месяц.";
  }
  if (qLower.includes("лпр")) {
    return "Через секретарей и выявление болей выхожу на ЛПР, задаю квалифицирующие вопросы напрямую руководителю.";
  }
  if (qLower.includes("средний чек")) {
    return "Средний чек сделок составлял около 75,000 рублей.";
  }
  if (qLower.includes("холодн") || qLower.includes("звонков")) {
    return "Да, есть большой опыт холодных звонков. Стабильно делал около 40-50 звонков в день на этапе разгона базы.";
  }
  if (qLower.includes("воронка") || qLower.includes("воронками")) {
    return "Конечно. Знаю, как конвертировать лиды из этапа 'первичный интерес' в 'согласование договора' и минимизировать потери.";
  }
  if (qLower.includes("коммерческих предложений") || qLower.includes("rest api")) {
    return "Регулярно составлял индивидуальные коммерческие предложения под боли конкретного клиента.";
  }
  if (qLower.includes("спин") || qLower.includes("git")) {
    return "Да, использую ситуационные, проблемные, извлекающие и направляющие вопросы для поиска скрытых потребностей.";
  }
  if (qLower.includes("быстро") || qLower.includes("контакт")) {
    return "Сразу проявляю вежливость, улыбку в голосе, называю по имени и держу уверенный профессиональный тон.";
  }
  if (qLower.includes("допродаж") || qLower.includes("cross-sell")) {
    return "Предлагаю расширенную гарантию, дополнительные модули или сопутствующие обучающие услуги.";
  }
  if (qLower.includes("тендерах") || qLower.includes("docker")) {
    return "Имею базовое понимание процессов и регламентов участия на электронных торговых площадках.";
  }
  if (qLower.includes("kpi") || qLower.includes("метрики")) {
    return "Основные показатели: объем продаж, количество звонков, средняя длина сделки и отзывы клиентов.";
  }
  if (qLower.includes("готовы ли") || qLower.includes("согласны")) {
    return "Да, абсолютно готов. Понимаю, что на старте необходима максимальная вовлеченность.";
  }
  if (qLower.includes("выгоранием") || qLower.includes("многозадачностью")) {
    return "Переключаю фокус внимания, занимаюсь спортом и четко планирую рабочие задачи по приоритетам.";
  }
  if (qLower.includes("встреч") || qLower.includes("презентацион")) {
    return "Да, проводил онлайн-демонстрации продукта в Zoom и личные встречи на территории заказчика.";
  }
  if (qLower.includes("этикет") || qLower.includes("английским")) {
    return "Владею деловым этикетом, грамотно пишу коммерческие предложения и легко нахожу общий язык.";
  }
  if (qLower.includes("почему") || qLower.includes("привлекает")) {
    return "Мне нравится помогать людям решать их проблемы с помощью качественного продукта и зарабатывать на этом.";
  }
  return "Имею высокий уровень профессионализма, быстро изучаю новую информацию и стремлюсь выполнять плановые показатели.";
};

function hexToRgba(hex: string, alphaPercent: number): string {
  if (!hex) return `rgba(255, 255, 255, ${alphaPercent / 100})`;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) {
    return `rgba(255, 255, 255, ${alphaPercent / 100})`;
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const a = Math.max(0, Math.min(100, alphaPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

interface CandidateThemedBackgroundProps {
  theme?: any;
}

const CandidateThemedBackground: React.FC<CandidateThemedBackgroundProps> = ({ theme }) => {
  const isMono = Boolean(theme?.allMediaMonochrome || theme?.pageBgMonochrome);
  const pageBgColor = theme?.pageBgColor || "#000000";
  const pageBgOpacity = (theme?.pageBgOpacity ?? 100) / 100;
  const pageBgFilterColor = theme?.pageBgFilterColor || "#17344F";
  const pageBgFilterOpacity = (theme?.pageBgFilterOpacity ?? 0) / 100;
  const bgMediaUrl = theme?.pageBgMediaUrl || theme?.pageBgImageUrl || "";
  const bgMobileMediaUrl = theme?.pageBgMobileMediaUrl || "";
  const isVideo = bgMediaUrl && (bgMediaUrl.endsWith(".mp4") || bgMediaUrl.endsWith(".webm") || bgMediaUrl.includes("video"));

  return (
    <>
      {/* 1. Base background color */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundColor: pageBgColor,
          opacity: pageBgOpacity,
        }}
      />

      {/* 2. Media layer (Image or Video with monochrome filter) */}
      {bgMediaUrl ? (
        <div className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${isMono ? "grayscale" : ""}`}>
          {isVideo ? (
            <video
              src={bgMediaUrl}
              autoPlay={theme?.pageBgVideoAutoplay !== false}
              muted
              loop={theme?.pageBgVideoLoop !== false}
              playsInline
              className={`w-full h-full object-cover ${bgMobileMediaUrl ? "hidden md:block" : "block"}`}
            />
          ) : (
            <div
              className={`w-full h-full ${bgMobileMediaUrl ? "hidden md:block" : "block"}`}
              style={{
                backgroundImage: `url(${bgMediaUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundAttachment: "fixed",
              }}
            />
          )}
          {bgMobileMediaUrl && (
            <div
              className="w-full h-full block md:hidden"
              style={{
                backgroundImage: `url(${bgMobileMediaUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}
        </div>
      ) : null}

      {/* 3. Filter Overlay */}
      {pageBgFilterOpacity > 0 && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            backgroundColor: pageBgFilterColor,
            opacity: pageBgFilterOpacity,
          }}
        />
      )}

      {/* 4. Dynamic Interactive Waves / 3D Neuron Sphere animations */}
      {(theme?.showWaveAnimation !== false || Boolean(theme?.showSphereAnimation)) && (
        <div className={`landing-interactive-bg fixed inset-0 pointer-events-none z-0 overflow-hidden ${isMono ? "grayscale" : ""}`}>
          <InteractiveLandingBackground
            showBadges={false}
            showWaves={theme?.showWaveAnimation !== false}
            showSphere={Boolean(theme?.showSphereAnimation)}
            themeColors={{
              headingColor: theme?.headingsSolidColor || "#FFFFFF",
              bodyTextColor: theme?.bodyTextColor || "#FFFFFF",
              boldTextColor: theme?.boldTextColor || "#FFFFFF",
              iconColor: theme?.iconColor || "#E7C768",
              headingsColorMode: theme?.headingsColorMode || "solid",
              isMonochrome: isMono,
            }}
          />
        </div>
      )}
    </>
  );
};

export default function CandidateFlow() {
  const { path, navigate } = useRouter();
  const { run: aiWaitRun } = useAIWait();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAcademyModalOpen, setIsAcademyModalOpen] = useState(false);
  const [academyModalSlug, setAcademyModalSlug] = useState("candidate");

  // Active state ids
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [project, setProject] = useState<JobProject | null>(null);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  // Full DB row for the active project + parent company + employer contacts
  const [projectFull, setProjectFull] = useState<any | null>(null);
  const [companyFull, setCompanyFull] = useState<any | null>(() => {
    if (typeof window === "undefined") return null;
    const parts = window.location.pathname.split("/").filter(Boolean);
    const comPart = parts.find((p) => p.startsWith("com"));
    const first = parts[0] || "";
    const compIdentifier = comPart || (first && !first.startsWith("cand") && !first.startsWith("vac") && first !== "demo" && first !== "login" && first !== "signup" ? first : "");
    if (compIdentifier) {
      try {
        const cached = sessionStorage.getItem(`company_cache_${compIdentifier}`);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });

  // Early preload of company theme so that loading screen and animations match company immediately
  useEffect(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const comPart = parts.find((p) => p.startsWith("com"));
    const first = parts[0] || "";
    let compIdentifier = comPart || "";
    if (!compIdentifier && first && !first.startsWith("cand") && !first.startsWith("vac") && first !== "demo" && first !== "login" && first !== "signup") {
      compIdentifier = first;
    }
    if (compIdentifier) {
      fetch(`/api/companies/by-slug/${encodeURIComponent(compIdentifier)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const comp = data?.company || data;
          if (comp && (comp.theme_config || comp.css || comp.id)) {
            try {
              sessionStorage.setItem(`company_cache_${compIdentifier}`, JSON.stringify(comp));
              if (comp.slug) sessionStorage.setItem(`company_cache_${comp.slug}`, JSON.stringify(comp));
              if (comp.public_id) sessionStorage.setItem(`company_cache_com${comp.public_id}`, JSON.stringify(comp));
            } catch {}
            setCompanyFull((prev: any) => {
              if (prev && prev.theme_config && !comp.theme_config) return prev;
              return comp;
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const activeCompanyTheme = React.useMemo(() => {
    const raw = companyFull?.theme_config || companyFull?.css || projectFull?.theme_config || projectFull?.css;
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  }, [companyFull?.theme_config, companyFull?.css, projectFull?.theme_config, projectFull?.css]);

  useLandingTheme(activeCompanyTheme);

  const activeBtnStyle = React.useMemo<React.CSSProperties>(() => {
    const radius = activeCompanyTheme?.btnBorderRadius === 999
      ? "9999px"
      : activeCompanyTheme?.btnBorderRadius != null
      ? `${activeCompanyTheme.btnBorderRadius}px`
      : "12px";
    const bg = activeCompanyTheme?.btnActiveBgColor || "#E7C768";
    const opacity = activeCompanyTheme?.btnActiveOpacity != null ? activeCompanyTheme.btnActiveOpacity : 100;
    const borderRgba = activeCompanyTheme?.btnBorderColor
      ? hexToRgba(activeCompanyTheme.btnBorderColor, activeCompanyTheme.btnBorderOpacity ?? 20)
      : "rgba(255, 255, 255, 0.25)";
    return {
      backgroundColor: hexToRgba(bg, opacity),
      color: activeCompanyTheme?.btnActiveTextColor || "#000000",
      borderColor: borderRgba,
      borderRadius: radius,
      borderWidth: `${activeCompanyTheme?.btnBorderWidth ?? 1}px`,
      fontFamily: activeCompanyTheme?.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  const inactiveBtnStyle = React.useMemo<React.CSSProperties>(() => {
    const radius = activeCompanyTheme?.btnBorderRadius === 999
      ? "9999px"
      : activeCompanyTheme?.btnBorderRadius != null
      ? `${activeCompanyTheme.btnBorderRadius}px`
      : "12px";
    const borderRgba = activeCompanyTheme?.btnBorderColor
      ? hexToRgba(activeCompanyTheme.btnBorderColor, activeCompanyTheme.btnBorderOpacity ?? 20)
      : "rgba(255, 255, 255, 0.25)";
    const blur = activeCompanyTheme?.glassBlurPx ?? 24;
    return {
      backgroundColor: "transparent",
      color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
      borderColor: borderRgba,
      borderRadius: radius,
      borderWidth: `${activeCompanyTheme?.btnBorderWidth ?? 1}px`,
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      fontFamily: activeCompanyTheme?.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  const containerCardStyle = React.useMemo<React.CSSProperties>(() => {
    const blur = activeCompanyTheme?.glassBlurPx ?? 24;
    const borderRgba = activeCompanyTheme?.containerBorderColor
      ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 20)
      : "rgba(255, 255, 255, 0.25)";
    const radius = activeCompanyTheme?.containerBorderRadius != null ? `${activeCompanyTheme.containerBorderRadius}px` : "16px";
    return {
      backgroundColor: "transparent",
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      borderColor: borderRgba,
      borderRadius: radius,
      borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
      fontFamily: activeCompanyTheme?.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  const inputStyle = React.useMemo<React.CSSProperties>(() => {
    const radius = activeCompanyTheme?.inputBorderRadius != null
      ? `${activeCompanyTheme.inputBorderRadius}px`
      : (activeCompanyTheme?.containerBorderRadius != null ? `${activeCompanyTheme.containerBorderRadius}px` : "12px");
    const borderRgba = activeCompanyTheme?.inputBorderColor
      ? hexToRgba(activeCompanyTheme.inputBorderColor, activeCompanyTheme.containerBorderOpacity ?? 20)
      : (activeCompanyTheme?.containerBorderColor
        ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 20)
        : "rgba(255, 255, 255, 0.25)");
    return {
      backgroundColor: "transparent",
      backdropFilter: `blur(${activeCompanyTheme?.glassBlurPx ?? 24}px)`,
      WebkitBackdropFilter: `blur(${activeCompanyTheme?.glassBlurPx ?? 24}px)`,
      borderColor: borderRgba,
      borderRadius: radius,
      borderWidth: `${activeCompanyTheme?.inputBorderWidth ?? 1}px`,
      color: "#FFFFFF",
      fontFamily: activeCompanyTheme?.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  const headingStyle = React.useMemo<React.CSSProperties>(() => {
    const font = activeCompanyTheme?.fontFamily || undefined;
    if (activeCompanyTheme?.headingsColorMode === "gradient-gold") {
      return {
        fontFamily: font,
        backgroundImage: "linear-gradient(to right, #F5E296, #D4AF37, #AA771C)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    if (activeCompanyTheme?.headingsColorMode === "gradient-silver") {
      return {
        fontFamily: font,
        backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    const color = activeCompanyTheme?.headingsSolidColor || "#FFFFFF";
    return {
      fontFamily: font,
      color,
      WebkitTextFillColor: color,
    };
  }, [activeCompanyTheme]);
  const emailHeadingStyle = headingStyle;

  React.useEffect(() => {
    const customCss = activeCompanyTheme?.customCss || (typeof companyFull?.css === "string" && !companyFull.css.startsWith("{") ? companyFull.css : null) || (typeof projectFull?.css === "string" && !projectFull.css.startsWith("{") ? projectFull.css : null);
    if (!customCss || typeof customCss !== "string") return;
    let styleTag = document.getElementById("candidate-company-css") as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "candidate-company-css";
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = customCss;
    return () => {
      const el = document.getElementById("candidate-company-css");
      if (el) el.remove();
    };
  }, [activeCompanyTheme?.customCss, companyFull?.css, projectFull?.css]);

  const getVacancyLandingUrl = () => {
    const compSlug = companyFull?.slug || projectFull?.company_slug || (companyFull?.public_id ? `com${companyFull.public_id}` : "");
    const vacSlug = projectFull?.slug || project?.slug || (projectFull?.public_id ? `vac${projectFull.public_id}` : "");
    if (compSlug && vacSlug) return `/${compSlug}/${vacSlug}`;
    if (compSlug) return `/${compSlug}`;
    return "/main";
  };
  const [employerContacts, setEmployerContacts] = useState<{ name?: string|null; email?: string|null; phone?: string|null; telegram?: string|null }>({});
  // Loading state for the initial session/project resolution.
  const [sessionLoading, setSessionLoading] = useState(true);

  // Flow navigation stage index: "terms" | "interview" | "scoring" | "training" | "certified"
  const [currentStage, setCurrentStage] = useState<string>("terms");
  // Реальный прогресс по (candidate_id, project_id) — считаем из БД, чтобы
  // прогресс-бар на профиле кандидата отражал фактически пройденные этапы,
  // а не устаревшее значение `candidates.current_stage`.
  const [effectiveStage, setEffectiveStage] = useState<string>("terms");

  const interviewPassScore = Number(projectFull?.interview_pass_score) > 0 ? Number(projectFull.interview_pass_score) : 70;
  const interviewStageScores = [
    candidate?.scores?.resumeScore,
    candidate?.scores?.checklistScore,
    candidate?.scores?.situationsScore,
  ].filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
  const interviewAverageScore = interviewStageScores.length === 3
    ? Math.round((interviewStageScores.reduce((a, b) => a + b, 0) / 3) * 100) / 100
    : null;
  const interviewPassedStrict = interviewStageScores.length === 3 && interviewAverageScore !== null && interviewAverageScore >= interviewPassScore;

  // Единая серверная машина состояний: эндпоинт `/api/candidate/flow-state` —
  // единственный источник правды о текущем этапе кандидата. Считается из
  // реальных данных (оценки, прогресс обучения, сертификат) и защищена
  // токеном кандидата (x-candidate-token). Это исключает «перескок»
  // этапов и корректно восстанавливает шаг после перезагрузки страницы.
  const loadFlowState = React.useCallback(async () => {
    if (!candidate?.id) { setEffectiveStage("terms"); return null; }
    try {
      const sess = getCandidateSession();
      const candIdent = candidate.publicId || candidate.id;
      const resp = await fetch(`/api/candidate/flow-state?candidate_id=${encodeURIComponent(candIdent)}`, {
        headers: {
          "x-candidate-token": sess?.token || candidate.id,
        },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to load flow state");
      const stage = (data?.stage as string) || "terms";
      setEffectiveStage(stage);
      setCurrentStage(stage);
      return data;
    } catch {
      setEffectiveStage(currentStage || "terms");
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, candidate?.publicId, currentStage]);

  useEffect(() => {
    void loadFlowState();
  }, [loadFlowState]);

  // Main navigation tab
  const [activeTab, setActiveTabState] = useState<string>("profile");
  
  // Sub-tabs for "Условия"
  const [termsSubTab, setTermsSubTabState] = useState<string>("vacancy");

  // Sub-tabs for "ИИ обучение"
  const [trainingSubTab, setTrainingSubTabState] = useState<string>("professional");

  // Sub-tabs for "Интервью"
  const [interviewSubTab, setInterviewSubTabState] = useState<string>("resume");

  // Re-fetch candidate scores from PostgreSQL BD ProTalk server via /api/candidate/scores
  const reloadScores = React.useCallback(async () => {
    if (!candidate?.id) return;
    try {
      const sess = getCandidateSession();
      const candIdent = candidate.publicId || candidate.id;
      const resp = await fetch(`/api/candidate/scores?candidate_id=${encodeURIComponent(candIdent)}`, {
        headers: {
          "x-candidate-token": sess?.token || candidate.id,
        },
      });
      const sc = await resp.json();
      if (!resp.ok || !sc || sc.ok === false) return;
      setCandidate((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          crmStage: sc.crm_stage || (prev as any).crmStage,
          stage: sc.stage || (prev as any).stage,
          currentStage: sc.current_stage || (prev as any).currentStage,
          certified: sc.certified !== undefined ? Boolean(sc.certified) : (prev as any).certified,
          scores: {
            resumeScore: sc.resume_score == null ? undefined : Number(sc.resume_score),
            checklistScore: sc.checklist_score == null ? undefined : Number(sc.checklist_score),
            situationsScore: sc.situations_score == null ? undefined : Number(sc.situations_score),
            interviewScore: sc.interview_score == null ? undefined : Number(sc.interview_score),
            overallScore: sc.overall_score == null ? undefined : Number(sc.overall_score),
            assessmentSummary: sc.assessment_summary || "",
            resumeFeedback: sc.resume_feedback || null,
            checklistFeedback: sc.checklist_feedback || null,
            situationsFeedback: sc.situations_feedback || null,
            updatedAt: (sc as any).updated_at || null,
          } as any,
        } as any;
      });
    } catch {
      /* Safe: silent on transient errors */
    }
  }, [candidate?.id, candidate?.publicId]);

  // Re-fetch every time the user lands on /scoring or /profile, including direct URL hits
  // and browser reloads (ensures Степень прохождения is always up-to-date with DB).
  useEffect(() => {
    if (activeTab === "scoring" || activeTab === "profile") {
      void reloadScores();
      void loadFlowState();
    }
  }, [activeTab, reloadScores, loadFlowState]);

  // Force fresh DB read whenever the candidate lands on Итог, обучение, или
  // сертификат — иначе гейт `interviewPassedStrict` может опираться на
  // устаревший локальный state и не пустит на обучение сразу после сдачи
  // ситуаций, требуя ручной F5. Также обновляем серверный flow_state.
  useEffect(() => {
    if (activeTab === "training" || activeTab === "certified" || activeTab === "interview" || activeTab === "profile") {
      void reloadScores();
      void loadFlowState();
    }
  }, [activeTab, reloadScores, loadFlowState]);

  // Re-fetch when the tab regains focus — covers the "interview done in
  // another tab / sub-flow, switched back to scoring" case.
  useEffect(() => {
    if (!candidate?.id) return;
    const onFocus = () => { if (activeTab === "scoring") void reloadScores(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [candidate?.id, activeTab, reloadScores]);

  // Периодическая фоновая проверка результатов (раз в 10 секунд на вкладке scoring или interview)
  useEffect(() => {
    if (!candidate?.id) return;
    if (activeTab !== "scoring" && activeTab !== "interview") return;
    const interval = setInterval(() => {
      void reloadScores();
    }, 10000);
    return () => clearInterval(interval);
  }, [candidate?.id, activeTab, reloadScores]);

  // Helper to build cohesive URLs
  const getDynamicPath = (tabId: string, subTabId?: string, forceProject?: any) => {
    const parts = path.split("/").filter(Boolean);
    const candIndex = parts.findIndex(p => /^(candidate|cand)/i.test(p));
    const storedCandidateId = localStorage.getItem("cand_session_id") || "";
    const storedPublicId = storedCandidateId.replace(/^candidate/i, "").replace(/^cand/i, "");
    const candidateId = candidate?.publicId ? `cand${candidate.publicId}` : (storedPublicId ? `cand${storedPublicId}` : "cand");

    const targetProject = forceProject || project;
    let slug = "";
    let vacId = "";

    if (candIndex >= 2) {
      slug = parts[0];
      vacId = parts[1];
    } else if (targetProject) {
      const rawCompanySlug = targetProject.companySlug || "";
      const rawVacId = (targetProject as any).publicId || (targetProject as any).public_id || (targetProject as any).slug || targetProject.id;
      slug = rawCompanySlug ? (/^com/i.test(rawCompanySlug) ? rawCompanySlug : `com${rawCompanySlug}`) : "";
      vacId = rawVacId ? (/^vac/i.test(rawVacId) ? rawVacId : `vac${rawVacId}`) : "";
    }

    let targetSub = subTabId;
    if (!targetSub) {
      if (tabId === "terms") targetSub = termsSubTab || "vacancy";
      else if (tabId === "training") targetSub = trainingSubTab || "professional";
      else if (tabId === "interview") targetSub = interviewSubTab || "resume";
    }

    if (slug && vacId) {
      return `/${slug}/${vacId}/${candidateId}/${tabId}${targetSub ? `/${targetSub}` : ""}`;
    } else {
      return `/${candidateId}/${tabId}${targetSub ? `/${targetSub}` : ""}`;
    }
  };

  const setActiveTab = (tabId: string) => {
    setActiveTabState(tabId);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    let sub = "";
    if (tabId === "terms") sub = termsSubTab || "vacancy";
    else if (tabId === "training") sub = trainingSubTab || "professional";
    else if (tabId === "interview") sub = interviewSubTab || "resume";
    navigate(getDynamicPath(tabId, sub));
  };

  const setTermsSubTab = (subTabId: string) => {
    setTermsSubTabState(subTabId);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    navigate(getDynamicPath("terms", subTabId));
  };

  const setTrainingSubTab = (subTabId: string) => {
    setTrainingSubTabState(subTabId);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    navigate(getDynamicPath("training", subTabId));
  };

  const setInterviewSubTab = (subTabId: string) => {
    setInterviewSubTabState(subTabId);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    navigate(getDynamicPath("interview", subTabId));
  };

  // Redirect literally "candidate" or "cand" segments to proper IDs
  useEffect(() => {
    const parts = path.split("/").filter(Boolean);
    const candIndex = parts.findIndex(p => {
      const lower = p.toLowerCase();
      return lower.startsWith("candidate") || lower.startsWith("cand");
    });
    
    if (candIndex !== -1 && (parts[candIndex].toLowerCase() === "candidate" || parts[candIndex].toLowerCase() === "cand")) {
      let properId = localStorage.getItem("cand_session_id") || "";
      const properPid = properId.replace(/^candidate/i, "").replace(/^cand/i, "");
      if (/^\d{4,}$/.test(properPid)) {
        properId = `candidate${properPid}`;
      } else {
        properId = "candidate" + Math.floor(100000 + Math.random() * 900000).toString();
      }
      localStorage.setItem("cand_session_id", properId);
      const newParts = [...parts];
      newParts[candIndex] = properId;
      const newPath = "/" + newParts.join("/");
      navigate(newPath);
    }
  }, [path, navigate]);

  // Sync URL subpath to activeTab, termsSubTab and trainingSubTab states
  useEffect(() => {
    const parts = path.split("/").filter(Boolean);
    const candIndex = parts.findIndex(p => /^(candidate|cand)/i.test(p));
    
    let parsedTab = "profile";
    let parsedSubTab = "";

    if (candIndex !== -1) {
      if (candIndex === 0) {
        parsedTab = parts[1] || "profile";
        parsedSubTab = parts[2] || "";
      } else if (candIndex >= 2) {
        parsedTab = parts[3] || "profile";
        parsedSubTab = parts[4] || "";
      }
    } else {
      if (parts[0] && parts[0].startsWith("candidate")) {
        parsedTab = parts[1] || "profile";
        parsedSubTab = parts[2] || "";
      } else if (parts[0] === "candidate") {
        parsedTab = parts[1] || "profile";
        parsedSubTab = parts[2] || "";
      }
    }

    if (parsedTab && parsedTab !== activeTab) {
      setActiveTabState(parsedTab);
    }

    if (parsedTab === "terms") {
      const sub = parsedSubTab || "vacancy";
      if (sub !== termsSubTab) {
        setTermsSubTabState(sub);
      }
    } else if (parsedTab === "training") {
      const sub = parsedSubTab || "professional";
      if (sub !== trainingSubTab) {
        setTrainingSubTabState(sub);
      }
    } else if (parsedTab === "interview") {
      const sub = parsedSubTab || "resume";
      if (sub !== interviewSubTab) {
        setInterviewSubTabState(sub);
      }
    }
  }, [path]);

  // (Floating AI Assistant removed from the candidate cabinet by request.)

  // Profile management edit states
  const [editingProfile, setEditingProfile] = useState(false);
  const [profName, setProfName] = useState("");
  const [profEmail, setProfEmail] = useState("");
  const [profTelegram, setProfTelegram] = useState("");
  const [profPhone, setProfPhone] = useState("");
  const [profResumeUrl, setProfResumeUrl] = useState("");
  const [profAvatarUrl, setProfAvatarUrl] = useState("");
  const [profSocials, setProfSocials] = useState<Record<string, string>>({
    social_telegram: "", social_whatsapp: "", social_instagram: "",
    social_vk: "", social_max: "", social_setka: "", social_github: "",
  });
  const [saveProfileMsg, setSaveProfileMsg] = useState("");
  const [certSavedMsg, setCertSavedMsg] = useState("");
  // Optional credentials change (email/password)
  const [profCurrentPw, setProfCurrentPw] = useState("");
  const [profNewPw, setProfNewPw] = useState("");
  const [profNewPw2, setProfNewPw2] = useState("");

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    try {
      const sess = getCandidateSession();
      const patch: any = {
        full_name: profName.trim(),
        phone: profPhone,
        resume_url: profResumeUrl,
        avatar_url: profAvatarUrl,
        ...profSocials,
      };
      const wantEmailChange = !!profEmail && profEmail.trim().toLowerCase() !== (candidate.email || "").toLowerCase();
      const wantPwChange = !!profNewPw;
      if (wantPwChange && profNewPw.length < 8) {
        setSaveProfileMsg("⚠️ Новый пароль должен быть не короче 8 символов");
        return;
      }
      if (wantPwChange && profNewPw !== profNewPw2) {
        setSaveProfileMsg("⚠️ Пароли не совпадают");
        return;
      }
      if (wantPwChange && !profCurrentPw) {
        setSaveProfileMsg("⚠️ Введите текущий пароль для смены");
        return;
      }

      const candIdent = candidate.publicId || candidate.id;
      const resp = await fetch("/api/candidate/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-candidate-token": sess?.token || candidate.id,
        },
        body: JSON.stringify({
          _token: sess?.token || candidate.id,
          candidate_id: candIdent,
          _patch: patch,
          _new_email: wantEmailChange ? profEmail.trim() : null,
          _new_password: wantPwChange ? profNewPw : null,
          _current_password: wantPwChange ? profCurrentPw : null,
        }),
      });
      const rpcRes = await resp.json();
      if (!resp.ok || (rpcRes && rpcRes.ok === false)) {
        const msg = ({
          bad_email: "Введите корректный e-mail",
          email_taken: "Этот e-mail уже используется другим аккаунтом",
          bad_password: "Пароль должен быть не короче 8 символов",
          wrong_current_password: "Текущий пароль введён неверно",
          bad_token: "Сессия истекла, войдите заново",
          no_token: "Сессия не найдена, войдите заново",
        } as Record<string,string>)[rpcRes?.error] || rpcRes?.message || "Не удалось сохранить";
        setSaveProfileMsg("⚠️ " + msg);
        return;
      }
      const nextEmail = wantEmailChange ? profEmail.trim().toLowerCase() : candidate.email;
      const nextFullName = profName.trim() || candidate.fullName || candidate.name;
      setCandidate({ ...candidate, ...(patch as any), name: nextFullName, fullName: nextFullName, email: nextEmail });
      if (sess) {
        saveCandidateSession({
          ...sess,
          email: nextEmail,
          full_name: nextFullName,
        });
      }
      setProfCurrentPw(""); setProfNewPw(""); setProfNewPw2("");
      setEditingProfile(false);
      setSaveProfileMsg("Данные профиля успешно обновлены и сохранены!");
      setTimeout(() => setSaveProfileMsg(""), 4000);
    } catch (err: any) {
      setSaveProfileMsg("⚠️ " + (err?.message || "Не удалось сохранить"));
    }
  };

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);

  const handleUploadAvatarProTalk = async (file: File) => {
    if (!file || !candidate) return;
    setIsUploadingAvatar(true);
    setAvatarUploadProgress(5);
    setSaveProfileMsg("");
    try {
      const nameClean = (profName || candidate.fullName || candidate.name || "Кандидат").trim();
      const uploaderName = candidate.email || (candidate.publicId ? `Кандидат #${candidate.publicId}` : "Кандидат");
      let avatarUrl = "";
      setAvatarUploadProgress(15);
      const { blob } = await cropToSquareWebP(file, 512, 0.9);
      setAvatarUploadProgress(35);
      const uploadFile = new File([blob], `${(nameClean || "").toLowerCase().replace(/[^a-z0-9а-яё]/gi, "_")}-avatar.webp`, { type: "image/webp" });
      const res = await getUploadService().uploadFileResult(uploadFile, {
        custom_name: `Фото: ${nameClean}`,
        owner_id: uploaderName,
        description: `Фото профиля кандидата ${nameClean} (квадратное кадрирование)`,
        onProgress: (pct) => setAvatarUploadProgress(Math.max(35, Math.min(95, pct))),
      });
      avatarUrl = res.url || res.original_url || "";

      if (!avatarUrl) {
        throw new Error("Не удалось получить ссылку на загруженное фото");
      }

      setAvatarUploadProgress(95);
      setProfAvatarUrl(avatarUrl);
      setCandidate((prev) => prev ? { ...prev, avatarUrl, avatar_url: avatarUrl } : prev);

      // Немедленно сохраняем в PostgreSQL BD ProTalk базу данных профиля кандидата
      const sess = getCandidateSession();
      const candIdent = candidate.publicId || candidate.id;
      await fetch("/api/candidate/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-candidate-token": sess?.token || candidate.id,
        },
        body: JSON.stringify({
          _token: sess?.token || candidate.id,
          candidate_id: candIdent,
          _patch: { avatar_url: avatarUrl, avatarUrl: avatarUrl },
        }),
      });

      if (sess) {
        saveCandidateSession({
          ...sess,
          avatar_url: avatarUrl,
        });
      }

      setAvatarUploadProgress(100);
      setSaveProfileMsg("Файл успешно загружен и профиль обновлен!");
      setTimeout(() => setSaveProfileMsg(""), 5000);
    } catch (err: any) {
      setSaveProfileMsg("⚠️ " + (err?.message || "Ошибка загрузки фото"));
    } finally {
      setIsUploadingAvatar(false);
      setTimeout(() => setAvatarUploadProgress(0), 1200);
    }
  };

  // Load candidate session from URL or localStorage
  const loadSession = async () => {
    const parts = path.split("/").filter(Boolean);
    const candIndex = parts.findIndex(p => {
      const lower = p.toLowerCase();
      return lower.startsWith("candidate") || lower.startsWith("cand");
    });
    
    const savedSession = getCandidateSession();
    let activeId = localStorage.getItem("cand_session_id") || (savedSession?.public_id ? `candidate${savedSession.public_id}` : savedSession?.candidate_id || "");
    // Treat a bare numeric first segment as a candidate public_id
    // (e.g. /200002/terms/vacancy). The dispatcher has already verified
    // that such a path belongs to a real candidate before mounting us.
    const barePidMode = candIndex === -1 && parts[0] && /^\d{4,}$/.test(parts[0]);
    if (barePidMode) {
      activeId = `candidate${parts[0]}`;
      localStorage.setItem("cand_session_id", activeId);
    }

    if (candIndex !== -1) {
      const raw = parts[candIndex];
      const pid = raw.replace(/^candidate/i, "").replace(/^cand/i, "");
      activeId = pid
        ? `candidate${pid}`
        : (savedSession?.public_id ? `candidate${savedSession.public_id}` : activeId);
      localStorage.setItem("cand_session_id", activeId);
    } else if (parts[0] && parts[0].startsWith("candidate")) {
      activeId = parts[0];
      localStorage.setItem("cand_session_id", activeId);
    }

    try {
      // 1. Fetch available projects from PostgreSQL BD ProTalk API in background (non-blocking for fast initial render)
      fetch("/api/projects")
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => {
          if (Array.isArray(list)) setAllProjects(list);
        })
        .catch(() => {});

      // 2. Resolve candidate via PostgreSQL BD ProTalk candidate cabinet endpoint
      let activeCand: any = null;
      let cabinetProject: any = null;
      let cabinetCompany: any = null;
      let cabinetEmployerContacts: any = null;

      const routeCompId = candIndex >= 2 ? (parts[0] || "").replace(/^com/i, "") : "";
      const routeVacId = candIndex >= 2 ? (parts[1] || "").replace(/^vac/i, "") : "";
      const routeCandId = candIndex !== -1
        ? (parts[candIndex] || "").replace(/^(candidate|cand)/i, "")
        : (barePidMode && parts[0] ? parts[0] : "");

      const pubId = routeCandId || activeId.replace(/^candidate/i, "").replace(/^cand/i, "");
      if (savedSession?.token && (savedSession.public_id === pubId || savedSession.candidate_id === pubId || !pubId)) {
        activeCand = {
          id: savedSession.candidate_id,
          publicId: savedSession.public_id || pubId,
          name: savedSession.full_name || savedSession.email || (pubId ? `Кандидат #${pubId}` : "Кандидат"),
          fullName: savedSession.full_name || "",
          email: savedSession.email || "",
          projectId: savedSession.project_id || routeVacId || "",
          companyId: savedSession.company_id || routeCompId || undefined,
          roleName: "",
          currentStage: "terms",
          registeredVia: "email",
        };
      }
      if (pubId) {
        try {
          const cabinetUrl = `/api/candidate/cabinet?public_id=${encodeURIComponent(pubId)}${routeVacId ? `&project_id=${encodeURIComponent(routeVacId)}` : ""}`;
          const respCabinet = await fetch(cabinetUrl, {
            headers: {
              "x-candidate-token": savedSession?.token || "",
            },
          });
          const rpcRes = await respCabinet.json();
          if (respCabinet.ok && rpcRes && rpcRes.ok && rpcRes.candidate) {
            const c = rpcRes.candidate;
            const resolvedFullName = c.full_name || c.fullName || "";
            const resolvedName = resolvedFullName || c.name || c.resume_name || c.email || (c.public_id ? `Кандидат #${c.public_id}` : "Кандидат");
            activeCand = {
              ...c,
              id: c.id,
              publicId: c.public_id,
              name: resolvedName,
              fullName: resolvedFullName,
              email: c.email || savedSession?.email || "",
              projectId: c.projectId || c.project_id || rpcRes?.project?.id || routeVacId || "",
              project_id: c.projectId || c.project_id || rpcRes?.project?.id || routeVacId || "",
              companyId: c.companyId || c.company_id || rpcRes?.company?.id || routeCompId || undefined,
              company_id: c.companyId || c.company_id || rpcRes?.company?.id || routeCompId || undefined,
              roleName: c.role_name || c.roleName || rpcRes?.project?.role_name || "",
              currentStage: c.current_stage || "terms",
              registeredVia: c.registered_via || "telegram",
              phone: c.phone || "",
              avatarUrl: c.avatar_url || "",
              resumeUrl: c.resume_url || "",
              socialTelegram: c.social_telegram || "",
              socialWhatsapp: c.social_whatsapp || "",
              socialInstagram: c.social_instagram || "",
              socialVk: c.social_vk || "",
              socialMax: c.social_max || "",
              socialSetka: c.social_setka || "",
              socialGithub: c.social_github || "",
            };
            saveCandidateSession({
              token: savedSession?.token || `cand_token_${c.public_id || c.id}`,
              candidate_id: c.id,
              public_id: c.public_id,
              project_id: c.project_id || rpcRes?.project?.id || routeVacId || null,
              company_id: c.company_id || rpcRes?.company?.id || routeCompId || null,
              email: c.email || savedSession?.email || null,
              full_name: resolvedFullName || null,
            });
            cabinetProject = rpcRes.project || null;
            cabinetCompany = rpcRes.company || null;
            cabinetEmployerContacts = rpcRes.employer_contacts || null;
            if (rpcRes.scores) {
              const sc = rpcRes.scores;
              (activeCand as any).scores = {
                resumeScore: sc.resume_score == null ? undefined : Number(sc.resume_score),
                checklistScore: sc.checklist_score == null ? undefined : Number(sc.checklist_score),
                situationsScore: sc.situations_score == null ? undefined : Number(sc.situations_score),
                interviewScore: sc.interview_score == null ? undefined : Number(sc.interview_score),
                overallScore: sc.overall_score == null ? undefined : Number(sc.overall_score),
                assessmentSummary: sc.assessment_summary || "",
                resumeFeedback: sc.resume_feedback || null,
                checklistFeedback: sc.checklist_feedback || null,
                situationsFeedback: sc.situations_feedback || null,
              };
            }
          }
        } catch {}
      }

      if (!activeCand && (activeId || pubId)) {
        const lookupKey = String(activeId || pubId);
        const resCand = await fetch(`/api/candidates/${encodeURIComponent(lookupKey)}`).catch(() => null as any);
        if (resCand && resCand.ok) {
          const rawC = await resCand.json().catch(() => null);
          if (rawC && rawC.id) {
            const resolvedFullName = rawC.full_name || rawC.fullName || "";
            const resolvedName = resolvedFullName || rawC.name || rawC.resume_name || rawC.email || (rawC.public_id ? `Кандидат #${rawC.public_id}` : "Кандидат");
            activeCand = {
              ...rawC,
              publicId: rawC.public_id || rawC.publicId,
              name: resolvedName,
              fullName: resolvedFullName,
              projectId: rawC.project_id || rawC.projectId,
              companyId: rawC.company_id || rawC.companyId,
            };
          }
        }
      }

      if (activeCand) {
        setCandidate(activeCand);
        setCurrentStage(activeCand.currentStage || "terms");

        // Load real scores from candidate scores endpoint
        if (!activeCand.scores) {
          try {
            const respSc = await fetch(`/api/candidate/scores?candidate_id=${encodeURIComponent(activeCand.publicId || activeCand.id)}`, {
              headers: {
                "x-candidate-token": savedSession?.token || activeCand.id,
              },
            });
            const sc = await respSc.json();
            if (respSc.ok && sc && sc.ok !== false) {
              (activeCand as any).scores = {
                resumeScore: sc.resume_score == null ? undefined : Number(sc.resume_score),
                checklistScore: sc.checklist_score == null ? undefined : Number(sc.checklist_score),
                situationsScore: sc.situations_score == null ? undefined : Number(sc.situations_score),
                interviewScore: sc.interview_score == null ? undefined : Number(sc.interview_score),
                overallScore: sc.overall_score == null ? undefined : Number(sc.overall_score),
                assessmentSummary: sc.assessment_summary || "",
                resumeFeedback: sc.resume_feedback || null,
                checklistFeedback: sc.checklist_feedback || null,
                situationsFeedback: sc.situations_feedback || null,
              };
              setCandidate({ ...activeCand });
            }
          } catch {}
        }

        // Set editing initial fields
        setProfName(activeCand.name || "");
        setProfEmail(activeCand.email || "");
        setProfTelegram(activeCand.telegramUsername || "");
        setProfPhone(activeCand.phone || "");
        setProfAvatarUrl(activeCand.avatarUrl || "");
        setProfResumeUrl(activeCand.resumeUrl || "");
        setProfSocials({
          social_telegram: activeCand.socialTelegram || "",
          social_whatsapp: activeCand.socialWhatsapp || "",
          social_instagram: activeCand.socialInstagram || "",
          social_vk: activeCand.socialVk || "",
          social_max: activeCand.socialMax || "",
          social_setka: activeCand.socialSetka || "",
          social_github: activeCand.socialGithub || "",
        });

        // Determine tabs
        let parsedTab = "profile";
        let parsedSubTab = "";

        if (candIndex !== -1) {
          if (candIndex === 0) {
            parsedTab = parts[1] || "profile";
            parsedSubTab = parts[2] || "";
          } else if (candIndex >= 2) {
            parsedTab = parts[3] || "profile";
            parsedSubTab = parts[4] || "";
          }
        } else {
          if (barePidMode) {
            // /{pid}/{tab}/{subtab?}
            parsedTab = parts[1] || "profile";
            parsedSubTab = parts[2] || "";
          } else if (parts[0] && parts[0].startsWith("candidate")) {
            parsedTab = parts[1] || "profile";
            parsedSubTab = parts[2] || "";
          } else if (parts[0] === "candidate") {
            parsedTab = parts[1] || "profile";
            parsedSubTab = parts[2] || "";
          }
        }

        setActiveTabState(parsedTab || activeCand.currentStage || "profile");
        if (parsedTab === "terms") {
          setTermsSubTabState(parsedSubTab || "vacancy");
        } else if (parsedTab === "training") {
          setTrainingSubTabState(parsedSubTab || "professional");
        } else if (parsedTab === "interview") {
          setInterviewSubTabState(parsedSubTab || "resume");
        }

        // Fetch corresponding project details. Prefer slug from canonical URL
        // (/com…/vac…/cand…/…); otherwise always fall back to the candidate's
        // bound project_id so the vacancy block is populated automatically.
        const routeProjId = candIndex >= 2 ? (parts[1] || "").replace(/^vac/i, "") : "";
        const activeProjId = routeProjId || activeCand.projectId || "";
        if (cabinetProject) {
          const p = cabinetProject;
          const co = cabinetCompany || {};
          setProject({
            id: p.id,
            companyName: co.name || "",
            companySlug: co.slug || undefined,
            employerId: p.employer_id,
            roleName: p.role_name,
            salaryTerms: p.salary_terms || undefined,
            scheduleTerms: p.schedule_terms || undefined,
            motivationText: p.motivation_text || undefined,
            customWiki: p.custom_wiki || undefined,
            checklistQuestions: Array.isArray(p.checklistQuestions) ? p.checklistQuestions : (Array.isArray(p.checklist_questions) ? p.checklist_questions : []),
            roleplayQuestions: Array.isArray(p.roleplayQuestions) ? p.roleplayQuestions : (Array.isArray(p.roleplay_questions) ? p.roleplay_questions : []),
            has_interview_blocks: p.has_interview_blocks,
            hasInterviewBlocks: p.hasInterviewBlocks,
            has_training_blocks: p.has_training_blocks,
            hasTrainingBlocks: p.hasTrainingBlocks,
            interviewLimit: p.interview_limit ?? p.interviewLimit,
            interviewUsed: p.interview_used ?? p.interviewUsed,
            trainingLimit: p.training_limit ?? p.trainingLimit,
            trainingUsed: p.training_used ?? p.trainingUsed,
            status: p.status || "active",
            logoUrl: p.logo_url || co.logo_url || undefined,
            slug: p.slug,
            publicId: p.public_id,
          } as any);
          setProjectFull(p);
          if (cabinetCompany) setCompanyFull(cabinetCompany);
          if (cabinetEmployerContacts) setEmployerContacts({
            name: cabinetEmployerContacts.name || cabinetEmployerContacts.employer_name || cabinetEmployerContacts.contact_name || null,
            email: cabinetEmployerContacts.email,
            phone: cabinetEmployerContacts.phone,
            telegram: cabinetEmployerContacts.telegram,
          });
        } else if (activeProjId) {
          const resProj = await fetch(`/api/projects/${activeProjId}`).catch(() => null as any);
          if (resProj && resProj.ok) {
            const p = await resProj.json();
            setProject({
              id: p.id,
              companyName: p.company?.name || p.companyName || p.company_name || "",
              companySlug: p.company?.slug || p.companySlug || p.company_slug || undefined,
              employerId: p.employer_id || p.employerId,
              roleName: p.role_name || p.roleName,
              salaryTerms: p.salary_terms || p.salaryTerms || undefined,
              scheduleTerms: p.schedule_terms || p.scheduleTerms || undefined,
              motivationText: p.motivation_text || p.motivationText || undefined,
              customWiki: p.custom_wiki || p.customWiki || undefined,
              checklistQuestions: Array.isArray(p.checklistQuestions) ? p.checklistQuestions : (Array.isArray(p.checklist_questions) ? p.checklist_questions : []),
              roleplayQuestions: Array.isArray(p.roleplayQuestions) ? p.roleplayQuestions : (Array.isArray(p.roleplay_questions) ? p.roleplay_questions : []),
              has_interview_blocks: p.has_interview_blocks ?? p.hasInterviewBlocks,
              hasInterviewBlocks: p.has_interview_blocks ?? p.hasInterviewBlocks,
              has_training_blocks: p.has_training_blocks ?? p.hasTrainingBlocks,
              hasTrainingBlocks: p.has_training_blocks ?? p.hasTrainingBlocks,
              interviewLimit: Math.round(Number(p.interview_limit ?? p.interviewLimit ?? 0)),
              interviewUsed: Math.round(Number(p.interview_used ?? p.interviewUsed ?? 0)),
              trainingLimit: Math.round(Number(p.training_limit ?? p.trainingLimit ?? 0)),
              trainingUsed: Math.round(Number(p.training_used ?? p.trainingUsed ?? 0)),
              status: p.status || "active",
              logoUrl: p.logo_url || p.logoUrl || undefined,
              slug: p.slug,
              publicId: p.public_id || p.publicId,
            } as any);
            setProjectFull(p);
            if (p.company) setCompanyFull(p.company);
            if (p.employer_name || p.employer?.contact_name || p.employer?.name) {
              setEmployerContacts(prev => ({
                ...prev,
                name: prev.name || p.employer_name || p.employer?.contact_name || p.employer?.name || null,
                email: prev.email || p.employer?.contact_email || p.employer?.email || null,
                phone: prev.phone || p.employer?.contact_phone || p.employer?.phone || null,
                telegram: prev.telegram || p.employer?.telegram || null,
              }));
            }
          }
        }
      }
    } catch (err) {
      console.error("Error loading candidate session:", err);
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  // Серверная синхронизация этапа через /api/candidate/stage
  const updateStageOnBackend = async (newStage: string, _additionalPayload: any = {}) => {
    if (!candidate) return;
    try {
      const sess = getCandidateSession();
      const candIdent = candidate.publicId || candidate.id;
      const resp = await fetch("/api/candidate/stage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-candidate-token": sess?.token || candidate.id,
        },
        body: JSON.stringify({
          _stage: newStage,
          candidate_id: candIdent,
          ..._additionalPayload,
        }),
      });
      const res = await resp.json();
      const persisted = (typeof res?.stage === "string" && res.stage) ? res.stage : newStage;
      setCurrentStage(persisted);
      await loadFlowState();
    } catch (err) {
      console.error("candidate_set_stage failed", err);
    }
  };

  // --- STAGE 2: 3-STEP INTEGRATED INTERVIEW AND SCORING STAGE ---
  const [resumeAnalysing, setResumeAnalysing] = useState(false);
  const [resumeFeedback, setResumeFeedback] = useState("");
  
  const [checklistAnalysing, setChecklistAnalysing] = useState(false);
  const [checklistFeedback, setChecklistFeedback] = useState("");
  
  const [situationsAnalysing, setSituationsAnalysing] = useState(false);
  
  // 20 Checklist questions state
  const [checklistAnswers, setChecklistAnswers] = useState<{ question: string; answer: string; type?: string; options?: string[] }[]>([]);
  const [checklistSysAnswers, setChecklistSysAnswers] = useState<{ question: string; answer: string; type?: string; options?: string[] }[]>([]);
  const [activeChecklistPart, setActiveChecklistPart] = useState<"prof" | "sys">("prof");
  const [checklistSysFeedback, setChecklistSysFeedback] = useState("");
  const [checklistSysAnalysing, setChecklistSysAnalysing] = useState(false);

  // 3 situational cases
  const [situationsList, setSituationsList] = useState<any[]>([]);
  const [activeSitIdx, setActiveSitIdx] = useState(0);
  const [activeSitTextInput, setActiveSitTextInput] = useState("");
  const [sitEvaluatingId, setSitEvaluatingId] = useState<string | null>(null);

  // Resume Drag & Drop Usability handling
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextEntry, setResumeTextEntry] = useState("Имеется высшее образование, 3 года успешных продаж в ИТ-компании, владею amoCRM, навыки активного ведения переговоров.");
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachmentUploaded, setAttachmentUploaded] = useState(false);

  // Helper inside CandidateFlow to refresh Candidate session
  const refreshCandidate = async () => {
    if (!candidate) return;
    try {
      const lookupKey = String((candidate as any).uuid || candidate.id || candidate.publicId || "");
      if (!lookupKey) return;
      const res = await fetch(`/api/candidates/${encodeURIComponent(lookupKey)}`);
      if (!res.ok) return;
      const current = await res.json();
      if (current && current.id) {
        setCandidate((prev: any) => ({ ...(prev || {}), ...current }));
        setCurrentStage(current.current_stage || current.currentStage || "terms");
      }
    } catch (e) {
      console.error("Error refreshing candidate:", e);
    }
  };

  // Run initialisers for the 20 checklist questions and 3 situations
  const initSituations = (role: string) => {
    const sit1 = {
      id: "sit_1",
      title: "Кейс 1: Работа с возражениями 'Дорого'",
      desc: "Клиент говорит: 'У ваших конкурентов аналогичное решение стоит на 30% дешевле, не вижу смысла платить больше'.",
      botPrompt: "Я ухожу к конкурентам. Почему я должен переплачивать вам за то же самое?",
      transcript: [
        { sender: "bot", text: "Я ухожу к конкурентам. Почему я должен переплачивать вам за то же самое?" }
      ] as { sender: "bot" | "user", text: string }[],
      score: 0,
      feedback: "",
      submitted: false,
    };
    const sit2 = {
      id: "sit_2",
      title: "Кейс 2: Требование невозможного дедлайна",
      desc: "Руководитель требует внести критическое изменение в проект к сегодняшнему вечеру, хотя на это требуется минимум три дня.",
      botPrompt: "Мне все равно на технические сложности! Запуск сегодня вечером, иначе мы сорвем контракт с партнером и виноваты будете вы. Сделаете?",
      transcript: [
        { sender: "bot", text: "Мне все равно на технические сложности! Запуск сегодня вечером, иначе мы сорвем контракт с партнером и виноваты будете вы. Сделаете?" }
      ] as { sender: "bot" | "user", text: string }[],
      score: 0,
      feedback: "",
      submitted: false,
    };
    const sit3 = {
      id: "sit_3",
      title: "Кейс 3: Согласование бюджетов с Финдиром",
      desc: "Вам необходимо защитить перед финансовым директором целесообразность закупки современного ПО для оптимизации работы за 50 тыс. руб.",
      botPrompt: "Наш бюджет расписан до копейки. Зачем нам переплачивать за ваши модные ИИ-инструменты?",
      transcript: [
        { sender: "bot", text: "Наш бюджет расписан до копейки. Зачем нам переплачивать за ваши модные ИИ-инструменты?" }
      ] as { sender: "bot" | "user", text: string }[],
      score: 0,
      feedback: "",
      submitted: false,
    };
    
    const normRole = (role || "").toLowerCase();
    if (normRole.includes("разработ") || normRole.includes("it") || normRole.includes("програм") || normRole.includes("аналитик") || normRole.includes("тестир")) {
      sit1.title = "Кейс 1: Срочное внесение изменений в архитектуру";
      sit1.desc = "Заказчик требует посреди спринта переделать структуру баз данных и поменять сторонний API интеграции.";
      sit1.botPrompt = "Нам срочно нужно заменить весь платежный шлюз на Stripe уже к завтрашнему утру для презентации инвесторам! Справитесь?";
      sit1.transcript = [
        { sender: "bot", text: "Нам срочно нужно заменить весь платежный шлюз на Stripe уже к завтрашнему утру для презентации инвесторам! Справитесь?" }
      ];
      
      sit2.title = "Кейс 2: Критическая регрессия на прод сервере";
      sit2.desc = "База полетела прямо во время демонстрации заказчикам. Ведущий девопс-инженер недоступен.";
      sit2.botPrompt = "Все лежит! Пользователи видят 500 ошибку. Что вы будете предпринимать прямо сейчас?";
      sit2.transcript = [
        { sender: "bot", text: "Все лежит! Пользователи видят 500 ошибку, а через час у нас созвон с крупным фондом. Что вы будете предпринимать прямо сейчас?" }
      ];
      
      sit3.title = "Кейс 3: Архитектурные разногласия с Тимлидом";
      sit3.desc = "Вы считаете, что нужно использовать масштабируемый NoSQL, а тимлид настаивает на традиционной реляционной СУБД.";
      sit3.botPrompt = "NoSQL принесет кучу проблем в будущем с поддержкой транзакций. Давай писать на PostgreSQL. Обоснуй аргументы.";
      sit3.transcript = [
        { sender: "bot", text: "NoSQL принесет кучу проблем в будущем с поддержкой транзакций. Давай писать на PostgreSQL. Обоснуй аргументы в копилку своей идеи." }
      ];
    }
    
    setSituationsList([sit1, sit2, sit3]);
  };

  // Populate checklist questions and cases when candidate context resolves
  useEffect(() => {
    const loadAllChecklistsAndCases = async () => {
      if (!candidate) return;
      const role = candidate.roleName || project?.roleName || "Менеджер";
      const company = project?.companyName || "Компания";

      try {
        // Load Profession Checklist
        if (checklistAnswers.length === 0) {
          const respProf = await fetch(`/api/get-questions?category=checklist_prof&roleName=${encodeURIComponent(role)}&companyName=${encodeURIComponent(company)}`);
          const qsPr = await respProf.json();
          setChecklistAnswers(qsPr.map((qObj: any) => ({
            question: qObj.question,
            type: qObj.type,
            options: qObj.options,
            correctAnswer: qObj.correctAnswer,
            userAnswer: qObj.type === "select" ? qObj.options?.[0] || "" : getSmartDefaultAnswer(qObj.question, role),
            answer: qObj.type === "select" ? qObj.options?.[0] || "" : getSmartDefaultAnswer(qObj.question, role)
          })));
        }

        // Load System Checklist
        if (checklistSysAnswers.length === 0) {
          const respSys = await fetch(`/api/get-questions?category=checklist_sys&roleName=${encodeURIComponent(role)}&companyName=${encodeURIComponent(company)}`);
          const qsSy = await respSys.json();
          setChecklistSysAnswers(qsSy.map((qObj: any) => ({
            question: qObj.question,
            type: qObj.type,
            options: qObj.options,
            correctAnswer: qObj.correctAnswer,
            userAnswer: qObj.type === "select" ? qObj.options?.[0] || "" : getSmartDefaultAnswer(qObj.question, role),
            answer: qObj.type === "select" ? qObj.options?.[0] || "" : getSmartDefaultAnswer(qObj.question, role)
          })));
        }

        initSituations(role);
      } catch (err) {
        console.error("Error loading checklist questions from backend:", err);
      }
    };

    if (candidate && (checklistAnswers.length === 0 || checklistSysAnswers.length === 0)) {
      loadAllChecklistsAndCases();
    }
  }, [candidate, project]);

  // Stage 1 -> Stage 2 (Interviewing).
  // Списание лимита интервью выполняется ТОЛЬКО на сервере в ai-interview-screen-resume-v2
  // (RPC charge_project_limit) после успешного сохранения оценки резюме —
  // клиентского spend_pack здесь быть не должно, иначе будет двойное списание.
  const handleStartInterview = () => {
    setInterviewSubTab("resume");
    updateStageOnBackend("interview");
  };

  const handleEvaluateResume = async () => {
    if (!candidate) return;
    setResumeAnalysing(true);
    try {
      const { aiEvaluate } = await import("@/lib/aiClient");
      const result: any = await aiWaitRun({
        title: "Оценка резюме",
        task: () => aiEvaluate({
          mode: "resume",
          candidate_id: candidate.id,
          project_id: candidate.projectId,
          payload: {
            role_name: candidate.roleName,
            resume: resumeTextEntry + (resumeFile ? ` [Файл: ${resumeFile.name}]` : ""),
          },
        }),
      });
      if (!result) return;
      const feedback = result?.summary || `Сильные стороны: ${(result?.strengths || []).join(", ")}\nПробелы: ${(result?.gaps || []).join(", ")}`;
      setResumeFeedback(feedback);
      await refreshCandidate();
    } catch (e) {
      console.error(e);
    } finally {
      setResumeAnalysing(false);
    }
  };

  const handleEvaluateChecklist = async () => {
    if (!candidate) return;
    const isSys = activeChecklistPart === "sys";
    if (isSys) {
      setChecklistSysAnalysing(true);
    } else {
      setChecklistAnalysing(true);
    }
    try {
      const { aiEvaluate } = await import("@/lib/aiClient");
      const result: any = await aiWaitRun({
        title: "Проверка чек-листа",
        task: () => aiEvaluate({
          mode: "checklist",
          candidate_id: candidate.id,
          project_id: candidate.projectId,
          payload: {
            is_system: isSys,
            answers: isSys ? checklistSysAnswers : checklistAnswers,
          },
        }),
      });
      if (!result) return;
      const feedback = `Итог: ${result?.total ?? "—"}/100\n` +
        (result?.items || []).map((it: any, i: number) => `${i+1}. ${it.feedback || ""}`).join("\n");
      if (isSys) setChecklistSysFeedback(feedback);
      else setChecklistFeedback(feedback);
      await refreshCandidate();
    } catch (e) {
      console.error(e);
    } finally {
      setChecklistAnalysing(false);
      setChecklistSysAnalysing(false);
    }
  };

  const handleSendSituationMessage = async (idx: number) => {
    if (!activeSitTextInput.trim()) return;
    const currentList = [...situationsList];
    const targetSit = currentList[idx];
    if (targetSit.submitted) return;

    targetSit.transcript.push({ sender: "user", text: activeSitTextInput });
    const userMsgText = activeSitTextInput;
    setActiveSitTextInput("");
    setSituationsList(currentList);

    setSitEvaluatingId(targetSit.id);
    try {
      const { aiEvaluate } = await import("@/lib/aiClient");
      const result: any = await aiWaitRun({
        title: "Оценка ответа",
        task: () => aiEvaluate({
          mode: "situations",
          candidate_id: candidate?.id,
          project_id: candidate?.projectId,
          payload: { answers: [{ question: targetSit.title || targetSit.desc, answer: userMsgText }] },
        }),
      });
      if (result) {
      {
        targetSit.score = result?.total ?? result?.items?.[0]?.score ?? 85;
        targetSit.feedback = result?.advice || result?.items?.[0]?.feedback || "Прекрасно обыграли ситуацию!";
        targetSit.transcript.push({
          sender: "bot",
          text: `🎯 Оценка за кейс: ${targetSit.score} / 100 баллов.\n\nРазбор Робота:\n${targetSit.feedback}`
        });
        targetSit.submitted = true;
        setSituationsList(currentList);
        await refreshCandidate();
      }
      }
    } catch (e) {
      console.error(e);
      targetSit.transcript.push({ sender: "bot", text: "Ошибка связи с ИИ-рекрутером. Пожалуйста, попробуйте еще раз!" });
      setSituationsList(currentList);
    } finally {
      setSitEvaluatingId(null);
    }
  };

  const handleFinishRoleplay = async () => {
    if (!candidate) return;
    setSituationsAnalysing(true);
    try {
      const formattedCaseAnswers = situationsList.map(sit => ({
        question: sit.title,
        answer: sit.transcript.map((t: any) => `${t.sender === "user" ? "Вы" : "Робот"}: ${t.text}`).join("\n")
      }));
      const { aiEvaluate } = await import("@/lib/aiClient");
      const ok = await aiWaitRun({
        title: "Итоговая оценка ролевых ситуаций",
        task: () => aiEvaluate({
          mode: "situations",
          candidate_id: candidate.id,
          project_id: candidate.projectId,
          payload: { answers: formattedCaseAnswers },
        }),
      });
      if (!ok) return;
      await refreshCandidate();
      await updateStageOnBackend("scoring");
      setActiveTab("scoring");
    } catch (e) {
      console.error(e);
    } finally {
      setSituationsAnalysing(false);
    }
  };

  // Resume Drag & Drop Usability handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setResumeFile(e.dataTransfer.files[0]);
      setAttachmentUploaded(true);
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setResumeFile(e.target.files[0]);
      setAttachmentUploaded(true);
    }
  };

  // --- STAGE 4: INTERACTIVE TRAINING & LESSON PANEL ---
  const [activeLessonIdx, setActiveLessonIdx] = useState(0);

  const getTrainingBlockIdx = () => {
    if (trainingSubTab === "professional") return 0;
    if (trainingSubTab === "product") return 1;
    if (trainingSubTab === "system") return 2;
    return 0;
  };

  // Active quiz choice
  const [selectedQuizIdx, setSelectedQuizIdx] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizMessage, setQuizMessage] = useState("");
  const [quizError, setQuizError] = useState(false);

  // Training Exam states for hybrid 20 questions (10 select, 10 text)
  const [trainingAnswers, setTrainingAnswers] = useState<any[]>([]);
  const [trainingExamSubmitted, setTrainingExamSubmitted] = useState(false);
  const [trainingExamFeedback, setTrainingExamFeedback] = useState("");
  const [trainingExamScore, setTrainingExamScore] = useState(0);
  const [trainingExamAnalysing, setTrainingExamAnalysing] = useState(false);
  const [activeTrainingSubSectionIdx, setActiveTrainingSubSectionIdx] = useState(0);

  // Auto load active lesson's 20 quizzes
  const bIdxLocal = getTrainingBlockIdx();
  const currentBlockObj = candidate?.trainingPlan?.[bIdxLocal];
  const activeLessonObj = currentBlockObj?.lessons?.[activeLessonIdx];

  useEffect(() => {
    setActiveTrainingSubSectionIdx(0);
  }, [trainingSubTab]);

  useEffect(() => {
    if (activeLessonObj && activeLessonObj.quizzes) {
      setTrainingAnswers(activeLessonObj.quizzes.map((q: any) => ({
        ...q,
        userAnswer: q.userAnswer || ""
      })));
      setTrainingExamSubmitted(activeLessonObj.isCompleted || false);
      setTrainingExamFeedback(activeLessonObj.quizFeedback || "");
      setTrainingExamScore(activeLessonObj.score || 0);
    } else {
      setTrainingAnswers([]);
      setTrainingExamSubmitted(false);
      setTrainingExamFeedback("");
      setTrainingExamScore(0);
    }
  }, [activeLessonObj]);

  const handleTrainingExamSubmit = async () => {
    if (!candidate) return;
    setTrainingExamAnalysing(true);
    try {
      const bIdx = getTrainingBlockIdx();
      const { aiEvaluate } = await import("@/lib/aiClient");
      const result: any = await aiWaitRun({
        title: "Проверка экзамена",
        task: () => aiEvaluate({
          mode: "training_block",
          candidate_id: candidate.id,
          project_id: candidate.projectId,
          payload: { block_index: bIdx, answers: trainingAnswers },
        }),
      });
      if (!result) return;
      setTrainingExamScore(result?.block_score ?? 0);
      setTrainingExamFeedback(result?.summary || "");
      setTrainingExamSubmitted(true);
      await refreshCandidate();
    } catch (e) {
      console.error(e);
    } finally {
      setTrainingExamAnalysing(false);
    }
  };

  const handleLessonQuizSubmit = () => {
    if (!candidate || !candidate.trainingPlan) return;
    if (selectedQuizIdx === null) return;

    const bIdx = getTrainingBlockIdx();
    const block = candidate.trainingPlan[bIdx];
    if (!block) return;
    const lesson = block.lessons[activeLessonIdx];

    if (lesson && lesson.quiz) {
      const isCorrect = selectedQuizIdx === lesson.quiz.answerIndex;
      setQuizSubmitted(true);

      if (isCorrect) {
        setQuizError(false);
        setQuizMessage("✨ Отлично! Правильный ответ! Вы успешно усвоили урок.");
        
        // Mark lesson complete dynamically in training plan arrays
        const updatedPlan = [...candidate.trainingPlan];
        updatedPlan[bIdx].lessons[activeLessonIdx].isCompleted = true;

        // Check if all lessons across all blocks are finished
        const allCompleted = updatedPlan.every(b => b.lessons.every(l => l.isCompleted));
        
        if (allCompleted) {
          updateStageOnBackend("certified", { trainingPlan: updatedPlan });
        } else {
          // Sync current block complete back to backend
          updateStageOnBackend("training", { trainingPlan: updatedPlan });
        }
      } else {
        setQuizError(true);
        setQuizMessage("❌ Неверный ответ. Пожалуйста, внимательно изучите теорию урока выше и попробуйте еще раз.");
      }
    }
  };

  const handleNextLesson = () => {
    if (!candidate || !candidate.trainingPlan) return;

    setSelectedQuizIdx(null);
    setQuizSubmitted(false);
    setQuizMessage("");

    const bIdx = getTrainingBlockIdx();
    const block = candidate.trainingPlan[bIdx];
    if (!block) return;
    const nextLessonIdx = activeLessonIdx + 1;

    if (nextLessonIdx < block.lessons.length) {
      setActiveLessonIdx(nextLessonIdx);
    } else {
      // Auto move to next subtab of training block to represent successful flow progression!
      if (trainingSubTab === "professional") {
        setTrainingSubTab("product");
        setActiveLessonIdx(0);
      } else if (trainingSubTab === "product") {
        setTrainingSubTab("system");
        setActiveLessonIdx(0);
      } else {
        // finished system, check if certified is set
        setActiveTab("certified");
      }
    }
  };


  const tabsList = [
    { id: "profile", title: "👤 Профиль", desc: "Мой кабинет" },
    { id: "terms", title: "📋 Условия", desc: "О вакансии" },
    { id: "interview", title: "💬 Собесед-ние", desc: "Блиц HR-ИИ" },
    { id: "training", title: "ИИ обучение", desc: "Курс и тесты", isTraining: true },
    { id: "certified", title: "🏆 Сертификат", desc: "Мой диплом" }
  ];

  // Initial-load gate: avoid flashing the empty cabinet (or the
  // "no vacancy" message) while we still resolve the session.
  if (sessionLoading) {
    const loadingLogo = companyFull?.logo_url || (project as any)?.logoUrl;
    const loadingCompanyName = companyFull?.name || project?.companyName || "Компания";
    return (
      <div id="company-landing-root" className="company-landing-root candidate-flow-root relative min-h-screen text-white font-sans antialiased flex items-center justify-center p-4 overflow-hidden">
        <CandidateThemedBackground theme={activeCompanyTheme} />
        
        {/* Apple Liquid Glass Centered Loading Plaque */}
        <div
          className="section-card liquid-glass-card relative z-10 p-8 sm:p-10 border backdrop-blur-2xl text-center max-w-sm w-full mx-auto flex flex-col items-center gap-5 shadow-2xl transition-all"
          style={{
            backgroundColor: "transparent",
            borderColor: activeCompanyTheme?.containerBorderColor
              ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
              : "rgba(255, 255, 255, 0.25)",
            borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
            borderRadius: activeCompanyTheme?.containerBorderRadius != null
              ? `${activeCompanyTheme.containerBorderRadius}px`
              : "16px",
          }}
        >
          {/* Company Logo styled with company settings from database */}
          <CompanyThemedLogo
            logoUrl={loadingLogo}
            companyName={loadingCompanyName}
            theme={activeCompanyTheme}
            size="lg"
            className="mx-auto"
          />

          {/* Animated Spinner with company icon color and ambient glow */}
          <div className="relative flex items-center justify-center my-1">
            <div
              className="absolute w-12 h-12 rounded-full blur-md opacity-35 animate-pulse pointer-events-none"
              style={{ backgroundColor: activeCompanyTheme?.iconColor || activeCompanyTheme?.btnActiveBgColor || "#E7C768" }}
            />
            <Loader2
              className="w-10 h-10 animate-spin relative z-10"
              style={{ color: activeCompanyTheme?.iconColor || activeCompanyTheme?.btnActiveBgColor || "#E7C768" }}
            />
          </div>

          <div className="space-y-1 text-center">
            <div className="font-bold text-base text-white">
              Загрузка личного кабинета...
            </div>
            <div className="text-sm text-white/70">
              Синхронизация профиля и этапов
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div id="company-landing-root" className="company-landing-root candidate-flow-root relative min-h-screen text-white font-sans antialiased flex items-center justify-center p-6 overflow-hidden">
        <CandidateThemedBackground theme={activeCompanyTheme} />
        <div
          className="section-card liquid-glass-card relative z-10 max-w-md w-full p-8 border backdrop-blur-2xl text-center space-y-4 shadow-2xl"
          style={{
            backgroundColor: "transparent",
            borderColor: activeCompanyTheme?.containerBorderColor
              ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
              : "rgba(255, 255, 255, 0.25)",
            borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
            borderRadius: activeCompanyTheme?.containerBorderRadius != null
              ? `${activeCompanyTheme.containerBorderRadius}px`
              : "16px",
          }}
        >
          <div className="font-bold text-lg text-white" style={headingStyle}>Кабинет не найден</div>
          <p className="text-white/80 text-sm">
            Похоже, сессия истекла или ссылка устарела. Войдите ещё раз через страницу вакансии.
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full font-bold text-sm py-3 px-5 transition shadow-md border"
            style={activeBtnStyle}
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  // Block access if the underlying vacancy is archived/deleted/unpublished.
  if (projectFull && ((projectFull.status && projectFull.status !== "active") || projectFull.is_published === false)) {
    const isClosed = projectFull.status === "deleted";
    return (
      <div id="company-landing-root" className="company-landing-root candidate-flow-root relative min-h-screen text-white font-sans antialiased flex items-center justify-center p-6 overflow-hidden">
        <CandidateThemedBackground theme={activeCompanyTheme} />
        <div
          className="section-card liquid-glass-card relative z-10 max-w-md w-full p-8 border backdrop-blur-2xl text-center space-y-4 shadow-2xl"
          style={{
            backgroundColor: "transparent",
            borderColor: activeCompanyTheme?.containerBorderColor
              ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
              : "rgba(255, 255, 255, 0.25)",
            borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
            borderRadius: activeCompanyTheme?.containerBorderRadius != null
              ? `${activeCompanyTheme.containerBorderRadius}px`
              : "16px",
          }}
        >
          <div className="font-bold text-lg text-white" style={headingStyle}>
            {isClosed ? "Вакансия закрыта" : "Вакансия больше не активна"}
          </div>
          <p className="text-white/80 text-sm">
            Компания приостановила или закрыла набор по этой позиции. Ваши данные и история сохранены —
            свяжитесь с работодателем напрямую, если у вас остались вопросы.
          </p>
          <button
            onClick={() => navigate("/demo")}
            className="w-full font-bold text-sm py-3 px-5 transition shadow-md border"
            style={activeBtnStyle}
          >
            Попробовать демо-интервью
          </button>
        </div>
      </div>
    );
  }

  const companyLogo = companyFull?.logo_url || (project as any)?.logoUrl;

  return (
    <div id="company-landing-root" className="company-landing-root candidate-flow-root relative min-h-screen text-white font-sans antialiased flex flex-col justify-between overflow-x-hidden">
      {/* Dynamic Background and Animations from Company Theme */}
      <CandidateThemedBackground theme={activeCompanyTheme} />
      
      {/* Top Header Navigation with Direct Access Bypasses for Candidates */}
      <header className="sticky top-0 z-50 bg-transparent backdrop-blur-xl border-b border-white/10 px-4 md:px-8 py-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 w-full">
          {/* Logo & Vacancy info */}
          <div className="flex items-center gap-2.5 cursor-pointer w-full lg:w-auto" onClick={() => {
            const companyPub = companyFull?.public_id || (project as any)?.companyPublicId || "";
            const projectPub = (project as any)?.publicId || (project as any)?.slug || "";
            const candPub = candidate?.publicId || "";
            if (companyPub && projectPub && candPub) {
              navigate(`/com${companyPub}/vac${projectPub}/cand${candPub}/profile`);
            } else if (candPub) {
              navigate(`/cand${candPub}/profile`);
            }
          }}>
            {companyLogo ? (
              <div
                className="section-card liquid-glass-card p-1.5 border flex items-center justify-center"
                style={containerCardStyle}
              >
                <CompanyThemedLogo
                  logoUrl={companyLogo}
                  companyName={companyFull?.name || project?.companyName}
                  theme={activeCompanyTheme}
                  size="sm"
                  className="h-8 max-w-[120px]"
                />
              </div>
            ) : (
              <div
                className="section-card liquid-glass-card p-1.5 border flex items-center justify-center"
                style={containerCardStyle}
              >
                <CompanyThemedLogo
                  logoUrl={null}
                  companyName={companyFull?.name || project?.companyName || "RR"}
                  theme={activeCompanyTheme}
                  size="sm"
                  className="w-8 h-8"
                />
              </div>
            )}
            <div className="text-left">
              <span className="font-extrabold text-sm tracking-tight block leading-none" style={headingStyle}>Личный кабинет соискателя</span>
              <span className="text-sm block text-white/70 mt-1">
                ID кандидата: <strong className="text-white font-mono">{candidate?.publicId || "—"}</strong>
              </span>
            </div>
          </div>

          {/* Dedicated page tabs directly in header */}
          <nav className="hidden md:flex items-center bg-transparent backdrop-blur-xl p-1 gap-1 text-sm section-card liquid-glass-card border border-white/20" style={{ borderRadius: activeCompanyTheme?.btnBorderRadius != null ? `${activeCompanyTheme.btnBorderRadius + 4}px` : "12px" }}>
            {tabsList.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`cursor-pointer px-3.5 py-2 font-bold transition-all text-center flex items-center gap-1.5 whitespace-nowrap text-sm border ${
                    isActive
                      ? "landing-btn-active shadow-md scale-102"
                      : "landing-btn-inactive hover:bg-white/10"
                  }`}
                  style={isActive ? activeBtnStyle : inactiveBtnStyle}
                >
                  {tab.id === "training" ? (
                    <CompanyThemedLogo
                      logoUrl={companyLogo}
                      companyName={companyFull?.name || project?.companyName}
                      theme={activeCompanyTheme}
                      size="sm"
                      className="w-4 h-4 shrink-0 inline-flex"
                    />
                  ) : null}
                  <span className="text-sm">{tab.title}</span>
                </button>
              );
            })}
          </nav>

          {/* Right section: Name & Logout button */}
          <div className="hidden lg:flex items-center gap-3">
            {candidate && (
              <div
                className="section-card liquid-glass-card px-3.5 py-1.5 text-left text-sm border flex items-center gap-3"
                style={containerCardStyle}
              >
                <div className="leading-tight">
                  <span className="text-white/70 text-xs block font-normal">Авторизован:</span>
                  <strong className="font-bold block mt-0.5 text-sm" style={headingStyle}>{candidate.fullName || candidate.name || "Соискатель"}</strong>
                </div>
                <div className="w-px h-6 bg-white/20 my-auto"></div>
                <button
                  type="button"
                  onClick={() => {
                    clearCandidateSession();
                    localStorage.removeItem("cand_session_id");
                    localStorage.removeItem("cand_role");
                    window.location.href = getVacancyLandingUrl();
                  }}
                  className="cursor-pointer text-white px-2 py-1 font-bold transition text-sm flex items-center gap-1 hover:bg-white/10"
                  style={{
                    borderRadius: activeCompanyTheme?.btnBorderRadius != null ? `${Math.max(4, activeCompanyTheme.btnBorderRadius - 4)}px` : "8px",
                  }}
                  title="Выйти из кабинета"
                >
                  <span>Выйти 🚪</span>
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setAcademyModalSlug("candidate");
                setIsAcademyModalOpen(true);
              }}
              className="p-2 rounded-xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
              title="Обучающая инструкция: Кабинет соискателя (ИИ-Академия)"
              aria-label="Инструкция по кабинету соискателя"
            >
              <HelpCircle className="w-4 h-4 text-[#E7C768]" />
            </button>
            <NotificationsBell candidateId={candidate?.publicId || candidate?.id} activeTheme={activeCompanyTheme} />
          </div>

          {/* Mobile top-bar controls */}
          <div className="flex md:hidden items-center justify-between w-full border-t border-white/10 pt-2 mt-1">
            {candidate && (
              <div
                className="section-card liquid-glass-card px-3 py-1.5 text-left text-sm border flex items-center gap-2 max-w-[220px]"
                style={containerCardStyle}
              >
                <div className="truncate leading-tight">
                  <span className="text-white/70 text-xs block font-normal">Авторизован:</span>
                  <span className="text-sm font-semibold text-white truncate block">
                    {candidate.fullName || candidate.name}
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => {
                  setAcademyModalSlug("candidate");
                  setIsAcademyModalOpen(true);
                }}
                className="p-2 rounded-xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition-all cursor-pointer shadow-lg"
                title="Обучающая инструкция: Кабинет соискателя (ИИ-Академия)"
                aria-label="Инструкция по кабинету соискателя"
              >
                <HelpCircle className="w-4 h-4 text-[#E7C768]" />
              </button>
              <NotificationsBell candidateId={candidate?.publicId || candidate?.id} activeTheme={activeCompanyTheme} />
              <button 
                type="button"
                className="flex items-center justify-center p-2 text-white border transition-all"
                style={containerCardStyle}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-[#D4AF37]" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu container featuring the tabs directly */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
            <span className="text-sm text-white/70 font-bold block px-2 mb-1">Разделы кабинета:</span>
            {tabsList.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`transition text-left w-full px-4 py-3 flex items-center justify-between border ${
                    isActive
                      ? "landing-btn-active font-bold shadow-md"
                      : "landing-btn-inactive font-semibold hover:bg-white/10"
                  }`}
                  style={isActive ? activeBtnStyle : inactiveBtnStyle}
                >
                  <div className="flex items-center gap-2">
                    {tab.id === "training" ? (
                      <CompanyThemedLogo
                        logoUrl={companyLogo}
                        companyName={companyFull?.name || project?.companyName}
                        theme={activeCompanyTheme}
                        size="sm"
                        className="w-4 h-4 shrink-0 inline-flex"
                      />
                    ) : null}
                    <span className="text-sm">{tab.title}</span>
                  </div>
                  <span className={`text-sm font-normal ${isActive ? "opacity-90" : "opacity-75"}`}>{tab.desc}</span>
                </button>
              );
            })}
            <div className="h-px bg-white/10 my-1"></div>
            <button
              type="button"
              onClick={() => {
                clearCandidateSession();
                localStorage.removeItem("cand_session_id");
                localStorage.removeItem("cand_role");
                setMobileMenuOpen(false);
                navigate(getVacancyLandingUrl());
              }}
              className="cursor-pointer text-left w-full px-4 py-3 text-white border hover:bg-white/10 font-bold transition flex items-center justify-between text-sm"
              style={containerCardStyle}
            >
              <span>Выйти из кабинета 🚪</span>
              <span className="text-sm text-white/70 font-normal">Завершить сессию</span>
            </button>
          </div>
        )}

        {/* Fallback tablet/mobile secondary inline nav to allow tab selection without menu for sizes md -> lg */}
        <div className="hidden md:flex lg:hidden items-center justify-center bg-white/[0.03] backdrop-blur-xl p-1.5 rounded-xl border border-white/15 mt-3 gap-1">
          {tabsList.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-pointer px-3 py-2 font-semibold transition text-sm border flex items-center gap-1.5 ${
                  isActive ? "landing-btn-active shadow-md" : "landing-btn-inactive hover:bg-white/10"
                }`}
                style={isActive ? activeBtnStyle : inactiveBtnStyle}
              >
                {tab.id === "training" ? (
                  <CompanyThemedLogo
                    logoUrl={companyLogo}
                    companyName={companyFull?.name || project?.companyName}
                    theme={activeCompanyTheme}
                    size="sm"
                    className="w-4 h-4 shrink-0 inline-flex"
                  />
                ) : null}
                <span>{tab.title}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main interactive Stepper panel */}
      <main className="flex-1 py-8 px-4 md:px-8 max-w-5xl mx-auto w-full">
        <HireDecisionBanner candidateId={candidate?.id} />

        {/* Tab 1: Profile tab */}
        {activeTab === "profile" && (
          <div className="section-card liquid-glass-card bg-transparent border border-white/15 shadow-2xl backdrop-blur-2xl p-6 md:p-8 space-y-6" style={containerCardStyle}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/10">
              <div className="text-left">
                <span className="font-bold text-sm tracking-wide block" style={headingStyle}>Личный кабинет соискателя</span>
                <h2 className="text-2xl font-bold text-white mt-1">Профиль кандидата: {candidate?.fullName || candidate?.name || "Кандидат"}</h2>
                <p className="text-sm text-white/80 mt-1 flex items-center gap-2 flex-wrap">
                  <span>Зарегистрирован через {candidate?.registeredVia === "telegram" ? "Telegram 🤖" : "Email ✉️"}.</span>
                  <span>ID кандидата:</span>
                  <span
                    className="landing-btn-active font-mono text-sm px-2.5 py-0.5 font-bold inline-flex items-center shadow-sm"
                    style={{
                      backgroundColor: activeCompanyTheme?.btnActiveBgColor || undefined,
                      color: activeCompanyTheme?.btnActiveTextColor || undefined,
                      borderColor: activeCompanyTheme?.btnBorderColor || undefined,
                      borderRadius: activeCompanyTheme?.btnBorderRadius != null ? `${activeCompanyTheme.btnBorderRadius}px` : "8px",
                    }}
                  >
                    {candidate?.publicId || "—"}
                  </span>
                </p>
              </div>
              
              <button
                type="button"
                onClick={() => setEditingProfile(!editingProfile)}
                className="landing-btn-active cursor-pointer font-bold text-sm px-5 py-2.5 transition border shadow-lg"
                style={activeBtnStyle}
              >
                {editingProfile ? "Отмена редактирования" : "Редактировать профиль"}
              </button>
            </div>

            {saveProfileMsg && (
              <div
                className="section-card liquid-glass-card p-4 bg-transparent text-white border text-sm font-bold text-left backdrop-blur-2xl shadow-xl flex items-center gap-3 transition-all"
                style={{
                  backgroundColor: "transparent",
                  borderColor: activeCompanyTheme?.containerBorderColor
                    ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
                    : "rgba(255, 255, 255, 0.25)",
                  borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
                  borderRadius: activeCompanyTheme?.containerBorderRadius != null
                    ? `${activeCompanyTheme.containerBorderRadius}px`
                    : "16px",
                }}
              >
                <CheckCircle2
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }}
                />
                <span className="text-white text-sm font-medium">{saveProfileMsg}</span>
              </div>
            )}

            {editingProfile ? (
              <form onSubmit={handleSaveProfile} className="section-card liquid-glass-card space-y-4 max-w-xl bg-transparent p-6 border backdrop-blur-xl text-left" style={containerCardStyle}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-bold text-white">ФИО:</label>
                    <input
                      type="text"
                      autoComplete="name"
                      className="w-full bg-transparent text-sm text-white p-3 border backdrop-blur-md focus:outline-none"
                      style={inputStyle}
                      value={profName}
                      onChange={(e) => setProfName(e.target.value)}
                      placeholder="Иванов Иван Иванович"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-white">Email (Почта):</label>
                    <input
                      type="email"
                      className="w-full bg-transparent text-sm text-white p-3 border backdrop-blur-md focus:outline-none"
                      style={inputStyle}
                      value={profEmail}
                      onChange={(e) => setProfEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-white">Телефон:</label>
                    <input
                      type="tel"
                      className="w-full bg-transparent text-sm text-white p-3 border backdrop-blur-md focus:outline-none"
                      style={inputStyle}
                      value={profPhone}
                      placeholder="+7 (900) 123-45-67"
                      onChange={(e) => setProfPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-bold text-white">Ссылка на резюме (URL):</label>
                    <input
                      type="text"
                      className="w-full bg-transparent text-sm text-white p-3 border backdrop-blur-md focus:outline-none"
                      style={inputStyle}
                      value={profResumeUrl}
                      placeholder="https://hh.ru/..."
                      onChange={(e) => setProfResumeUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-bold text-white">Фото профиля:</label>
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-1">
                      {/* 3x Larger Photo */}
                      <div className="relative group flex-shrink-0">
                        {profAvatarUrl ? (
                          <div
                            className="w-48 h-48 sm:w-52 sm:h-52 aspect-square overflow-hidden border shadow-xl bg-transparent flex items-center justify-center"
                            style={{
                              borderColor: activeCompanyTheme?.containerBorderColor
                                ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
                                : "rgba(255,255,255,0.25)",
                              borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
                              borderRadius: inputStyle.borderRadius,
                            }}
                          >
                            <img
                              src={profAvatarUrl}
                              alt="avatar"
                              className="w-full h-full aspect-square object-cover object-center"
                            />
                          </div>
                        ) : (
                          <div
                            className="w-48 h-48 sm:w-52 sm:h-52 aspect-square border bg-transparent flex items-center justify-center text-white/50 text-sm shadow-xl"
                            style={{
                              borderColor: activeCompanyTheme?.containerBorderColor
                                ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
                                : "rgba(255,255,255,0.25)",
                              borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
                              borderRadius: inputStyle.borderRadius,
                            }}
                          >
                            Нет фото
                          </div>
                        )}
                        {/* Overlay when uploading */}
                        {isUploadingAvatar && (
                          <div
                            className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center text-white text-sm font-bold gap-2 p-4 text-center"
                            style={{ borderRadius: inputStyle.borderRadius }}
                          >
                            <Loader2 className="w-8 h-8 animate-spin" style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }} />
                            <span>Загрузка {avatarUploadProgress}%</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3 w-full">
                        <label
                          className={`cursor-pointer bg-transparent text-white border px-5 py-3 text-sm font-semibold transition inline-flex items-center justify-center gap-2 backdrop-blur-md shadow-sm ${isUploadingAvatar ? "opacity-75 cursor-wait" : "hover:bg-white/10"}`}
                          style={{
                            borderColor: activeCompanyTheme?.btnBorderColor
                              ? hexToRgba(activeCompanyTheme.btnBorderColor, activeCompanyTheme.btnBorderOpacity ?? 20)
                              : "rgba(255,255,255,0.25)",
                            borderRadius: inputStyle.borderRadius,
                          }}
                        >
                          {isUploadingAvatar ? (
                            <Loader2 className="w-5 h-5 animate-spin" style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }} />
                          ) : (
                            <Upload className="w-5 h-5" style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }} />
                          )}
                          <span>
                            {isUploadingAvatar ? `Загрузка фото: ${avatarUploadProgress}%` : "Загрузить фото профиля"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={isUploadingAvatar}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUploadAvatarProTalk(f);
                            }}
                            className="hidden"
                          />
                        </label>

                        {/* Progress Bar with Liquid Glass Style */}
                        {isUploadingAvatar && (
                          <div className="w-full space-y-1.5 pt-1">
                            <div className="flex items-center justify-between text-xs text-white/90">
                              <span>Процесс загрузки на сервер</span>
                              <span className="font-bold text-sm" style={headingStyle}>{avatarUploadProgress}%</span>
                            </div>
                            <div
                              className="w-full h-2.5 bg-transparent border overflow-hidden backdrop-blur-md"
                              style={{
                                borderColor: activeCompanyTheme?.containerBorderColor
                                  ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
                                  : "rgba(255, 255, 255, 0.25)",
                                borderRadius: inputStyle.borderRadius,
                              }}
                            >
                              <div
                                className="h-full transition-all duration-300 ease-out"
                                style={{
                                  width: `${avatarUploadProgress}%`,
                                  backgroundColor: activeCompanyTheme?.btnActiveBgColor || activeCompanyTheme?.iconColor || "#E7C768",
                                }}
                              />
                            </div>
                          </div>
                        )}

                        <span className="text-sm text-white/70">
                          Рекомендуется портретное фото в высоком разрешении. Поддерживаются форматы PNG, JPG, WebP.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="section-card liquid-glass-card p-4 border bg-transparent backdrop-blur-md space-y-3"
                  style={containerCardStyle}
                >
                  <div className="text-sm font-bold" style={headingStyle}>Смена пароля (необязательно)</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <PasswordField label="Текущий пароль" value={profCurrentPw} onChange={setProfCurrentPw} placeholder="••••••••" autoComplete="current-password" inputStyle={inputStyle} />
                    <PasswordField label="Новый пароль" value={profNewPw} onChange={setProfNewPw} placeholder="мин. 8 символов" autoComplete="new-password" inputStyle={inputStyle} />
                    <PasswordField label="Повторите новый" value={profNewPw2} onChange={setProfNewPw2} placeholder="••••••••" autoComplete="new-password" inputStyle={inputStyle} />
                  </div>
                </div>

                <div
                  className="section-card liquid-glass-card p-4 border bg-transparent backdrop-blur-md"
                  style={containerCardStyle}
                >
                  <div className="text-sm font-bold mb-2" style={headingStyle}>Соцсети (только ссылки, без подтверждения)</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      ["social_telegram", "Telegram"],
                      ["social_whatsapp", "WhatsApp"],
                      ["social_instagram", "Instagram"],
                      ["social_vk", "ВКонтакте"],
                      ["social_max", "MAX"],
                      ["social_setka", "Сетка"],
                      ["social_github", "GitHub"],
                    ].map(([k, label]) => (
                      <div key={k} className="space-y-1.5">
                        <label className="text-sm font-bold text-white/80">{label}</label>
                        <input
                          type="url"
                          value={profSocials[k] || ""}
                          onChange={(e) => setProfSocials({ ...profSocials, [k]: e.target.value })}
                          placeholder="https://..."
                          className="w-full bg-transparent text-sm text-white p-3 border backdrop-blur-md focus:outline-none"
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="landing-btn-active cursor-pointer font-bold text-sm py-3 px-6 transition shadow-lg border"
                  style={activeBtnStyle}
                >
                  Сохранить изменения
                </button>
              </form>
            ) : (
              <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. Контакты + соцсети */}
                <div className="section-card liquid-glass-card bg-transparent p-5 border border-white/20 backdrop-blur-xl space-y-4 text-left" style={containerCardStyle}>
                  <h3 className="font-bold text-sm border-b border-white/10 pb-2" style={headingStyle}>Контактные данные</h3>
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="relative group">
                        <div
                          className="w-48 h-48 sm:w-52 sm:h-52 aspect-square overflow-hidden shadow-xl border bg-transparent flex items-center justify-center"
                          style={{
                            borderColor: activeCompanyTheme?.containerBorderColor
                              ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
                              : "rgba(255,255,255,0.25)",
                            borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
                            borderRadius: containerCardStyle.borderRadius,
                          }}
                        >
                          <img
                            src={profAvatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${candidate?.id || 'me'}`}
                            alt="avatar"
                            className="w-full h-full aspect-square object-cover object-center"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        {isUploadingAvatar ? (
                          <div
                            className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center text-white text-sm font-bold gap-2 p-3 text-center"
                            style={{ borderRadius: containerCardStyle.borderRadius }}
                          >
                            <Loader2 className="w-8 h-8 animate-spin" style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }} />
                            <span>Загрузка {avatarUploadProgress}%</span>
                          </div>
                        ) : (
                          <label
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-white text-sm font-bold"
                            title="Сменить фото"
                            style={{ borderRadius: containerCardStyle.borderRadius }}
                          >
                            <Upload className="w-6 h-6 mb-1" style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }} />
                            <span>Сменить фото</span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isUploadingAvatar}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleUploadAvatarProTalk(f);
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* Explicit button under the photo */}
                      <label
                        className={`cursor-pointer bg-transparent text-white border px-4 py-2 text-sm font-semibold transition inline-flex items-center gap-2 backdrop-blur-md shadow-sm mt-3 ${isUploadingAvatar ? "opacity-75 cursor-wait" : "hover:bg-white/10"}`}
                        style={{
                          borderColor: activeCompanyTheme?.btnBorderColor
                            ? hexToRgba(activeCompanyTheme.btnBorderColor, activeCompanyTheme.btnBorderOpacity ?? 20)
                            : "rgba(255,255,255,0.25)",
                          borderRadius: containerCardStyle.borderRadius,
                        }}
                      >
                        {isUploadingAvatar ? (
                          <Loader2 className="w-4 h-4 animate-spin" style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }} />
                        ) : (
                          <Upload className="w-4 h-4" style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }} />
                        )}
                        <span>{isUploadingAvatar ? `Загрузка: ${avatarUploadProgress}%` : "Загрузить фото"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingAvatar}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleUploadAvatarProTalk(f);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="text-sm min-w-0 flex-1 space-y-2.5 w-full">
                      <div>
                        <div className="text-white/70 text-sm">ФИО:</div>
                        <div className="text-white font-bold text-base truncate">{candidate?.fullName || candidate?.name || "—"}</div>
                      </div>
                      <div>
                        <div className="text-white/70 text-sm">Email:</div>
                        <div
                          className="landing-heading text-base font-semibold truncate block"
                          style={emailHeadingStyle}
                        >
                          {candidate?.email || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-white/70 text-sm">Телефон:</div>
                        <div className="text-white font-bold text-base">{profPhone || candidate?.phone || "—"}</div>
                      </div>
                    </div>
                  </div>
                  {profResumeUrl && (
                    <a href={profResumeUrl} target="_blank" rel="noreferrer" className="text-[#D4AF37] text-sm underline flex items-center gap-1">
                      📄 Ссылка на резюме <ExternalLink className="w-3.5 h-3.5"/>
                    </a>
                  )}
                  {(() => {
                    const socialList: Array<[string, string]> = [
                      ["social_telegram", "Telegram"],
                      ["social_whatsapp", "WhatsApp"],
                      ["social_instagram", "Instagram"],
                      ["social_vk", "ВКонтакте"],
                      ["social_max", "MAX"],
                      ["social_setka", "Сетка"],
                      ["social_github", "GitHub"],
                    ];
                    const filled = socialList.filter(([k]) => (profSocials[k] || "").trim() !== "");
                    if (filled.length === 0) return null;
                    return (
                      <div className="pt-2 border-t border-white/10 space-y-1.5">
                        <div className="text-sm text-white/70 font-bold">Соцсети</div>
                        {filled.map(([k, label]) => {
                          const v = profSocials[k];
                          return (
                            <a
                              key={k}
                              href={v}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-sm text-white/90 hover:text-[#D4AF37] truncate"
                            >
                              {label}: <span className="text-[#D4AF37] underline">{v}</span>
                            </a>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* 2. Onboarding map Checklist progression */}
                <div className="section-card liquid-glass-card bg-transparent p-5 border border-white/10 backdrop-blur-xl space-y-4 text-left" style={containerCardStyle}>
                  <h3 className="font-bold text-sm border-b border-white/10 pb-2" style={headingStyle}>Степень прохождения</h3>
                  <div className="space-y-3.5 text-sm">
                    {(() => {
                      const cStage = (candidate as any)?.crmStage || (candidate as any)?.crm_stage || (candidate as any)?.currentStage || (candidate as any)?.stage || effectiveStage || "terms";
                      const isCert = cStage === "certified" || (candidate as any)?.certified;
                      const isTraining = ["professional", "product", "systems", "certified"].includes(cStage);
                      
                      const hasResume = candidate?.scores?.resumeScore != null;
                      const hasChecklist = candidate?.scores?.checklistScore != null;
                      const hasSituations = candidate?.scores?.situationsScore != null;
                      const completedInterviewStages = (hasResume ? 1 : 0) + (hasChecklist ? 1 : 0) + (hasSituations ? 1 : 0);
                      
                      const passScore = Number(projectFull?.interview_pass_score) > 0 ? Number(projectFull.interview_pass_score) : 70;
                      const avgScore = candidate?.scores?.overallScore != null
                        ? Number(candidate.scores.overallScore)
                        : (completedInterviewStages === 3 && interviewAverageScore !== null ? interviewAverageScore : null);
                      
                      const interviewPassed = cStage === "interview_success" || isTraining || (avgScore !== null && avgScore >= passScore && completedInterviewStages === 3);
                      const interviewFailed = cStage === "interview_reject" || (avgScore !== null && avgScore < passScore && completedInterviewStages === 3);
                      const interviewInProgress = !interviewPassed && !interviewFailed && (completedInterviewStages > 0 || cStage === "screening" || cStage === "checklist" || cStage === "situations");

                      const termsDone = Boolean(interviewInProgress || interviewPassed || interviewFailed || isTraining || completedInterviewStages > 0);
                      const interviewDone = interviewPassed;
                      const trainingDone = isCert;
                      const trainingActive = interviewPassed && !isCert;
                      const certDone = isCert;
                      const certActive = isCert;

                      const steps = [
                        {
                          id: "terms",
                          title: "Желаемые условия изучены",
                          isPast: termsDone,
                          isCurrent: !termsDone,
                          progress: termsDone ? "Условия приняты" : "Ознакомьтесь с условиями",
                        },
                        {
                          id: "interview",
                          title: "ИИ Собеседование",
                          isPast: interviewDone,
                          isCurrent: !interviewDone && termsDone,
                          progress: interviewDone
                            ? `Успешно пройдено${avgScore !== null ? ` (балл: ${avgScore}/100)` : ""}`
                            : interviewFailed
                            ? `Интервью не пройдено${avgScore !== null ? ` (балл: ${avgScore}/100, проходной: ${passScore})` : ""}`
                            : `${completedInterviewStages}/3 этапов пройдено${avgScore !== null ? ` • ${avgScore}/100` : ""}`,
                        },
                        {
                          id: "training",
                          title: "Корпоративное ИИ Обучение",
                          isPast: trainingDone,
                          isCurrent: trainingActive,
                          progress: trainingDone
                            ? "3/3 этапов обучения пройдено"
                            : trainingActive
                            ? `Обучение в процессе: ${cStage === "systems" ? "Этап 3: Системы" : cStage === "product" ? "Этап 2: Продукт" : "Этап 1: Профессия"}`
                            : `Доступно после прохождения интервью (мин. ${passScore}/100)`,
                        },
                        {
                          id: "certified",
                          title: "Выдан электронный сертификат",
                          isPast: certDone,
                          isCurrent: certActive,
                          progress: certDone
                            ? "Электронный сертификат готов и выдан 🎓"
                            : "Выдается после успешного прохождения 3 этапов обучения",
                        },
                      ];

                      return steps.map((step) => {
                        const isPast = step.isPast;
                        const isCurrent = step.isCurrent;
                        return (
                        <div
                          key={step.id}
                          className={`flex items-start gap-2.5 p-2.5 transition border ${
                            isCurrent ? "landing-btn-active shadow-md" : "border-transparent"
                          }`}
                          style={
                            isCurrent
                              ? {
                                  backgroundColor: activeCompanyTheme?.btnActiveBgColor || undefined,
                                  color: activeCompanyTheme?.btnActiveTextColor || undefined,
                                  borderColor: activeCompanyTheme?.btnBorderColor || undefined,
                                  borderRadius: activeCompanyTheme?.btnBorderRadius != null ? `${activeCompanyTheme.btnBorderRadius}px` : "12px",
                                }
                              : undefined
                          }
                        >
                          <CheckCircle
                            className="w-4 h-4 shrink-0 mt-0.5"
                            style={{
                              color: isCurrent
                                ? (activeCompanyTheme?.btnActiveTextColor || "#FFFFFF")
                                : isPast
                                ? (activeCompanyTheme?.iconColor || "#E7C768")
                                : "rgba(255,255,255,0.4)",
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <span
                              className="font-bold text-sm block"
                              style={{
                                color: isCurrent
                                  ? (activeCompanyTheme?.btnActiveTextColor || "#FFFFFF")
                                  : isPast
                                  ? "#FFFFFF"
                                  : "rgba(255,255,255,0.6)",
                              }}
                            >
                              {step.title}
                            </span>
                            {isCurrent && (
                              <span
                                className="block text-sm font-semibold mt-0.5 opacity-90"
                                style={{
                                  color: activeCompanyTheme?.btnActiveTextColor || "#FFFFFF",
                                }}
                              >
                                Текущий шаг ИИ-отбора
                              </span>
                            )}
                            {step.progress && (
                              <span
                                className="block text-sm mt-0.5 opacity-80"
                                style={{
                                  color: isCurrent
                                    ? (activeCompanyTheme?.btnActiveTextColor || "#FFFFFF")
                                    : "rgba(255,255,255,0.7)",
                                }}
                              >
                                {step.progress}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  </div>
                </div>
              </div>

              {/* «Выбор компании/вакансии» удалён — кандидат уже находится внутри
                  конкретной вакансии, выбирать ничего не нужно. Связь с
                  candidate.project_id сохраняется в БД и не меняется UI. */}
              {candidate?.id && (
                <CandidateFieldsEditorBlock
                  candidateId={candidate.id}
                  candidate={candidate}
                  customFieldsConfig={(projectFull as any)?.candidate_fields_config || (projectFull as any)?.candidateFieldsConfig || (project as any)?.candidate_fields_config}
                  persistToDb={true}
                  editable={true}
                  activeTheme={activeCompanyTheme}
                  title="Анкета кандидата (26 стандартных и дополнительные поля вакансии)"
                  subtitle="Данные автоматически распознаны из вашего резюме и анкеты. Вы можете дополнить или отредактировать любое поле."
                  onSaved={() => { void loadFlowState(); }}
                />
              )}
              </div>
            )}

          </div>
        )}

        {/* Tab 2: Terms & Conditions with nested tabs */}
        {activeTab === "terms" && (
          <Reveal key="tab-terms" direction="up" className="section-card liquid-glass-card bg-transparent border border-white/20 shadow-2xl backdrop-blur-2xl overflow-hidden min-h-[480px] flex flex-col md:flex-row" style={containerCardStyle}>
            
            {/* Left/Internal Sub navigation list */}
            <div className="w-full md:w-60 bg-transparent p-4 border-r border-white/20 flex flex-col justify-between backdrop-blur-xl">
              <div className="space-y-4">
                <div className="border-b border-white/10 pb-3 text-left">
                  <span className="font-bold text-sm block" style={headingStyle}>Разделы условий</span>
                  <h3 className="font-extrabold text-base text-white mt-0.5">Условия работы</h3>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: "vacancy", title: "💼 Вакансия", desc: "Суть работы" },
                    { id: "motivation", title: "🚀 Мотивация", desc: "Ваш доход и рост" },
                    { id: "company", title: "🏢 О компании", desc: "Кто мы такие" },
                    { id: "onboarding", title: "✍️ Оформление", desc: "Трудоустройство" },
                    { id: "payouts", title: "💳 Выплаты", desc: "Когда и сколько" },
                    { id: "schedule", title: "📅 График", desc: "Режим и смены" },
                    { id: "team", title: "👥 Команда", desc: "Коллеги и руководство" },
                    { id: "system", title: "⚙️ Система", desc: "Регламенты и Wiki" },
                    { id: "contacts", title: "📞 Контакты", desc: "Связаться с работодателем" }
                  ].map((subTab) => {
                    const isSelected = termsSubTab === subTab.id;
                    return (
                      <button
                        type="button"
                        key={subTab.id}
                        onClick={() => setTermsSubTab(subTab.id)}
                        className={`cursor-pointer w-full text-left p-2.5 transition duration-150 flex flex-col border ${
                          isSelected
                            ? "landing-btn-active shadow-md font-bold"
                            : "landing-btn-inactive"
                        }`}
                        style={isSelected ? activeBtnStyle : inactiveBtnStyle}
                      >
                        <span className="text-sm font-semibold">{subTab.title}</span>
                        <span
                          className={`text-sm font-normal ${
                            isSelected ? "opacity-90" : "opacity-75"
                          }`}
                          style={isSelected && activeCompanyTheme?.btnActiveTextColor ? { color: activeCompanyTheme.btnActiveTextColor } : undefined}
                        >
                          {subTab.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 section-card liquid-glass-card bg-transparent p-3.5 border border-white/20 text-center hidden md:block backdrop-blur-xl" style={containerCardStyle}>
                <Mascot state="narrator" size="sm" />
                <p className="text-sm text-white/80 mt-1.5 leading-snug">Ознакомьтесь со всеми вкладками, далее нажмите "Пройти собеседование"!</p>
              </div>
            </div>

            {/* Right panel details based on subTab */}
            <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
              <div className="space-y-6 text-left">
                
                {termsSubTab === "vacancy" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Опубликованная вакансия</span>
                    <h2 className="text-2xl font-bold text-white">{project?.roleName || "Специалист"}</h2>
                    <CandidateVacancyBlock
                      vacancyText={projectFull?.vacancy_text || `• Мы ищем специалиста на должность ${project?.roleName || ""}.`}
                      tasksText={projectFull?.tasks_activity_text}
                      activeTheme={activeCompanyTheme}
                    />
                  </div>
                )}

                {termsSubTab === "motivation" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Мотивационный буклет</span>
                    <h2 className="text-xl font-bold text-white">Мотивация и карьерный рост</h2>
                    <div
                      className="section-card liquid-glass-card bg-transparent p-5 border backdrop-blur-2xl space-y-3"
                      style={containerCardStyle}
                    >
                      <p
                        className="text-sm text-white/90 leading-relaxed italic border-l-2 pl-3 whitespace-pre-wrap"
                        style={{ borderColor: activeCompanyTheme?.headingsSolidColor || "#D4AF37" }}
                      >
                        {projectFull?.motivation_text || project?.motivationText || "Карьерный рост, стабильный оклад и оплачиваемое обучение."}
                      </p>
                    </div>
                  </div>
                )}

                {termsSubTab === "company" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Манифест организации</span>
                    <h2 className="text-xl font-bold text-white flex items-center gap-3 flex-wrap">
                      {(() => {
                        const cpid = companyFull?.public_id || (project as any)?.companyPublicId;
                        const logo = companyFull?.logo_url || (project as any)?.logoUrl;
                        const label = project?.companyName || "ООО Работодатель";
                        const go = () => cpid && navigate(`/com${cpid}`);
                        const containerRadius = activeCompanyTheme?.containerBorderRadius != null ? `${activeCompanyTheme.containerBorderRadius}px` : "16px";
                        return (
                          <>
                            {logo && (
                              <button
                                type="button"
                                onClick={go}
                                disabled={!cpid}
                                title={cpid ? "Открыть страницу компании" : ""}
                                className={`w-14 h-14 bg-transparent border p-1.5 flex items-center justify-center backdrop-blur-xl shadow-md ${cpid ? "cursor-pointer" : "cursor-default"}`}
                                style={{
                                  borderColor: activeCompanyTheme?.containerBorderColor || "rgba(255,255,255,0.25)",
                                  borderRadius: containerRadius,
                                }}
                              >
                                <img
                                  src={logo}
                                  alt={label}
                                  className="w-full h-full object-contain"
                                  style={{
                                    borderRadius: activeCompanyTheme?.containerBorderRadius != null ? `${Math.max(4, activeCompanyTheme.containerBorderRadius - 4)}px` : "12px",
                                    filter: (activeCompanyTheme?.allMediaMonochrome === true || activeCompanyTheme?.logoMonochrome === true) ? "grayscale(100%)" : undefined,
                                  }}
                                  referrerPolicy="no-referrer"
                                />
                              </button>
                            )}
                            <span className="text-white">Информация о компании:</span>
                            {cpid ? (
                              <button
                                type="button"
                                onClick={go}
                                title="Открыть страницу компании"
                                className="hover:underline font-bold"
                                style={headingStyle}
                              >
                                {label}
                              </button>
                            ) : (
                              <span className="font-bold" style={headingStyle}>{label}</span>
                            )}
                          </>
                        );
                      })()}
                    </h2>
                    <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
                      {companyFull?.description_text || companyFull?.about_text || `Компания ${project?.companyName || ""}.`}
                    </p>
                    {companyFull?.mission_text && (
                      <div
                        className="section-card liquid-glass-card bg-transparent p-5 border text-sm backdrop-blur-xl"
                        style={containerCardStyle}
                      >
                        <h4 className="font-bold mb-1.5 text-sm" style={headingStyle}>Миссия</h4>
                        <p className="text-white/90 whitespace-pre-wrap text-sm leading-relaxed">{companyFull.mission_text}</p>
                      </div>
                    )}
                    {companyFull?.products_text && (
                      <div
                        className="section-card liquid-glass-card bg-transparent p-5 border text-sm backdrop-blur-xl"
                        style={containerCardStyle}
                      >
                        <h4 className="font-bold mb-1.5 text-sm" style={headingStyle}>Продукты и услуги</h4>
                        <p className="text-white/90 whitespace-pre-wrap text-sm leading-relaxed">{companyFull.products_text}</p>
                      </div>
                    )}
                  </div>
                )}

                {termsSubTab === "onboarding" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Правила адаптации</span>
                    <h2 className="text-xl font-bold text-white">Оформление и трудоустройство</h2>
                    <CandidateOnboardingBlock
                      onboardingText={projectFull?.onboarding_text}
                      activeTheme={activeCompanyTheme}
                    />
                  </div>
                )}

                {termsSubTab === "payouts" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Финансы</span>
                    <h2 className="text-xl font-bold text-white">Выплаты и бонусы</h2>
                    <CandidatePayoutsBlock
                      payoutsText={projectFull?.payouts_text}
                      salaryTerms={projectFull?.salary_terms || project?.salaryTerms}
                      activeTheme={activeCompanyTheme}
                    />
                  </div>
                )}

                {termsSubTab === "schedule" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Режим работы</span>
                    <h2 className="text-xl font-bold text-white">График и смены</h2>
                    <CandidateScheduleBlock
                      scheduleText={projectFull?.schedule_text}
                      scheduleTerms={projectFull?.schedule_terms || project?.scheduleTerms}
                      activeTheme={activeCompanyTheme}
                    />
                  </div>
                )}

                {termsSubTab === "team" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Коллеги</span>
                    <h2 className="text-xl font-bold text-white">Ваша рабочая группа</h2>
                    <CandidateTeamBlock
                      teamText={projectFull?.team_text || companyFull?.team_text}
                      activeTheme={activeCompanyTheme}
                    />
                  </div>
                )}

                {termsSubTab === "system" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Регламенты</span>
                    <h2 className="text-xl font-bold text-white">Базовая Wiki-система</h2>
                    <CandidateSystemBlock
                      systemText={projectFull?.system_text || companyFull?.system_text}
                      customWiki={project?.customWiki}
                      activeTheme={activeCompanyTheme}
                    />
                  </div>
                )}

                {termsSubTab === "contacts" && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-sm font-bold block" style={headingStyle}>Связь с работодателем</span>
                    <h2 className="text-xl font-bold text-white">Контакты</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      {employerContacts.name && (
                        <div
                          className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-xl flex flex-col justify-between"
                          style={containerCardStyle}
                        >
                          <div className="text-sm text-white/70 font-bold mb-1">Работодатель / Контактное лицо</div>
                          <div className="text-white font-bold text-sm leading-snug break-words">{employerContacts.name}</div>
                        </div>
                      )}
                      <div
                        className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-xl flex flex-col justify-between"
                        style={containerCardStyle}
                      >
                        <div className="text-sm text-white/70 font-bold mb-2">Email</div>
                        <div>
                          {employerContacts.email ? (
                            <a
                              href={`mailto:${employerContacts.email}`}
                              className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                              style={activeBtnStyle}
                            >
                              <Mail className="w-4 h-4 shrink-0" />
                              <span className="break-all">{employerContacts.email}</span>
                            </a>
                          ) : (
                            <span className="text-white/60 text-sm">—</span>
                          )}
                        </div>
                      </div>
                      <div
                        className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-xl flex flex-col justify-between"
                        style={containerCardStyle}
                      >
                        <div className="text-sm text-white/70 font-bold mb-2">Телефон</div>
                        <div>
                          {employerContacts.phone ? (
                            <a
                              href={`tel:${(employerContacts.phone || "").replace(/[^\d+]/g, "")}`}
                              className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                              style={activeBtnStyle}
                            >
                              <HelpCircle className="w-4 h-4 shrink-0" />
                              <span className="break-all">{employerContacts.phone}</span>
                            </a>
                          ) : (
                            <span className="text-white/60 text-sm">—</span>
                          )}
                        </div>
                      </div>
                      <div
                        className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-xl flex flex-col justify-between"
                        style={containerCardStyle}
                      >
                        <div className="text-sm text-white/70 font-bold mb-2">Telegram</div>
                        <div>
                          {employerContacts.telegram ? (
                            (() => {
                              const raw = (employerContacts.telegram || "").trim().replace(/^@/, "");
                              const href = raw.startsWith("http") ? raw : `https://t.me/${raw}`;
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                                  style={activeBtnStyle}
                                >
                                  <Send className="w-4 h-4 shrink-0" />
                                  <span className="break-all">@{raw}</span>
                                </a>
                              );
                            })()
                          ) : (
                            <span className="text-white/60 text-sm">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Direct path trigger button to transition candidate */}
              <div className="mt-8 pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                <span className="text-sm text-white/70 italic text-center sm:text-left">Все разделы изучены? Теперь смело переходите на собеседование!</span>
                <button
                  type="button"
                  id="btn_accept_terms"
                  onClick={() => {
                    setActiveTab("interview");
                    if (effectiveStage === "terms") {
                      handleStartInterview();
                    }
                  }}
                  className="cursor-pointer landing-btn-active font-bold py-3 px-6 text-sm flex items-center gap-2 transition shadow-lg border"
                  style={activeBtnStyle}
                >
                  Перейти на ИИ-Собеседование <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </Reveal>
        )}

        {/* Tab 3: Interview module */}
        {activeTab === "interview" && (
          <Reveal key="tab-interview" direction="up" className="space-y-6">
            {(() => {
              const projAny = project as any;
              const candAny = candidate as any;
              const interviewLimit = Math.round(Number(projAny?.interviewLimit ?? projAny?.interview_limit ?? projectFull?.interview_limit ?? projectFull?.max_interviews ?? 0));
              const interviewUsed = Math.round(Number(projAny?.interviewUsed ?? projAny?.interview_used ?? projectFull?.interview_used ?? 0));
              const isVacancyActive = (projAny?.status ?? projectFull?.status ?? "active") === "active";

              const hasInterviewBlocks = Boolean(
                projectFull?.has_interview_blocks ||
                projectFull?.hasInterviewBlocks ||
                projAny?.has_interview_blocks ||
                projAny?.hasInterviewBlocks ||
                (Array.isArray((projectFull as any)?.interview_blocks) && (projectFull as any).interview_blocks.length > 0)
              );

              const parsedChecklistQs = Array.isArray(projectFull?.checklist_questions)
                ? projectFull.checklist_questions
                : (Array.isArray((projectFull as any)?.checklistQuestions)
                    ? (projectFull as any).checklistQuestions
                    : (Array.isArray(projAny?.checklistQuestions)
                        ? projAny.checklistQuestions
                        : (typeof projectFull?.checklist_questions === "string" ? (() => { try { return JSON.parse(projectFull.checklist_questions); } catch { return []; } })() : [])));
              const parsedRoleplayQs = Array.isArray(projectFull?.roleplay_questions)
                ? projectFull.roleplay_questions
                : (Array.isArray((projectFull as any)?.roleplayQuestions)
                    ? (projectFull as any).roleplayQuestions
                    : (Array.isArray(projAny?.roleplayQuestions)
                        ? projAny.roleplayQuestions
                        : (typeof projectFull?.roleplay_questions === "string" ? (() => { try { return JSON.parse(projectFull.roleplay_questions); } catch { return []; } })() : [])));

              const hasInterviewConfigured = Boolean(
                hasInterviewBlocks ||
                (parsedChecklistQs && parsedChecklistQs.length > 0) ||
                (parsedRoleplayQs && parsedRoleplayQs.length > 0) ||
                (project?.checklist && project.checklist.length > 0) ||
                (projAny?.checklistQuestions && projAny.checklistQuestions.length > 0) ||
                (project?.roleplay && project.roleplay.length > 0) ||
                (projAny?.roleplayQuestions && projAny.roleplayQuestions.length > 0) ||
                (interviewLimit > 0)
              );

              const hasPassedScreening = Boolean(
                candAny?.interview_charged_at ||
                (candAny?.resume_score != null && Number(candAny?.resume_score) > 0) ||
                (candAny?.score != null && Number(candAny?.score) > 0) ||
                candAny?.resume_ai_feedback ||
                candAny?.checklist_score != null ||
                candAny?.situations_score != null ||
                ["screening", "checklist", "situations", "interview_success", "interview_reject", "professional", "product", "systems", "certified"].includes(candAny?.crm_stage || "") ||
                ["checklist", "situations", "interview_success", "interview_reject", "training", "certified"].includes(candAny?.stage || "") ||
                ["checklist", "situations", "interview_success", "interview_reject", "training", "certified"].includes(candAny?.current_stage || "")
              );

              const isInterviewAvailable = isVacancyActive && (
                hasPassedScreening
                  ? true
                  : (interviewLimit > 0 ? interviewUsed < interviewLimit : true)
              );

              if (!hasInterviewConfigured || !isInterviewAvailable) {
                const tg = (employerContacts.telegram || "").trim().replace(/^@/, "");
                const titleText = !isVacancyActive
                  ? "Вакансия временно приостановлена"
                  : (!hasPassedScreening && (interviewLimit > 0 && interviewUsed >= interviewLimit))
                    ? "Лимиты на проведение интервью исчерпаны"
                    : "Собеседование проводится напрямую";
                const descText = !isVacancyActive
                  ? "По данной вакансии онлайн-интервью временно приостановлено работодателем. Для связи используйте контакты ниже:"
                  : (!hasPassedScreening && (interviewLimit > 0 && interviewUsed >= interviewLimit))
                    ? "Лимит онлайн-собеседований по данной вакансии исчерпан. Для прохождения собеседования свяжитесь с работодателем:"
                    : "По данной вакансии онлайн-интервью через ИИ-робота не проводится. Для прохождения отбора и согласования встречи, пожалуйста, свяжитесь с работодателем по контактам ниже:";

                return (
                  <div className="section-card liquid-glass-card bg-transparent border border-white/15 shadow-2xl backdrop-blur-2xl p-6 md:p-8 space-y-6 text-center max-w-2xl mx-auto" style={containerCardStyle}>
                    {companyLogo ? (
                      <div
                        className="section-card liquid-glass-card bg-transparent p-2 border flex items-center justify-center mx-auto shadow-lg backdrop-blur-xl"
                        style={{
                          ...containerCardStyle,
                          width: "80px",
                          height: "80px",
                        }}
                      >
                        <img
                          src={companyLogo}
                          alt={companyFull?.name || "Company"}
                          className="company-logo-img max-h-16 max-w-[70px] object-contain"
                          style={{
                            filter: (activeCompanyTheme?.allMediaMonochrome === true || activeCompanyTheme?.logoMonochrome === true) ? "grayscale(100%)" : undefined,
                          }}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div
                        className="section-card liquid-glass-card bg-transparent p-2 border flex items-center justify-center mx-auto shadow-lg backdrop-blur-xl"
                        style={{
                          ...containerCardStyle,
                          width: "80px",
                          height: "80px",
                        }}
                      >
                        <RRImage src="/files/11/rr-logo.png" w={64} alt="RR" className="w-12 h-12 object-contain" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-2xl font-bold" style={headingStyle}>
                        {titleText}
                      </h2>
                      <p className="text-sm text-white/85 mt-2 leading-relaxed font-normal">
                        {descText}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left pt-2">
                      <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                        <div className="text-sm text-white/70 font-bold mb-2">Email</div>
                        <div>
                          {employerContacts.email ? (
                            <a
                              className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                              style={activeBtnStyle}
                              href={`mailto:${employerContacts.email}`}
                            >
                              <Mail className="w-4 h-4 shrink-0" />
                              <span className="break-all">{employerContacts.email}</span>
                            </a>
                          ) : (
                            <span className="text-white/60 text-sm">—</span>
                          )}
                        </div>
                      </div>
                      <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                        <div className="text-sm text-white/70 font-bold mb-2">Телефон</div>
                        <div>
                          {employerContacts.phone ? (
                            <a
                              className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                              style={activeBtnStyle}
                              href={`tel:${(employerContacts.phone || "").replace(/[^\d+]/g, "")}`}
                            >
                              <HelpCircle className="w-4 h-4 shrink-0" />
                              <span className="break-all">{employerContacts.phone}</span>
                            </a>
                          ) : (
                            <span className="text-white/60 text-sm">—</span>
                          )}
                        </div>
                      </div>
                      <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                        <div className="text-sm text-white/70 font-bold mb-2">Telegram</div>
                        <div>
                          {tg ? (
                            <a
                              className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                              style={activeBtnStyle}
                              href={tg.startsWith("http") ? tg : `https://t.me/${tg}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Send className="w-4 h-4 shrink-0" />
                              <span className="break-all">@{tg}</span>
                            </a>
                          ) : (
                            <span className="text-white/60 text-sm">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setTermsSubTab("contacts");
                          setActiveTab("terms");
                        }}
                        className="cursor-pointer border px-5 py-2.5 font-bold transition text-sm flex items-center justify-center gap-2"
                        style={inactiveBtnStyle}
                      >
                        Перейти в раздел «Контакты»
                      </button>
                    </div>
                  </div>
                );
              }

              const urlParts = path.split("/").filter(Boolean);
              const urlCandIdx = urlParts.findIndex(p => /^(candidate|cand)/i.test(p));
              const routeProjId = urlCandIdx >= 2 ? (urlParts[1] || "").replace(/^vac/i, "") : "";
              const routeCandId = urlCandIdx !== -1 ? (urlParts[urlCandIdx] || "").replace(/^(candidate|cand)/i, "") : "";
              const effProjId = candidate?.projectId || (candidate as any)?.project_id || project?.id || (projectFull as any)?.id || routeProjId;
              const effCandId = candidate?.id || (candidate as any)?.public_id || (candidate as any)?.publicId || routeCandId;

              return effProjId && effCandId ? (
                <CandidateInterview
                  projectId={effProjId}
                  candidateId={effCandId}
                  subTab={interviewSubTab}
                  onSubTabChange={(s) => setInterviewSubTab(s)}
                  activeTheme={activeCompanyTheme}
                  onRefresh={async () => {
                    await reloadScores();
                    await loadFlowState();
                  }}
                  onCompleted={(passed: boolean) => {
                    // Always pull the latest scores from the server before deciding
                    // what to show — passes the dashes-after-retake regression fix.
                    void reloadScores();
                    void loadFlowState();
                    if (passed) setActiveTab("training");
                  }}
                />
              ) : (
                <div
                  className="section-card liquid-glass-card bg-transparent border backdrop-blur-2xl p-8 text-center space-y-4 max-w-md mx-auto"
                  style={{
                    borderColor: activeCompanyTheme?.containerBorderColor
                      ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
                      : "rgba(255, 255, 255, 0.25)",
                    borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
                    borderRadius: activeCompanyTheme?.containerBorderRadius != null
                      ? `${activeCompanyTheme.containerBorderRadius}px`
                      : "16px",
                  }}
                >
                  <div className="flex items-center justify-center">
                    <Loader2
                      className="w-8 h-8 animate-spin"
                      style={{ color: activeCompanyTheme?.iconColor || activeCompanyTheme?.headingsSolidColor || "#E7C768" }}
                    />
                  </div>
                  <div className="text-white text-sm font-medium">Загрузка данных интервью...</div>
                </div>
              );
            })()}
          </Reveal>
        )}



        {/* Tab 4: Evaluation scoring tab */}
        {activeTab === "scoring" && (
          <Reveal key="tab-scoring" direction="up" className="section-card liquid-glass-card bg-transparent border border-white/15 shadow-2xl backdrop-blur-2xl p-6 md:p-8 space-y-6 text-center max-w-2xl mx-auto" style={containerCardStyle}>
            <Mascot state="serious" size="lg" />
            
            <div>
              <span className="bg-transparent font-bold text-sm px-4 py-1.5 rounded-full inline-block border border-white/20 backdrop-blur-md" style={headingStyle}>ИИ оценка завершена</span>
              <h2 className="text-2xl font-bold mt-2" style={headingStyle}>Результаты вашего тестирования</h2>
              <p className="text-sm text-white/80 mt-1 font-normal">Оценка сведена в баллах на основе ответов на опрос и разбора вашего резюме.</p>
            </div>

            {/* Score Ring indicator */}
            <div className="flex items-center justify-center py-4">
              <div
                className="w-36 h-36 rounded-full border-4 bg-transparent backdrop-blur-xl flex flex-col items-center justify-center shadow-lg"
                style={{ borderColor: activeCompanyTheme?.headingsSolidColor || "#D4AF37" }}
              >
                <span className="text-4xl font-black" style={headingStyle}>
                  {(() => {
                    const s = candidate?.scores || ({} as any);
                    const vals = [s.resumeScore, s.checklistScore, s.situationsScore]
                      .filter((x: any) => typeof x === "number" && !isNaN(x) && x > 0);
                    if (!vals.length) return "—";
                    const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
                    return (Math.round(avg * 100) / 100).toFixed(2);
                  })()}
                </span>
                <span className="text-sm font-bold text-white/80 font-mono mt-0.5">Общий балл</span>
              </div>
            </div>

            {/* Grid details checklist score elements */}
            <div className="grid grid-cols-3 gap-3.5 max-w-lg mx-auto">
              <div className="section-card liquid-glass-card bg-transparent p-3.5 border border-white/10 backdrop-blur-md text-center flex flex-col justify-between" style={containerCardStyle}>
                <span className="text-sm text-white/70 font-semibold font-mono block">1. Резюме</span>
                <strong className="font-extrabold text-xl block mt-1" style={headingStyle}>
                  {candidate?.scores?.resumeScore !== undefined ? `${candidate.scores.resumeScore}/100` : "—"}
                </strong>
              </div>
              <div className="section-card liquid-glass-card bg-transparent p-3.5 border border-white/10 backdrop-blur-md text-center flex flex-col justify-between" style={containerCardStyle}>
                <span className="text-sm text-white/70 font-semibold font-mono block">2. Чек-лист</span>
                <strong className="font-extrabold text-xl block mt-1" style={headingStyle}>
                  {candidate?.scores?.checklistScore !== undefined ? `${candidate.scores.checklistScore}/100` : "—"}
                </strong>
              </div>
              <div className="section-card liquid-glass-card bg-transparent p-3.5 border border-white/10 backdrop-blur-md text-center flex flex-col justify-between" style={containerCardStyle}>
                <span className="text-sm text-white/70 font-semibold font-mono block">3. Ситуации</span>
                <strong className="font-extrabold text-xl block mt-1" style={headingStyle}>
                  {candidate?.scores?.situationsScore !== undefined ? `${candidate.scores.situationsScore}/100` : "—"}
                </strong>
              </div>
            </div>

            {/* Assessment critique */}
            <div className="section-card liquid-glass-card bg-transparent p-5 text-left border border-white/10 backdrop-blur-xl space-y-2" style={containerCardStyle}>
              <span className="text-sm font-bold flex items-center gap-1.5" style={headingStyle}>
                <Cpu className="w-4 h-4 text-[#D4AF37]" /> Разбор ваших навыков ИИ-роботом:
              </span>
              <p className="text-sm text-white/85 leading-relaxed italic font-normal whitespace-pre-wrap">
                {candidate?.scores?.assessmentSummary
                  ? `"${candidate.scores.assessmentSummary}"`
                  : "Пройдите ИИ-собеседование, чтобы получить персональный разбор результатов."}
              </p>
              {candidate?.scores?.checklistFeedback ? (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                  <div className="text-sm font-bold text-[#D4AF37]">Чек-лист — итог ИИ</div>
                  {candidate.scores.checklistFeedback.summary && (
                    <p className="text-sm text-white/90 leading-relaxed">{candidate.scores.checklistFeedback.summary}</p>
                  )}
                  {Array.isArray(candidate.scores.checklistFeedback.strengths) && candidate.scores.checklistFeedback.strengths.length > 0 && (
                    <div className="text-sm text-white/90">
                      <b className="text-white">Сильные стороны:</b>
                      <ul className="list-disc list-inside opacity-90 mt-1">
                        {candidate.scores.checklistFeedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(candidate.scores.checklistFeedback.gaps) && candidate.scores.checklistFeedback.gaps.length > 0 && (
                    <div className="text-sm text-white/90">
                      <b className="text-white">Зоны роста:</b>
                      <ul className="list-disc list-inside opacity-90 mt-1">
                        {candidate.scores.checklistFeedback.gaps.map((g: string, i: number) => <li key={i}>{g}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
              {candidate?.scores?.situationsFeedback?.advice ? (
                <p className="text-sm text-white/90 mt-2 pt-2 border-t border-white/10"><b className="text-white">Ситуации:</b> {candidate.scores.situationsFeedback.advice}</p>
              ) : null}
            </div>

            {candidate?.id && (
              <div className="text-left">
                <CandidateFieldsEditorBlock
                  candidateId={candidate.id}
                  candidate={candidate}
                  customFieldsConfig={(projectFull as any)?.candidate_fields_config || (projectFull as any)?.candidateFieldsConfig || (project as any)?.candidate_fields_config}
                  persistToDb={true}
                  editable={true}
                  compact={true}
                  activeTheme={activeCompanyTheme}
                  title="Анкета кандидата (26 стандартных и дополнительные поля)"
                  subtitle="Распознанные данные из вашего резюме и анкеты по вакансии."
                  onSaved={() => { void loadFlowState(); }}
                />
              </div>
            )}

            {/* Training action CTA */}
            <button
              onClick={() => {
                updateStageOnBackend("training");
                setActiveTab("training");
              }}
              className="cursor-pointer w-full font-bold py-3.5 text-center shadow-lg transition flex items-center justify-center gap-2 border text-sm"
              style={activeBtnStyle}
            >
              Открыть персональный курс ИИ-обучения <ArrowRight className="w-5 h-5" />
            </button>
          </Reveal>
        )}

        {/* Tab 5: Training interactive program */}
        {activeTab === "training" && (
          (() => {
            const projAny = project as any;
            const candAny = candidate as any;
            const trainingLimit = Math.round(Number(projAny?.trainingLimit ?? projAny?.training_limit ?? projectFull?.training_limit ?? projectFull?.max_trainings ?? 0));
            const trainingUsed = Math.round(Number(projAny?.trainingUsed ?? projAny?.training_used ?? projectFull?.training_used ?? 0));
            const isVacancyActive = (projAny?.status ?? projectFull?.status ?? "active") === "active";

            const hasTrainingBlocks = Boolean(
              projectFull?.has_training_blocks ||
              projectFull?.hasTrainingBlocks ||
              projAny?.has_training_blocks ||
              projAny?.hasTrainingBlocks ||
              (Array.isArray((projectFull as any)?.training_blocks) && (projectFull as any).training_blocks.length > 0)
            );

            const hasTrainingConfigured = Boolean(
              hasTrainingBlocks ||
              projectFull?.training_prof_text ||
              projectFull?.training_product_text ||
              projectFull?.training_system_text ||
              projectFull?.training_professional_text ||
              projAny?.training_professional_text ||
              projectFull?.trainingProfessionalText ||
              projAny?.trainingProfessionalText ||
              (trainingLimit > 0)
            );

            const isTrainingAvailable = isVacancyActive && (
              trainingLimit > 0 ? (trainingUsed < trainingLimit || Boolean(candAny?.training_charged_at)) : true
            );

            if (!hasTrainingConfigured || !isTrainingAvailable) {
              const tg = (employerContacts.telegram || "").trim().replace(/^@/, "");
              const titleText = !isVacancyActive
                ? "Вакансия временно приостановлена"
                : (trainingLimit > 0 && trainingUsed >= trainingLimit && !candAny?.training_charged_at)
                  ? "Лимиты на обучение исчерпаны"
                  : "Обучение проводится напрямую";
              const descText = !isVacancyActive
                ? "По данной вакансии онлайн-обучение временно приостановлено работодателем. Для связи используйте контакты ниже:"
                : (trainingLimit > 0 && trainingUsed >= trainingLimit && !candAny?.training_charged_at)
                  ? "Лимит онлайн-обучений по данной вакансии исчерпан. Для прохождения обучения свяжитесь с работодателем:"
                  : "По данной вакансии онлайн-обучение через платформу не проводится. Для прохождения обучения свяжитесь с работодателем по контактам ниже:";

              return (
                <div className="section-card liquid-glass-card bg-transparent border border-white/15 shadow-2xl backdrop-blur-2xl p-6 md:p-8 space-y-6 text-center max-w-2xl mx-auto" style={containerCardStyle}>
                  {companyLogo ? (
                    <div
                      className="section-card liquid-glass-card bg-transparent p-2 border flex items-center justify-center mx-auto shadow-lg backdrop-blur-xl"
                      style={{
                        ...containerCardStyle,
                        width: "80px",
                        height: "80px",
                      }}
                    >
                      <img
                        src={companyLogo}
                        alt={companyFull?.name || "Company"}
                        className="company-logo-img max-h-16 max-w-[70px] object-contain"
                        style={{
                          filter: (activeCompanyTheme?.allMediaMonochrome === true || activeCompanyTheme?.logoMonochrome === true) ? "grayscale(100%)" : undefined,
                        }}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div
                      className="section-card liquid-glass-card bg-transparent p-2 border flex items-center justify-center mx-auto shadow-lg backdrop-blur-xl"
                      style={{
                        ...containerCardStyle,
                        width: "80px",
                        height: "80px",
                      }}
                    >
                      <RRImage src="/files/11/rr-logo.png" w={64} alt="RR" className="w-12 h-12 object-contain" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-2xl font-bold" style={headingStyle}>
                      {titleText}
                    </h2>
                    <p className="text-sm text-white/85 mt-2 leading-relaxed font-normal">
                      {descText}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left pt-2">
                    <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                      <div className="text-sm text-white/70 font-bold mb-2">Email</div>
                      <div>
                        {employerContacts.email ? (
                          <a
                            className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                            style={activeBtnStyle}
                            href={`mailto:${employerContacts.email}`}
                          >
                            <Mail className="w-4 h-4 shrink-0" />
                            <span className="break-all">{employerContacts.email}</span>
                          </a>
                        ) : (
                          <span className="text-white/60 text-sm">—</span>
                        )}
                      </div>
                    </div>
                    <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                      <div className="text-sm text-white/70 font-bold mb-2">Телефон</div>
                      <div>
                        {employerContacts.phone ? (
                          <a
                            className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                            style={activeBtnStyle}
                            href={`tel:${(employerContacts.phone || "").replace(/[^\d+]/g, "")}`}
                          >
                            <HelpCircle className="w-4 h-4 shrink-0" />
                            <span className="break-all">{employerContacts.phone}</span>
                          </a>
                        ) : (
                          <span className="text-white/60 text-sm">—</span>
                        )}
                      </div>
                    </div>
                    <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                      <div className="text-sm text-white/70 font-bold mb-2">Telegram</div>
                      <div>
                        {tg ? (
                          <a
                            className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center"
                            style={activeBtnStyle}
                            href={tg.startsWith("http") ? tg : `https://t.me/${tg}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Send className="w-4 h-4 shrink-0" />
                            <span className="break-all">@{tg}</span>
                          </a>
                        ) : (
                          <span className="text-white/60 text-sm">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const cStage = candAny?.crmStage || candAny?.crm_stage || candAny?.currentStage || candAny?.stage || effectiveStage || "";
            const isCert = cStage === "certified" || candAny?.certified;
            const isAlreadyTraining = ["professional", "product", "systems", "certified"].includes(cStage);

            const hasResume = candidate?.scores?.resumeScore != null && Number(candidate.scores.resumeScore) > 0;
            const hasChecklist = candidate?.scores?.checklistScore != null && Number(candidate.scores.checklistScore) > 0;
            const hasSituations = candidate?.scores?.situationsScore != null && Number(candidate.scores.situationsScore) > 0;
            const completedInterviewStages = (hasResume ? 1 : 0) + (hasChecklist ? 1 : 0) + (hasSituations ? 1 : 0);
            const allInterviewDone = completedInterviewStages === 3;

            const passScore = Number(projectFull?.interview_pass_score) > 0 ? Number(projectFull.interview_pass_score) : 70;
            const avgScore = candidate?.scores?.overallScore != null
              ? Number(candidate.scores.overallScore)
              : (completedInterviewStages === 3 && interviewAverageScore !== null ? interviewAverageScore : null);

            const isInterviewRejected = cStage === "interview_reject" || (allInterviewDone && avgScore !== null && avgScore < passScore);

            if (!allInterviewDone && !isAlreadyTraining) {
              return (
                <div className="section-card liquid-glass-card bg-transparent border border-white/15 shadow-2xl backdrop-blur-2xl p-6 md:p-8 space-y-6 text-center max-w-2xl mx-auto" style={containerCardStyle}>
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-transparent border border-white/20 flex items-center justify-center text-3xl shadow-lg">
                    🔒
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold" style={headingStyle}>
                      Обучение пока недоступно
                    </h2>
                    <p className="text-sm text-white/85 mt-2 leading-relaxed font-normal">
                      Для доступа к корпоративному обучению необходимо завершить все 3 этапа собеседования: резюме, чек-лист квалификации и ролевые ситуации.
                    </p>
                    <p className="text-xs text-white/60 mt-1">
                      Пройдено этапов: {completedInterviewStages} из 3
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => setActiveTab("interview")}
                      className="landing-btn-active inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold border transition shadow-lg rounded-xl"
                      style={activeBtnStyle}
                    >
                      Перейти к собеседованию
                    </button>
                  </div>
                </div>
              );
            }

            if (isInterviewRejected) {
              const tg = (employerContacts.telegram || "").trim().replace(/^@/, "");
              return (
                <div className="section-card liquid-glass-card bg-transparent border border-white/15 shadow-2xl backdrop-blur-2xl p-6 md:p-8 space-y-6 text-center max-w-2xl mx-auto" style={containerCardStyle}>
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-transparent border border-white/20 flex items-center justify-center text-3xl shadow-lg">
                    ⏸
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold" style={headingStyle}>
                      Собеседование не пройдено
                    </h2>
                    <p className="text-sm text-white/85 mt-2 leading-relaxed font-normal">
                      К сожалению, ваш результат собеседования {avgScore !== null ? `(${avgScore}/100 баллов)` : ""} ниже проходного балла вакансии ({passScore}/100). Доступ к корпоративному обучению закрыт.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left pt-2">
                    {employerContacts.email && (
                      <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                        <div className="text-sm text-white/70 font-bold mb-2">Email</div>
                        <a className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center" style={activeBtnStyle} href={`mailto:${employerContacts.email}`}>
                          <Mail className="w-4 h-4 shrink-0" />
                          <span className="break-all">{employerContacts.email}</span>
                        </a>
                      </div>
                    )}
                    {employerContacts.phone && (
                      <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                        <div className="text-sm text-white/70 font-bold mb-2">Телефон</div>
                        <a className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center" style={activeBtnStyle} href={`tel:${(employerContacts.phone || "").replace(/[^\d+]/g, "")}`}>
                          <HelpCircle className="w-4 h-4 shrink-0" />
                          <span className="break-all">{employerContacts.phone}</span>
                        </a>
                      </div>
                    )}
                    {tg && (
                      <div className="section-card liquid-glass-card bg-transparent p-4 border backdrop-blur-md flex flex-col justify-between" style={containerCardStyle}>
                        <div className="text-sm text-white/70 font-bold mb-2">Telegram</div>
                        <a className="landing-btn-active inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border transition shadow-md w-full text-center" style={activeBtnStyle} href={tg.startsWith("http") ? tg : `https://t.me/${tg}`} target="_blank" rel="noopener noreferrer">
                          <Send className="w-4 h-4 shrink-0" />
                          <span className="break-all">@{tg}</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            const urlParts = typeof window !== "undefined" ? window.location.pathname.split("/").filter(Boolean) : [];
            const urlCandIdx = urlParts.findIndex((p: string) => /^(candidate|cand)/i.test(p));
            const routeProjId = urlCandIdx >= 2 ? (urlParts[1] || "").replace(/^vac/i, "") : "";
            const routeCandId = urlCandIdx !== -1 ? (urlParts[urlCandIdx] || "").replace(/^(candidate|cand)/i, "") : "";
            const effTrainCandId = candidate?.id || (candidate as any)?.public_id || (candidate as any)?.publicId || routeCandId;
            const effTrainProjId = candidate?.projectId || (candidate as any)?.project_id || project?.id || routeProjId;

            return effTrainCandId && effTrainProjId ? (
              <Reveal key="tab-training" direction="up">
                <CandidateStageTraining
                  candidateId={effTrainCandId}
                  projectId={effTrainProjId}
                  activeTheme={activeCompanyTheme}
                  companyLogo={companyLogo}
                  companyName={companyFull?.name || project?.companyName}
                  vacancyTitle={project?.roleName || candidate?.roleName}
                  initialStage={trainingSubTab as any}
                />
              </Reveal>
            ) : (
              <div
                className="section-card liquid-glass-card bg-transparent border backdrop-blur-2xl p-8 text-center space-y-4 max-w-md mx-auto"
                style={{
                  borderColor: activeCompanyTheme?.containerBorderColor
                    ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
                    : "rgba(255, 255, 255, 0.25)",
                  borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
                  borderRadius: activeCompanyTheme?.containerBorderRadius != null
                    ? `${activeCompanyTheme.containerBorderRadius}px`
                    : "16px",
                }}
              >
                <div className="flex items-center justify-center">
                  <Loader2
                    className="w-8 h-8 animate-spin"
                    style={{ color: activeCompanyTheme?.iconColor || activeCompanyTheme?.headingsSolidColor || "#E7C768" }}
                  />
                </div>
                <div className="text-white text-sm font-medium">Загрузка данных обучения...</div>
              </div>
            );
          })()
        )}

        {/* Tab 6: Certified diploma success tab */}
        {activeTab === "certified" && (
          <Reveal key="tab-certified" direction="scale" className="space-y-8 max-w-2xl mx-auto">
            {(() => {
              const certUnlocked = effectiveStage === "certified";
              return <>
            {!certUnlocked && (
              <div className="section-card liquid-glass-card bg-transparent border border-white/20 backdrop-blur-xl p-4 text-center space-y-1" style={containerCardStyle}>
                <div className="text-white font-bold text-sm">Сертификат пока недоступен</div>
                <div className="text-sm text-white/80">
                  Завершите ИИ-собеседование и сдайте все 3 этапа обучения — после этого сертификат разблокируется и его можно будет скачать.
                </div>
              </div>
            )}
            <div className={`relative ${certUnlocked ? "" : "pointer-events-none select-none"}`}>
              <div className={certUnlocked ? "" : "filter blur-sm opacity-60"}>
            {/* Visual Issued Certificate styled like a physical luxury diploma */}
            <div
              className="bg-transparent border-8 border-double shadow-2xl p-8 relative overflow-hidden text-center select-none backdrop-blur-2xl"
              style={{
                borderColor: activeCompanyTheme?.iconColor || "#E7C768",
                borderRadius: activeCompanyTheme?.containerBorderRadius != null ? `${activeCompanyTheme.containerBorderRadius}px` : "24px",
              }}
            >
              
              {/* Corner Ornaments */}
              <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2" style={{ borderColor: activeCompanyTheme?.iconColor || "#E7C768" }}></div>
              <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2" style={{ borderColor: activeCompanyTheme?.iconColor || "#E7C768" }}></div>
              <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2" style={{ borderColor: activeCompanyTheme?.iconColor || "#E7C768" }}></div>
              <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2" style={{ borderColor: activeCompanyTheme?.iconColor || "#E7C768" }}></div>

              {/* Watermark Logo */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
                <CompanyThemedLogo
                  logoUrl={companyLogo}
                  companyName={companyFull?.name || project?.companyName}
                  theme={activeCompanyTheme}
                  size="xl"
                  className="w-72 h-72 max-w-[288px] max-h-[288px]"
                />
              </div>

              {/* Certificate Head */}
              <div className="space-y-2 relative z-10">
                <div className="flex justify-center items-center">
                  <CompanyThemedLogo
                    logoUrl={companyLogo}
                    companyName={companyFull?.name || project?.companyName}
                    theme={activeCompanyTheme}
                    size="lg"
                    className="mx-auto drop-shadow"
                  />
                </div>
                <h1 className="text-sm font-bold" style={headingStyle}>
                  Подтверждение прохождения программы компании {companyFull?.name || project?.companyName || ""}
                </h1>
                <div className="text-sm text-white/70 italic">Выдан платформой автоматического онбординга Робот Рекрутер (RR)</div>
              </div>

              {/* Line ornament */}
              <div
                className="w-32 h-0.5 mx-auto my-6"
                style={{
                  background: `linear-gradient(to right, transparent, ${activeCompanyTheme?.iconColor || "#E7C768"}, transparent)`,
                }}
              ></div>

              {/* Certification Statement */}
              <div className="space-y-6 relative z-10 text-center">
                <p className="text-sm text-white/80 italic">Настоящим подтверждается, что соискатель</p>
                <div className="text-2xl md:text-3xl font-black tracking-tight" style={headingStyle}>
                  {candidate?.name || "Иван Иванов"}
                </div>
                
                <p className="text-sm text-white/80 leading-relaxed max-w-md mx-auto font-normal">
                  Успешно завершил индивидуальную программу скрининга, кейс-собеседование ИИ и обучающий экспресс-курс подготовки по должности
                </p>

                <div
                  className="bg-transparent font-bold text-sm md:text-base py-2.5 px-6 rounded-xl inline-block border-2 shadow-md backdrop-blur-md"
                  style={{ ...headingStyle, borderColor: activeCompanyTheme?.iconColor || "#E7C768" }}
                >
                  {candidate?.roleName || "Менеджер"}
                </div>

                <p className="text-sm text-white/80">
                  на проект компании: <strong className="text-white font-bold">{project?.companyName || "ООО Работодатель"}</strong>
                </p>
              </div>

              {/* Stamps and Signatures */}
              <div className="mt-10 grid grid-cols-2 gap-8 items-end relative z-10 text-left px-4">
                <div className="space-y-1">
                  <div className="text-sm text-white/70">Выдан Системой:</div>
                  <div className="text-sm font-bold" style={{ color: activeCompanyTheme?.iconColor || "#E7C768" }}>Робот Рекрутер (ИИ Аудит)</div>
                  <div className="w-24 h-px bg-white/20"></div>
                  <div className="text-sm text-white/70 font-normal">Уполномоченная подпись системного робота</div>
                </div>

                <div className="text-right flex flex-col items-end">
                  {/* Luxury Stamp icon */}
                  <div
                    className="w-16 h-16 rounded-full border-4 border-double flex flex-col items-center justify-center bg-transparent backdrop-blur-md transform rotate-12 scale-90 shadow-sm leading-none font-black text-xs select-none"
                    style={{
                      borderColor: activeCompanyTheme?.iconColor || "#E7C768",
                      color: activeCompanyTheme?.iconColor || "#E7C768",
                    }}
                  >
                    <span>RR</span>
                    <span>CERTIFIED</span>
                    <span>2026</span>
                  </div>
                </div>
              </div>

            </div>
              </div>
              {!certUnlocked && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <button
                    type="button"
                    onClick={() => {
                      const targetTab = !interviewPassedStrict ? "interview" : "training";
                      setActiveTab(targetTab);
                    }}
                    className="landing-btn-active cursor-pointer shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95 px-8 py-5 text-center flex flex-col items-center justify-center gap-1.5 border"
                    style={activeBtnStyle}
                  >
                    <div className="font-bold text-base">Сертификат заблокирован 🔒</div>
                    <div className="text-sm opacity-90 font-medium">
                      {!interviewPassedStrict
                        ? "Пройдите ИИ-интервью для разблокировки →"
                        : "Пройдите обучение до конца для разблокировки →"}
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* State message banner */}
            {certSavedMsg && (
              <div
                className="p-3.5 bg-transparent text-white border text-sm font-bold rounded-xl text-center backdrop-blur-xl"
                style={{
                  borderColor: activeCompanyTheme?.iconColor || "#E7C768",
                }}
              >
                {certSavedMsg}
              </div>
            )}

            {/* Actions list */}
            <div className="space-y-3">
              <button
                disabled={!certUnlocked}
                onClick={() => {
                  if (!certUnlocked) return;
                  setCertSavedMsg("Сертификат соответствия сохранен в ваше ИИ-портфолио и продублирован нанимателям в CRM!");
                  setTimeout(() => setCertSavedMsg(""), 5000);
                }}
                className={`w-full font-bold py-3.5 text-center shadow-lg transition flex items-center justify-center gap-2 border text-sm ${certUnlocked ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                style={certUnlocked ? activeBtnStyle : inactiveBtnStyle}
              >
                {certUnlocked ? "Сохранить сертификат в PDF" : "Сертификат недоступен"}
              </button>

              {certUnlocked && (
                <button
                  onClick={() => {
                    clearCandidateSession();
                    window.location.href = getVacancyLandingUrl();
                  }}
                  className="cursor-pointer w-full font-bold py-3 text-center text-sm transition border"
                  style={inactiveBtnStyle}
                >
                  Войти под другим профилем
                </button>
              )}
            </div>
              </>;
            })()}
          </Reveal>
        )}

      </main>

      <AcademyModal
        isOpen={isAcademyModalOpen}
        onClose={() => setIsAcademyModalOpen(false)}
        initialSlug={academyModalSlug}
      />

    </div>
  );
}
