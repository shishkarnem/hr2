import { Router } from "express";
import { cabinetAndStageRouter } from "./cabinetAndStage";
import { scoresAndListRouter } from "./scoresAndList";
import { mutationsAndEvalRouter } from "./mutationsAndEval";

export const candidatesRouter = Router();
candidatesRouter.use("/", cabinetAndStageRouter);
candidatesRouter.use("/", scoresAndListRouter);
candidatesRouter.use("/", mutationsAndEvalRouter);
