import { Router } from "express";
import { adminAuthTelegramRouter, isAuthorizedAdminOrSysAdmin } from "./authAndTelegram";
import { adminExportImportRouter } from "./exportImport";
import { adminTablesCrudRouter } from "./tablesCrud";
import { adminAnalyticsProtalkRouter } from "./analyticsAndProtalk";
import { adminMailingsRouter } from "../mailings/mailingsRoutes";

export const adminRouter = Router();

adminRouter.use(adminAuthTelegramRouter);

adminRouter.use(async (req, res, next) => {
  if (!(await isAuthorizedAdminOrSysAdmin(req))) {
    return res.status(401).json({
      success: false,
      error: "Требуется авторизация администратора или супер-администратора",
    });
  }
  (req as any).isSuperAdmin = true;
  return next();
});

adminRouter.use(adminExportImportRouter);
adminRouter.use(adminTablesCrudRouter);
adminRouter.use(adminAnalyticsProtalkRouter);
adminRouter.use(adminMailingsRouter);
