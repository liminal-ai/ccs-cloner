/**
 * Configured Logger
 *
 * Creates a consola logger instance with proper configuration.
 */

import { createConsola, type ConsolaInstance, type LogLevel } from "consola";

/**
 * Logger configuration options.
 */
export interface LoggerOptions {
  /** Output format: human-readable or JSON */
  format: "human" | "json";
  /** Enable verbose output */
  verbose: boolean;
  /** Enable debug output */
  debug?: boolean;
}

/**
 * Create a configured consola logger instance.
 *
 * @param options - Logger configuration options
 * @returns Configured consola instance
 */
export function createConfiguredLogger(options: LoggerOptions): ConsolaInstance {
  let level: LogLevel = 3; // info

  if (options.debug) {
    level = 5; // trace
  } else if (options.verbose) {
    level = 4; // debug
  }

  const logger = createConsola({
    level,
  });

  return logger;
}

/**
 * Global logger instance.
 * Must be initialized with createConfiguredLogger() before use.
 */
let globalLogger: ConsolaInstance | null = null;

/**
 * Initialize the global logger.
 *
 * @param options - Logger configuration options
 */
export function initializeLogger(options: LoggerOptions): void {
  globalLogger = createConfiguredLogger(options);
}

/**
 * Get the global logger instance.
 *
 * @returns The global logger, or a default logger if not initialized
 */
export function getLogger(): ConsolaInstance {
  if (!globalLogger) {
    globalLogger = createConsola({ level: 3 });
  }
  return globalLogger;
}

/**
 * Log a success message.
 *
 * @param message - Message to log
 */
export function logSuccess(message: string): void {
  getLogger().success(message);
}

/**
 * Log an info message.
 *
 * @param message - Message to log
 */
export function logInfo(message: string): void {
  getLogger().info(message);
}

/**
 * Log a warning message.
 *
 * @param message - Message to log
 */
export function logWarning(message: string): void {
  getLogger().warn(message);
}

/**
 * Log an error message.
 *
 * @param message - Message to log
 */
export function logError(message: string): void {
  getLogger().error(message);
}

/**
 * Log a debug message.
 *
 * @param message - Message to log
 */
export function logDebug(message: string): void {
  getLogger().debug(message);
}
