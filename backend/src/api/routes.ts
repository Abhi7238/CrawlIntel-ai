import { Router } from "express";
import { chatRouter } from "./chat";
import { scrapeRouter } from "./scrape";

export const apiRouter = Router();

apiRouter.use("/chat", chatRouter);
apiRouter.use("/scrape", scrapeRouter);
