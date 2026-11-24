export type NotificationChannelKey = "bell" | "telegram" | "push";
export type NotificationOwnerRole = "employer" | "candidate";

export interface EventChannelMatrix {
  bell: boolean;
  telegram: boolean;
  push: boolean;
}

export interface NotificationThresholds {
  low_balance_rr: number;
  low_general_limits: number;
  low_vacancy_limits: number;
}

export const DEFAULT_NOTIFICATION_THRESHOLDS: NotificationThresholds = {
  low_balance_rr: 100,
  low_general_limits: 10,
  low_vacancy_limits: 10,
};

export interface NotificationsConfigPayload {
  telegram_user_ids: string;
  telegram_group_ids: string;
  telegram_channel_ids: string;
  channels: {
    bell: boolean;
    telegram: boolean;
    push: boolean;
  };
  events: Record<string, boolean>;
  event_channels: Record<string, EventChannelMatrix>;
  thresholds?: NotificationThresholds;
}

export interface NotificationEventDescriptor {
  key: string;
  title: string;
  description: string;
  thresholdKey?: keyof NotificationThresholds;
  thresholdLabel?: string;
  thresholdUnit?: string;
  defaultThreshold?: number;
}

export const EMPLOYER_EVENT_DESCRIPTORS: NotificationEventDescriptor[] = [
  {
    key: "new_candidate",
    title: "Новые отклики соискателей",
    description: "Регистрация нового кандидата на любую вашу вакансию",
  },
  {
    key: "interview_stages",
    title: "Этапы Интервью",
    description: "Прохождение этапов: Скрининг резюме, Чек-лист, Ситуации и баллы",
  },
  {
    key: "interview_reject",
    title: "Интервью Отказ",
    description: "Отказ по итогу трёх этапов ИИ-интервью (ниже проходного балла)",
  },
  {
    key: "interview_success",
    title: "Интервью Успех",
    description: "Успешный итог трёх этапов ИИ-интервью и допуск к обучению",
  },
  {
    key: "training_progress",
    title: "Прохождение этапов обучения",
    description: "Попытки и баллы стажёров по модулям (Профессия, Продукт, Системы)",
  },
  {
    key: "certificate_ready",
    title: "Сертификат Готов",
    description: "Успешное прохождение интервью и всех этапов обучения",
  },
  {
    key: "balance_change",
    title: "Изменения баланса и лимитов",
    description: "Пополнения, списания RR и корректировки лимитов",
  },
  {
    key: "low_balance_rr",
    title: "Мало баланса RR",
    description: "Предупреждение, когда баланс RR опускается ниже указанного порога",
    thresholdKey: "low_balance_rr",
    thresholdLabel: "Порог RR:",
    thresholdUnit: "RR",
    defaultThreshold: 100,
  },
  {
    key: "low_general_limits",
    title: "Мало общих лимитов",
    description: "Предупреждение, когда общий пул лимитов (интервью + обучение) ниже порога",
    thresholdKey: "low_general_limits",
    thresholdLabel: "Порог:",
    thresholdUnit: "шт.",
    defaultThreshold: 10,
  },
  {
    key: "low_vacancy_limits",
    title: "Мало лимитов в вакансиях",
    description: "Предупреждение, когда оставшиеся лимиты на вакансии ниже порога",
    thresholdKey: "low_vacancy_limits",
    thresholdLabel: "Порог:",
    thresholdUnit: "шт.",
    defaultThreshold: 10,
  },
];

export const CANDIDATE_EVENT_DESCRIPTORS: NotificationEventDescriptor[] = [
  {
    key: "interview_result",
    title: "Результаты ИИ-собеседования",
    description: "Итоговый балл, разбор и допуск к обучению",
  },
  {
    key: "training_progress",
    title: "Этапы обучения и тесты",
    description: "Результаты проверки тестов по модулям адаптации",
  },
  {
    key: "certificate_issued",
    title: "Выдача электронного сертификата",
    description: "Готовность персонального сертификата об обучении",
  },
  {
    key: "hire_decision",
    title: "Решения работодателя",
    description: "Приглашение на работу, статус рассмотрения и ответ HR",
  },
];

export function buildClientDefaultConfig(role: NotificationOwnerRole): NotificationsConfigPayload {
  if (role === "candidate") {
    return {
      telegram_user_ids: "",
      telegram_group_ids: "",
      telegram_channel_ids: "",
      channels: { bell: true, telegram: true, push: true },
      events: {
        interview_result: true,
        training_progress: true,
        certificate_issued: true,
        hire_decision: true,
      },
      event_channels: {
        interview_result: { bell: true, telegram: true, push: true },
        training_progress: { bell: true, telegram: true, push: true },
        certificate_issued: { bell: true, telegram: true, push: true },
        hire_decision: { bell: true, telegram: true, push: true },
      },
      thresholds: { ...DEFAULT_NOTIFICATION_THRESHOLDS },
    };
  }

  const events: Record<string, boolean> = {};
  const event_channels: Record<string, EventChannelMatrix> = {};
  for (const d of EMPLOYER_EVENT_DESCRIPTORS) {
    events[d.key] = true;
    event_channels[d.key] = { bell: true, telegram: true, push: true };
  }

  return {
    telegram_user_ids: "",
    telegram_group_ids: "",
    telegram_channel_ids: "",
    channels: { bell: true, telegram: true, push: true },
    events,
    event_channels,
    thresholds: { ...DEFAULT_NOTIFICATION_THRESHOLDS },
  };
}
