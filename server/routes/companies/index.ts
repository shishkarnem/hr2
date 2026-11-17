import { Router } from "express";
import { companyThemesRouter } from "./themes";
import { companyCrudRouter } from "./crud";
import { companyAiFieldsRouter } from "./aiFields";

export const companiesRouter = Router();

companiesRouter.use(companyThemesRouter);
companiesRouter.use(companyCrudRouter);
companiesRouter.use(companyAiFieldsRouter);
