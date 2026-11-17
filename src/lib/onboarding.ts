/**
 * Кэш контента онбординга (welcome-окна + подсказки полей).
 * Источник правды — таблица `onboarding_content`. Читается один раз
 * за сессию (anon-доступ), затем хранится в памяти.
 */
import { dbClient } from "@/lib/dbClient";

export type OnboardingSection =
  | "profile" | "companies" | "vacancies"
  | "interviews" | "training" | "crm" | "billing";

export type OnboardingItem = {
  id: string;
  section: OnboardingSection;
  field_key: string | null;
  kind: "section_welcome" | "field_help";
  title: string;
  body_md: string;
  selector: string | null;
  order_idx: number;
};

let cache: OnboardingItem[] | null = null;
let pending: Promise<OnboardingItem[]> | null = null;

export async function loadOnboarding(): Promise<OnboardingItem[]> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch("/api/onboarding");
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      cache = Array.isArray(data) ? (data as OnboardingItem[]) : [];
      return cache;
    } catch (e) {
      console.warn("[onboarding] load failed", e);
      cache = [];
      return cache;
    }
  })();
  return pending;
}

export async function getSectionWelcome(section: OnboardingSection) {
  const all = await loadOnboarding();
  return all.find((x) => x.section === section && x.kind === "section_welcome") || null;
}

export async function getSectionFields(section: OnboardingSection) {
  const all = await loadOnboarding();
  return all.filter((x) => x.section === section && x.kind === "field_help");
}

export async function getFieldHelp(section: OnboardingSection, field_key: string) {
  const all = await loadOnboarding();
  return all.find(
    (x) => x.section === section && x.kind === "field_help" && x.field_key === field_key,
  ) || null;
}

/* ----------------------- Tour state in database --------------------------- */

export type TourStatus = "pending" | "completed" | "dismissed";

export async function getTourStatus(section: OnboardingSection): Promise<TourStatus> {
  const { data: u } = await dbClient.auth.getUser();
  if (!u?.user) return "completed"; // не показываем неавторизованным
  const { data } = await dbClient
    .from("employer_tour_state" as any)
    .select("status")
    .eq("user_id", u.user.id)
    .eq("section", section)
    .maybeSingle();
  return ((data as any)?.status as TourStatus) || "pending";
}

export async function setTourStatus(section: OnboardingSection, status: TourStatus) {
  const { data: u } = await dbClient.auth.getUser();
  if (!u?.user) return;
  await dbClient.from("employer_tour_state" as any).upsert(
    {
      user_id: u.user.id,
      section,
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,section" },
  );
}

export async function resetAllTours() {
  const { data: u } = await dbClient.auth.getUser();
  if (!u?.user) return;
  await dbClient.from("employer_tour_state" as any).delete().eq("user_id", u.user.id);
}
