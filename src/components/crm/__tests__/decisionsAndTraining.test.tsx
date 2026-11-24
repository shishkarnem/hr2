import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  applyDecisionMacros,
  buildDecisionMacroContext,
  type DecisionTemplate,
} from "@/lib/decisionTemplateMacros";
import { CandidateTrainingTab } from "@/components/crm/CandidateTrainingTab";
import { DecisionSection } from "@/components/crm/decisions/DecisionSection";

const mockRunAiWait = vi.fn(async ({ task }: any) => task(1, () => {}));
const mockInvoke = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/components/AIWaitProvider", () => ({
  useAIWait: () => ({ run: mockRunAiWait }),
}));

vi.mock("@/lib/dbClient", () => ({
  getAuthHeaders: () => ({ Authorization: "Bearer test-token", "Content-Type": "application/json" }),
  dbClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock("@/lib/actorSession", () => ({
  resolveActiveEmployerId: () => "100007",
}));

describe("CRM Decisions & Training Summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats macros and responsible employer contacts accurately", () => {
    const ctx = buildDecisionMacroContext({
      candidate: { full_name: "Александр Сурков", email: "surkov@test.ru", phone: "+79990001122" },
      scores: { overall_score: 84, resume_score: 78, checklist_score: 97, situations_score: 78 },
      project: { role_name: "Руководитель отдела продаж", contact_name: "Денис", contact_phone: "+79112223344" },
      company: { name: "РентРОП" },
      responsibleContacts: [
        { name: "Денис", role: "HRD", phone: "+79112223344", telegram: "@denis" },
        { name: "Анна", phone: "+79223334455", email: "anna@rentrop.ru" },
      ],
    });

    const rendered = applyDecisionMacros(
      "Здравствуйте, {{candidate_name}}! Вакансия: {{vacancy_title}} в {{company_name}}. Балл: {{candidate_score}}. Контакты: {{employer_contacts}}",
      ctx
    );

    expect(rendered).toContain("Александр Сурков");
    expect(rendered).toContain("Руководитель отдела продаж");
    expect(rendered).toContain("РентРОП");
    expect(rendered).toContain("84/100");
    expect(rendered).toContain("Денис");
    expect(rendered).toContain("+79112223344");
    expect(rendered).toContain("@denis");
    expect(rendered).toContain("Анна");
    expect(rendered).toContain("anna@rentrop.ru");
  });

  it("gates Итого subtab & Сформировать итог strictly until all interview and training stages are completed", async () => {
    const incompleteProps = {
      candidateId: "cand-1",
      candidate: { id: "cand-1", current_stage: "checklist" },
      scores: { resume_score: 80 },
      stageProgress: [{ stage: "professional", passed_at: "2026-11-20T10:00:00Z" }],
      trainingAttempts: [],
      trainingProgress: [],
      stageQuestionMap: null,
      stagePassScoreMap: {},
      trainingSummary: null,
      activeTheme: null,
      onReloadSummary: vi.fn(async () => {}),
      onRefreshCandidate: vi.fn(async () => {}),
    };

    const { rerender } = render(<CandidateTrainingTab {...incompleteProps} />);
    expect(screen.queryByRole("tab", { name: /Итого/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Сформировать итог/i })).not.toBeInTheDocument();

    rerender(
      <CandidateTrainingTab
        {...incompleteProps}
        candidate={{ id: "cand-1", current_stage: "certified" }}
        scores={{ resume_score: 80, checklist_score: 90, situations_score: 85, overall_score: 85 }}
        stageProgress={[
          { stage: "professional", passed_at: "2026-11-20T10:00:00Z" },
          { stage: "product", passed_at: "2026-11-20T11:00:00Z" },
          { stage: "system", passed_at: "2026-11-20T12:00:00Z" },
        ]}
      />
    );

    const summaryTabBtn = screen.getByRole("tab", { name: /Итого/i });
    expect(summaryTabBtn).toBeInTheDocument();
    fireEvent.mouseDown(summaryTabBtn);
    fireEvent.click(summaryTabBtn);

    const generateBtn = await screen.findByRole("button", { name: /Сформировать итог/i });
    expect(generateBtn).toBeInTheDocument();
    mockInvoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    fireEvent.click(generateBtn);
    await waitFor(() => {
      expect(mockRunAiWait).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith("ai-evaluate-training-summary-v2", {
        body: { candidate_id: "cand-1" },
      });
    });
  });

  it("loads custom decision templates, auto-selects last used template, and renders Apple Liquid Glass modal", async () => {
    const customTemplates: DecisionTemplate[] = [
      {
        id: "tpl-inv-1",
        employer_id: "100007",
        decision_type: "invited",
        title: "Оффер в отдел продаж",
        body: "Добрый день, {{candidate_name}}! Приглашаем на позицию {{vacancy_title}}.",
        is_default: false,
      },
      {
        id: "tpl-inv-2",
        employer_id: "100007",
        decision_type: "invited",
        title: "Финальный звонок",
        body: "{{candidate_first_name}}, свяжитесь с нами: {{employer_contacts}}",
        is_default: true,
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/crm/decision-templates/select")) {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          templates: customTemplates,
          last_selected: { invited: "tpl-inv-1", review: null, rejected: null },
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DecisionSection
        candidateId="cand-200775"
        candidate={{ id: "cand-200775", full_name: "Александр Сурков" }}
        scores={{ overall_score: 84 }}
        project={{ role_name: "РОП" }}
        company={{ name: "РентРОП" }}
        responsibleContacts={[{ name: "Денис", phone: "+79991112233" }]}
        containerStyle={{ backdropFilter: "blur(32px)" }}
        onDecisionSaved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/crm/decision-templates?employer_id=100007"),
        expect.any(Object)
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Пригласить на работу/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Пригласить и уведомить/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Оффер в отдел продаж/i })).toBeInTheDocument();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toContain("Александр Сурков");
      expect(textarea.value).toContain("РОП");
    });

    vi.unstubAllGlobals();
  });

  it("submits rejected decision without requesting or triggering any stage mutation", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        templates: [],
        last_selected: { invited: null, review: null, rejected: null },
      }),
    })) as any;
    vi.stubGlobal("fetch", fetchMock);

    mockRpc.mockImplementation(async (fn: string, params: any) => {
      if (fn === "candidate_invite_decision") {
        return {
          data: {
            ok: true,
            hire_decision: params._decision,
            crm_stage: "certified",
            stage: "certified",
            current_stage: "certified",
          },
          error: null,
        };
      }
      if (fn === "candidate_full_details") {
        return {
          data: {
            ok: true,
            candidate: {
              id: "cand-200775",
              full_name: "Александр Сурков",
              crm_stage: "certified",
              stage: "certified",
              current_stage: "certified",
              hire_decision: "rejected",
              hire_message: "Спасибо за участие!",
            },
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const onDecisionSaved = vi.fn();
    render(
      <DecisionSection
        candidateId="cand-200775"
        candidate={{
          id: "cand-200775",
          full_name: "Александр Сурков",
          crm_stage: "certified",
          stage: "certified",
          current_stage: "certified",
        }}
        scores={{ overall_score: 84 }}
        project={{ role_name: "РОП" }}
        company={{ name: "РентРОП" }}
        containerStyle={{ backdropFilter: "blur(32px)" }}
        onDecisionSaved={onDecisionSaved}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^Отказать$/i }));
    const confirmBtn = await screen.findByRole("button", { name: /Отказать и уведомить/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        "candidate_invite_decision",
        expect.objectContaining({
          _candidate: "cand-200775",
          _decision: "rejected",
        })
      );
      expect(onDecisionSaved).toHaveBeenCalledWith(
        expect.objectContaining({
          candidate: expect.objectContaining({
            crm_stage: "certified",
            stage: "certified",
            current_stage: "certified",
            hire_decision: "rejected",
          }),
        }),
        "rejected",
        expect.any(String)
      );
    });

    vi.unstubAllGlobals();
  });
});

