/**
 * Type definitions for active branch extraction.
 *
 * The active branch is the linear chain from root to the current
 * leaf node, discarding orphaned/abandoned conversation branches.
 */

import type { SessionLineItem } from "./session-line-item-types.js";

/**
 * Node in the UUID graph representing a single entry and its relationships.
 */
export interface UuidGraphNode {
	/** The session line item at this node */
	entry: SessionLineItem;
	/** UUID of this node */
	uuid: string;
	/** UUID of the parent node (null for root) */
	parentUuid: string | null;
	/** UUIDs of child nodes */
	childUuids: string[];
}

/**
 * Result of active branch extraction.
 *
 * Contains the entries in the active chain (root to leaf order)
 * and statistics about what was extracted/discarded.
 */
export interface ActiveBranchChain {
	/** Entries in the active chain, ordered from root to leaf */
	entriesInActiveChain: SessionLineItem[];
	/** UUID of the leaf node (most recent in active conversation) */
	leafNodeUuid: string;
	/** UUID of the root node (first entry in conversation) */
	rootNodeUuid: string;
	/** Statistics about the extraction */
	extractionStatistics: ActiveBranchExtractionStatistics;
}

/**
 * Statistics from active branch extraction.
 */
export interface ActiveBranchExtractionStatistics {
	/** Total number of entries in the source file */
	totalEntriesInFile: number;
	/** Number of entries included in the active branch */
	entriesInActiveBranch: number;
	/** Number of orphaned entries that were discarded */
	orphanedEntriesDiscarded: number;
}

/**
 * Options for finding the leaf UUID.
 */
export interface LeafUuidSearchOptions {
	/** If provided, prefer this leafUuid if it exists in the graph */
	preferredLeafUuid?: string;
}

/**
 * Result of building the UUID graph.
 */
export interface UuidGraph {
	/** Map of UUID to graph node */
	nodes: Map<string, UuidGraphNode>;
	/** UUIDs of nodes that are leaves (have no children) */
	leafUuids: string[];
	/** UUIDs of nodes that are roots (have no parent) */
	rootUuids: string[];
}
