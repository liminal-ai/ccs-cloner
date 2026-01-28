/**
 * Parent Chain Repairer
 *
 * Repairs broken parentUuid references after entries have been removed
 * from the session.
 */

import type { SessionLineItem } from "../types/index.js";

/**
 * Repair broken parentUuid references.
 *
 * After filtering or removing entries, some entries may reference
 * parent UUIDs that no longer exist. This function repairs the chain
 * by pointing orphaned entries to the last valid entry before them.
 *
 * @param entries - Session entries to repair
 * @returns Entries with repaired parentUuid chain
 */
export function repairBrokenParentReferences(entries: SessionLineItem[]): SessionLineItem[] {
  // Build a set of existing UUIDs
  const existingUuids = new Set<string>();
  for (const entry of entries) {
    if (entry.uuid) {
      existingUuids.add(entry.uuid);
    }
  }

  // Repair entries with missing parents
  const repaired: SessionLineItem[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // If this entry has a parentUuid, check if parent still exists
    if (entry.parentUuid !== null && entry.parentUuid !== undefined) {
      const parentExists = existingUuids.has(entry.parentUuid);

      if (!parentExists) {
        // Find the last entry before this one that has a uuid
        let lastValidUuid: string | null = null;
        for (let j = i - 1; j >= 0; j--) {
          const prevEntry = repaired[j] || entries[j];
          if (prevEntry.uuid) {
            lastValidUuid = prevEntry.uuid;
            break;
          }
        }

        // Create repaired entry with corrected parentUuid
        repaired.push({
          ...entry,
          parentUuid: lastValidUuid,
        });
        continue;
      }
    }

    // Entry is fine, keep as-is
    repaired.push({ ...entry });
  }

  return repaired;
}

/**
 * Validate that the parentUuid chain is intact.
 *
 * @param entries - Session entries to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateParentChain(entries: SessionLineItem[]): string[] {
  const errors: string[] = [];
  const existingUuids = new Set<string>();

  for (const entry of entries) {
    if (entry.uuid) {
      existingUuids.add(entry.uuid);
    }
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.parentUuid && !existingUuids.has(entry.parentUuid)) {
      errors.push(`Entry ${i} (uuid: ${entry.uuid}) has invalid parentUuid: ${entry.parentUuid}`);
    }
  }

  return errors;
}
