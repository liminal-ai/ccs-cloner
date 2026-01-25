/**
 * Configuration Schema
 *
 * Zod schema for validating configuration.
 */

import { z } from "zod";

/**
 * Schema for user configuration file.
 */
export const userConfigurationSchema = z.object({
  /** Claude data directory (default: ~/.claude) */
  claudeDataDirectory: z.string().optional(),
  /** Default percentage of tools to remove (default: 80) */
  defaultToolRemovalPercentage: z.number().min(0).max(100).optional(),
  /** Output format: human-readable or JSON */
  outputFormat: z.enum(["human", "json"]).optional(),
  /** Enable verbose output */
  verboseOutput: z.boolean().optional(),
});

/**
 * Type inferred from the schema.
 */
export type UserConfigurationFromSchema = z.infer<typeof userConfigurationSchema>;

/**
 * Validate a configuration object.
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration
 * @throws ZodError if validation fails
 */
export function validateConfiguration(config: unknown): UserConfigurationFromSchema {
  return userConfigurationSchema.parse(config);
}

/**
 * Safely validate configuration, returning null on error.
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration or null if invalid
 */
export function safeValidateConfiguration(config: unknown): UserConfigurationFromSchema | null {
  const result = userConfigurationSchema.safeParse(config);
  return result.success ? result.data : null;
}
