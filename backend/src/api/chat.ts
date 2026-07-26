import { Router, Request, Response } from "express";
import { QAService } from "../rag/qa_service";
import { validateChatRequest } from "../models/schemas";
import logger from "../core/logger";

export const chatRouter = Router();

chatRouter.post("/", async (req: Request, res: Response) => {
  try {
    const validated = validateChatRequest(req.body);
    const service = new QAService();
    const result = await service.answer(validated.query);
    res.json(result);
  } catch (error) {
    logger.error("Chat request failed:", error);
    if (error instanceof Error) {
      if (error.message.includes("No indexed embeddings found")) {
        return res
          .status(400)
          .json({ detail: "No indexed embeddings found. Run scrape/reindex first." });
      }
      return res.status(500).json({ detail: `Chat request failed: ${error.message}` });
    }
    res.status(500).json({ detail: "Internal server error" });
  }
});
