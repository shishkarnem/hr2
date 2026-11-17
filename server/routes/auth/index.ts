import { Router } from "express";
import { getProTalkDB } from "../../db";
import { processPendingTransactionNotifications } from "../../telegram";
import { crmRouter } from "../crm";
import { employerAuthRouter } from "./employerAuth";
import { candidateAndRpcRouter } from "./candidateAndRpc";
import { robokassaRouter } from "./robokassa";

export const authRouter = Router();
authRouter.use(employerAuthRouter);
authRouter.use(candidateAndRpcRouter);
authRouter.use(robokassaRouter);
authRouter.use(crmRouter);

let txWorkerStarted = false;
if (!txWorkerStarted) {
  txWorkerStarted = true;
  setInterval(async () => {
    try {
      const db = await getProTalkDB();
      await processPendingTransactionNotifications(db);
    } catch {}
  }, 3000);
}

export { employerSessions, candidateSessions, resetTokens, candidateResetTokens } from "./helpers";
export { getRobokassaSettingsFromDB, getAllRobokassaSettingsFromDB } from "./robokassa";
export type { RobokassaSettings } from "./robokassa";
