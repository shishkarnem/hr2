import { Router } from "express";
import { publicContentRouter } from "./contentRoutes";
import { adminRpcRouter } from "./adminRpcRoutes";
import { assistRouter } from "./assistRoutes";
import { queryRouter } from "./queryRouter";

export const miscRouter = Router();

miscRouter.use(publicContentRouter);
miscRouter.use(adminRpcRouter);
miscRouter.use(assistRouter);
miscRouter.use(queryRouter);
