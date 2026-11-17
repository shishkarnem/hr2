/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import UnifiedAIAssistant from "./UnifiedAIAssistant";

interface EmployerAIAssistantProps {
  employerId?: string | number;
  onNavigateTab?: (tab: string) => void;
  onOpenModal?: (modal: string) => void;
  onFillField?: (field: string, value: any) => void;
  currentTab?: string;
  className?: string;
}

export default function EmployerAIAssistant({
  employerId,
  onNavigateTab,
  onOpenModal,
  onFillField,
  currentTab,
  className = "",
}: EmployerAIAssistantProps = {}) {
  // Determine if this is running in Employer Panel (ProMax) or on public landing/wiki (RR)
  const isEmployerRoute =
    Boolean(employerId) ||
    (typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/emp") ||
        window.location.pathname.startsWith("/employer")));

  return (
    <UnifiedAIAssistant
      assistantType={isEmployerRoute ? "employer_promax" : "landing"}
      employerId={employerId}
      onNavigateTab={onNavigateTab}
      onOpenModal={onOpenModal}
      onFillField={onFillField}
      currentTab={currentTab}
      className={className}
    />
  );
}
