import { getSettings } from "./config";

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

class Logger {
  private logLevel: LogLevel;

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
  }

  private log(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    if (level === LogLevel.ERROR) {
      console.error(prefix, message, data ?? "");
    } else if (level === LogLevel.WARN) {
      console.warn(prefix, message, data ?? "");
    } else {
      console.log(prefix, message, data ?? "");
    }
  }

  debug(message: string, data?: any): void {
    if (this.logLevel === LogLevel.DEBUG) {
      this.log(LogLevel.DEBUG, message, data);
    }
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }
}

const settings = getSettings();
const logLevel =
  settings.appEnv === "development" ? LogLevel.DEBUG : LogLevel.INFO;
const logger = new Logger(logLevel);

export default logger;
