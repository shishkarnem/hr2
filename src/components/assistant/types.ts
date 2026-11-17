export type AssistantType = "landing" | "vacancy_company" | "employer_promax";
export type AssistantMode = "inactive" | "collapsed" | "expanded";

export interface UnifiedAIAssistantProps {
  assistantType?: AssistantType;
  // ProMax / Employer Panel
  employerId?: string | number;
  onNavigateTab?: (tab: string) => void;
  onOpenModal?: (modal: string) => void;
  onFillField?: (field: string, value: any) => void;
  currentTab?: string;
  // Vacancy / Company landing
  companyId?: string | number;
  companySlug?: string;
  companyName?: string;
  logoUrl?: string | null;
  projectId?: string;
  roleName?: string;
  vacancySlug?: string;
  contextText?: string;
  themeConfig?: any;
  themeColors?: any;
  className?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  screenshotUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}
