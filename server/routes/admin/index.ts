import { Router } from "express";
import { adminAuthTelegramRouter } from "./authAndTelegram";
import { adminExportImportRouter } from "./exportImport";
import { adminTablesCrudRouter } from "./tablesCrud";
import { adminAnalyticsProtalkRouter } from "./analyticsAndProtalk";

export const adminRouter = Router();

adminRouter.use(adminAuthTelegramRouter);

adminRouter.use((req, _res, next) => {
  (req as any).isSuperAdmin = true;
  return next();
});

adminRouter.use(adminExportImportRouter);
adminRouter.use(adminTablesCrudRouter);
adminRouter.use(adminAnalyticsProtalkRouter);
