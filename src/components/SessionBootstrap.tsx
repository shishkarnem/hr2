/**
 * Глобальный bootstrap-слой:
 * 1) Снимает `?ref=emp123` из URL и складывает в localStorage до OAuth-редиректа.
 * 2) На любую активную сессию (initial getSession, INITIAL_SESSION, SIGNED_IN)
 *    однократно вызывает edge-функцию `signup-bootstrap`, которая привязывает
 *    реферера к новому работодателю и начисляет +1000 RR приглашающему
 *    (бонус приглашённому даёт DB-триггер).
 * 3) Сразу редиректит работодателя в /emp{public_id}/profile через
 *    window.location.replace() — это гарантированно закрывает зависший
 *    AuthModal и сбрасывает loading-state без ручного refresh.
 */
import { useEffect, useRef } from "react";
import { dbClient } from "@/lib/dbClient";
import {
  cacheEmployerPublicId,
  clearCachedEmployerPublicId,
  readCachedEmployerPublicIdForUser,
} from "@/lib/links";

const REF_KEY = "rr_ref";
const DONE_KEY = "rr_bootstrap_done";

function isPublicLandingPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/main" ||
    pathname === "/auth" ||
    pathname === "/demo" ||
    pathname.startsWith("/vacancy") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/faq") ||
    pathname.startsWith("/company/") ||
    pathname.startsWith("/job/")
  );
}

function shouldAutoRedirectFrom(pathname: string): boolean {
  // Never auto-redirect away from public routes (main landing, auth, demo, blog, etc.)
  // Only redirect if the user visits bare '/employer' or '/setup' route directly.
  if (pathname.startsWith("/employer/interview-preview")) return false;
  return pathname === "/employer" || pathname === "/employer/" || pathname === "/setup";
}

export default function SessionBootstrap() {
  // In-memory guards prevent double-bootstrap and double-redirect when both
  // getSession() and onAuthStateChange fire for the same user in this tab.
  const bootstrappedUserRef = useRef<string | null>(null);
  const redirectedUserRef = useRef<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    // Strip the stray "#" left by database implicit-flow after OAuth.
    try {
      if (window.location.hash === "#" || /^#$/.test(window.location.hash)) {
        const clean = window.location.pathname + window.location.search;
        window.history.replaceState({}, "", clean);
      }
    } catch { /* ignore */ }

    // Capture ?ref= from current URL (persists across Google OAuth redirect)
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get("ref");
      const cleanRef = (ref || "").trim();
      if (cleanRef) {
        localStorage.setItem(REF_KEY, cleanRef.toLowerCase());
      }
    } catch { /* ignore */ }

    const handleAuthenticatedSession = async (session: { user: { id: string } } | null) => {
      if (!session?.user) return;
      const userId = session.user.id;
      if (runningRef.current) return;
      if (redirectedUserRef.current === userId) return;

      const here = window.location.pathname;
      if (here === "/" || here === "/main") return;
      // On public landing pages, skip automatic background Edge Functions / RPCs if user is not navigating to cabinet
      if (isPublicLandingPath(here) && !shouldAutoRedirectFrom(here)) {
        return;
      }

      runningRef.current = true;

      try {
        // 1. Fast-path redirect using cached employer public_id (only this user).
        try {
          const cachedPid = readCachedEmployerPublicIdForUser(userId);
          if (cachedPid) {
            const target = `/emp${cachedPid}/profile`;
            if (here !== target && shouldAutoRedirectFrom(here)) {
              redirectedUserRef.current = userId;
              window.location.replace(target);
              return;
            }
          }
        } catch { /* ignore */ }

        // 2. signup-bootstrap (once per user per browser, only for authenticated employer session)
        const hasEmpToken = !!(
          localStorage.getItem("emp_token") || localStorage.getItem("employer_token")
        );
        const doneKey = `${DONE_KEY}:${userId}`;
        const alreadyDone = !!localStorage.getItem(doneKey);
        if (hasEmpToken && !alreadyDone && bootstrappedUserRef.current !== userId) {
          bootstrappedUserRef.current = userId;
          const ref = localStorage.getItem(REF_KEY) || undefined;
          try {
            const { error } = await dbClient.functions.invoke("signup-bootstrap", { body: { ref } });
            if (!error) {
              localStorage.setItem(doneKey, "1");
              localStorage.removeItem(REF_KEY);
            }
          } catch (e) {
            console.warn("[signup-bootstrap] failed", e);
          }
        }

        // 3. Persist offer acceptance if it was flagged at registration.
        try {
          if (hasEmpToken && localStorage.getItem("rr_offer_accepted") === "1") {
            await dbClient.rpc("accept_offer", { _version: "2026-11-17" });
            localStorage.removeItem("rr_offer_accepted");
          }
        } catch (e) {
          console.warn("[accept_offer] failed", e);
        }

        // 4. Resolve employer.public_id and redirect.
        try {
          const { data: emp } = await dbClient
            .from("employers")
            .select("public_id")
            .eq("user_id", userId)
            .maybeSingle();
          if (emp?.public_id) {
            cacheEmployerPublicId(emp.public_id, userId);
            const target = `/emp${emp.public_id}/profile`;
            if (here !== target && shouldAutoRedirectFrom(here)) {
              redirectedUserRef.current = userId;
              window.location.replace(target);
              return;
            }
            redirectedUserRef.current = userId;
          } else {
            clearCachedEmployerPublicId();
          }
        } catch (e) {
          console.warn("[redirect] failed", e);
        }
      } finally {
        runningRef.current = false;
      }
    };

    const currentPath = window.location.pathname;
    if (currentPath === "/" || currentPath === "/main") {
      return;
    }
    const hasTokens = !!(localStorage.getItem("emp_token") || localStorage.getItem("cand_session"));
    if (!isPublicLandingPath(currentPath) || hasTokens) {
      dbClient.auth.getSession().then(({ data }) => {
        void handleAuthenticatedSession(data.session as any);
      });
    }

    // Listen for new sign-ins / initial session events.
    const { data: sub } = dbClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        bootstrappedUserRef.current = null;
        redirectedUserRef.current = null;
        return;
      }
      if (event === "TOKEN_REFRESHED") return;
      if (event === "SIGNED_IN") {
        void handleAuthenticatedSession(session as any);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}