import express, { Express, Request, Response } from "express";
import cors from "cors";
import * as path from "path";
import * as fs from "fs";
import { initDatabase } from "./db/database";
import { apiRouter } from "./api/routes";
import { getSettings } from "./core/config";
import logger from "./core/logger";

async function createApp(): Promise<Express> {
  const app = express();
  const settings = getSettings();

  // Middleware
  app.use(express.json());
  app.use(
    cors({
      origin: settings.corsOrigins,
      credentials: true,
    })
  );

  // Health check
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok", environment: settings.appEnv });
  });

  // API routes
  app.use("/api", apiRouter);

  // Serve frontend if it exists
  // Check multiple locations for frontend dist across dev, build, and Docker environments
  const possibleFrontendPaths = [
    path.resolve(process.cwd(), "../frontend/dist"),
    path.resolve(process.cwd(), "frontend/dist"),
    path.resolve(process.cwd(), "dist-frontend"),
    path.resolve(process.cwd(), "../dist-frontend"),
    path.resolve(__dirname, "../../../frontend/dist"),
    path.resolve(__dirname, "../../frontend/dist"),
    path.resolve(__dirname, "../../dist-frontend"),
    path.resolve(__dirname, "../dist-frontend"),
  ];

  const frontendDist = possibleFrontendPaths.find((p) => fs.existsSync(p));

  if (frontendDist) {
    logger.info(`Serving frontend from: ${frontendDist}`);
    app.use(express.static(frontendDist));
    // SPA fallback
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    logger.warn("Frontend static directory not found. Serving API fallback response.");
    // Fallback if frontend not found
    app.get("*", (req: Request, res: Response) => {
      res.json({ message: "Frontend not available. API running at /api" });
    });
  }

  return app;
}

async function main(): Promise<void> {
  const settings = getSettings();

  try {
    // Initialize database
    logger.info("Initializing database...");
    await initDatabase();

    // Create Express app
    logger.info("Creating Express app...");
    const app = await createApp();

    // Start server
    app.listen(settings.appPort, () => {
      logger.info(
        `Server running at http://localhost:${settings.appPort}`
      );
      logger.info(`Environment: ${settings.appEnv}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
