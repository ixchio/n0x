/**
 * Centralized logging utility for n0x
 *
 * Usage:
 *   import { logger } from '@/lib/core/logger';
 *   logger.debug('Debug info', data);
 *   logger.info('Info message');
 *   logger.warn('Warning', error);
 *   logger.error('Error occurred', error);
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

class Logger {
    private minLevel: LogLevel;
    private isProduction: boolean;

    constructor() {
        this.isProduction = process.env.NODE_ENV === "production";
        // Keep structured product events observable in production while omitting debug noise.
        this.minLevel = this.isProduction ? "info" : "debug";
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
    }

    private format(level: LogLevel, message: string, ...args: any[]): void {
        if (!this.shouldLog(level)) return;

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

        switch (level) {
            case "debug":
                console.debug(prefix, message, ...args);
                break;
            case "info":
                console.info(prefix, message, ...args);
                break;
            case "warn":
                console.warn(prefix, message, ...args);
                break;
            case "error":
                console.error(prefix, message, ...args);
                break;
        }
    }

    debug(message: string, ...args: any[]): void {
        this.format("debug", message, ...args);
    }

    info(message: string, ...args: any[]): void {
        this.format("info", message, ...args);
    }

    warn(message: string, ...args: any[]): void {
        this.format("warn", message, ...args);
    }

    error(message: string, ...args: any[]): void {
        this.format("error", message, ...args);
    }

    /**
     * Set minimum log level dynamically
     * Useful for debugging specific issues in production
     */
    setLevel(level: LogLevel): void {
        this.minLevel = level;
    }
}

export const logger = new Logger();
