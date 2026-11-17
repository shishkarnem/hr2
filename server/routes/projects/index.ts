import { Router } from "express";
import { generateUniqueRoleSlugServer } from "../../db";
import { registerProjectCrudRoutes } from "./crud";
import { registerProjectLimitRoutes } from "./limits";
import { registerProjectTrainingAndSummaryRoutes } from "./trainingAndSummaries";
import { registerProjectAiRoutes } from "./aiGenerators";

export { generateUniqueRoleSlugServer };

export const projectsRouter = Router();

registerProjectCrudRoutes(projectsRouter);
registerProjectLimitRoutes(projectsRouter);
registerProjectTrainingAndSummaryRoutes(projectsRouter);
registerProjectAiRoutes(projectsRouter);
