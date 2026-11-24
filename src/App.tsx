import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SegmentDispatcher from "./components/SegmentDispatcher";
import SessionBootstrap from "./components/SessionBootstrap";
import CacheResetGuard from "./components/CacheResetGuard";
import AppVersionGuard from "./components/AppVersionGuard";
import { AIWaitProvider } from "./components/AIWaitProvider";
import { AIRestartGate } from "./components/AIRestartGate";
import { AIFallbackGate } from "./components/AIFallbackGate";
import { ConfirmProvider } from "./components/ConfirmDialog";
import IframeCookieHelper from "./components/IframeCookieHelper";
import InteractiveLandingBackground from "./components/InteractiveLandingBackground";

function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((err: any) => {
      console.warn("[Router] Dynamic import failed, retrying once...", err);
      return new Promise<{ default: T }>((resolve, reject) => {
        setTimeout(() => {
          factory().then(resolve).catch(reject);
        }, 500);
      });
    })
  );
}

// Lazy-loaded pages for bundle code-splitting and faster initial page load
const LandingPage = safeLazy(() => import("./pages/LandingPage"));
const DemoInterviewPage = safeLazy(() => import("./pages/DemoInterviewPage"));
const VacancyCatalogPage = safeLazy(() => import("./pages/VacancyCatalogPage"));
const BlogListPage = safeLazy(() => import("./pages/BlogListPage"));
const BlogPostPage = safeLazy(() => import("./pages/BlogPostPage"));
const FaqPage = safeLazy(() => import("./pages/FaqPage"));
const AcademyPage = safeLazy(() => import("./pages/AcademyPage"));
const EmployerPanel = safeLazy(() => import("./pages/EmployerPanel"));
const EmployerInterviewPreview = safeLazy(() => import("./pages/EmployerInterviewPreview"));
const CandidateFlow = safeLazy(() => import("./pages/CandidateFlow"));
const AdminPanel = safeLazy(() => import("./pages/AdminPanel"));
const SystemAdminPage = safeLazy(() => import("./pages/SystemAdminPage").then((m) => ({ default: m.SystemAdminPage })));
const JobVacancyLanding = safeLazy(() => import("./pages/JobVacancyLanding"));
const CompanyLanding = safeLazy(() => import("./pages/CompanyLanding"));
const NotFoundPage = safeLazy(() => import("./pages/NotFoundPage"));
const OfferPage = safeLazy(() => import("./pages/OfferPage"));
const ResetPasswordPage = safeLazy(() => import("./pages/ResetPasswordPage"));
const PaymentSuccessPage = safeLazy(() => import("./pages/PaymentResultPage").then((m) => ({ default: m.PaymentSuccessPage })));
const PaymentFailPage = safeLazy(() => import("./pages/PaymentResultPage").then((m) => ({ default: m.PaymentFailPage })));

function RouteSuspenseFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="backdrop-blur-xl bg-white/[0.04] border border-white/20 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3 max-w-sm w-full text-center">
        <div className="w-9 h-9 rounded-full border-2 border-white/20 border-t-[#E7C768] animate-spin" />
        <span className="text-sm font-medium text-white/90">Загрузка раздела...</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <InteractiveLandingBackground />
      <IframeCookieHelper />
      <AIWaitProvider>
        <ConfirmProvider>
          <SessionBootstrap />
          <CacheResetGuard />
          <AppVersionGuard />
          <AIRestartGate />
          <AIFallbackGate />
          <Suspense fallback={<RouteSuspenseFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/main" element={<LandingPage />} />
              <Route path="/main/*" element={<LandingPage />} />
              <Route path="/demo" element={<DemoInterviewPage />} />
              <Route path="/vacancy" element={<VacancyCatalogPage />} />
              <Route path="/vacancies" element={<VacancyCatalogPage />} />
              <Route path="/blog" element={<BlogListPage />} />
              <Route path="/blog/:pid" element={<BlogPostPage />} />
              <Route path="/academy" element={<AcademyPage />} />
              <Route path="/academy/*" element={<AcademyPage />} />
              <Route path="/wiki" element={<AcademyPage />} />
              <Route path="/wiki/*" element={<AcademyPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/system-admin" element={<SystemAdminPage />} />
              <Route path="/system-admin/*" element={<SystemAdminPage />} />
              <Route path="/job" element={<JobVacancyLanding />} />
              <Route path="/auth" element={<LandingPage />} />
              <Route path="/setup" element={<EmployerPanel />} />
              <Route path="/employer/interview-preview/:projectId" element={<EmployerInterviewPreview />} />
              <Route path="/employer" element={<EmployerPanel />} />
              <Route path="/employer/*" element={<EmployerPanel />} />
              <Route path="/candidate" element={<CandidateFlow />} />
              <Route path="/candidate/*" element={<CandidateFlow />} />
              <Route path="/company/:slug" element={<CompanyLanding />} />
              <Route path="/offer" element={<OfferPage docType="offer" audience="employer" />} />
              <Route path="/oferta" element={<OfferPage docType="offer" audience="employer" />} />
              <Route path="/privacy" element={<OfferPage docType="privacy" audience="employer" />} />
              <Route path="/terms" element={<OfferPage docType="terms" audience="employer" />} />
              <Route path="/agreement" element={<OfferPage docType="terms" audience="employer" />} />
              <Route path="/consent" element={<OfferPage docType="consent" audience="employer" />} />
              <Route path="/candidate-privacy" element={<OfferPage docType="privacy" audience="candidate" />} />
              <Route path="/candidate-terms" element={<OfferPage docType="terms" audience="candidate" />} />
              <Route path="/candidate-consent" element={<OfferPage docType="consent" audience="candidate" />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/payment/success" element={<PaymentSuccessPage />} />
              <Route path="/payment/fail" element={<PaymentFailPage />} />
              <Route path="/payment/info" element={<OfferPage docType="offer" audience="employer" />} />
              {/* Dynamic concatenated segments: /employer{id}/..., /candidate{id}/..., or company slug */}
              <Route path="/:firstSeg" element={<SegmentDispatcher />} />
              <Route path="/:firstSeg/*" element={<SegmentDispatcher />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ConfirmProvider>
      </AIWaitProvider>
    </BrowserRouter>
  );
}
