/**
 * Dispatches the first URL segment to the right page:
 * - /employer{publicId}/...  → EmployerPanel (path picked up by its own parser)
 * - /candidate{publicId}/... → CandidateFlow
 * - everything else          → CompanyLanding (slug-based public page)
 *
 * This sidesteps React Router v6's "param must be a full segment" limitation
 * and lets the app keep clean concatenated URLs like /employerempa597a5/profile.
 */
import React, { lazy } from "react";
import { useParams } from "react-router-dom";
import { useRouter } from "./RouterContext";

const EmployerPanel = lazy(() => import("../pages/EmployerPanel"));
const CandidateFlow = lazy(() => import("../pages/CandidateFlow"));
const CompanyLanding = lazy(() => import("../pages/CompanyLanding"));
const LandingPage = lazy(() => import("../pages/LandingPage"));

export default function SegmentDispatcher() {
  const { firstSeg = "" } = useParams();
  const { path } = useRouter();
  const segments = path.split("/").filter(Boolean);
  if (!firstSeg || firstSeg === "main" || firstSeg === "home") {
    return <LandingPage />;
  }
  const isEmployerPath = /^(emp|employer)[A-Za-z0-9_-]+$/.test(firstSeg);
  const isCandidatePath = /^(cand|candidate)[A-Za-z0-9_-]+$/.test(firstSeg) || /^\d{4,}$/.test(firstSeg);
  const companyPathHasCandidate = segments.some((s) => /^(cand|candidate)[A-Za-z0-9_-]+$/i.test(s));

  if (isEmployerPath) return <EmployerPanel />;
  if (isCandidatePath || companyPathHasCandidate) return <CandidateFlow />;
  if (/^com\d+$/i.test(firstSeg)) {
    return <CompanyLanding />;
  }

  // Slug-based paths (e.g. /rentrop, /rentrop/rukovoditel-otdela-prodazh-rop, etc.)
  return <CompanyLanding />;
}