/**
 * Active Branch Extractor
 *
 * Extracts the active conversation branch from a session by walking
 * the parentUuid chain from a leaf node back to the root, discarding
 * orphaned/abandoned branches.
 */

import { ActiveBranchExtractionError } from "../errors/clone-operation-errors.js";
import type {
	ActiveBranchChain,
	LeafUuidSearchOptions,
	SessionLineItem,
	UuidGraph,
	UuidGraphNode,
} from "../types/index.js";

/**
 * Extract the active branch from a session.
 *
 * This is the main entry point. It builds a UUID graph, finds the leaf node,
 * and walks back to the root to extract only the active conversation chain.
 *
 * @param allSessionEntries - All entries from the session file
 * @param preferredLeafUuid - Optional preferred leaf UUID (e.g., from summary.leafUuid)
 * @returns The active branch chain with statistics
 */
export function extractActiveBranchFromSession(
	allSessionEntries: SessionLineItem[],
	preferredLeafUuid?: string,
): ActiveBranchChain {
	if (allSessionEntries.length === 0) {
		throw new ActiveBranchExtractionError("Session has no entries");
	}

	// Build the UUID graph
	const graph = buildUuidGraphFromEntries(allSessionEntries);

	// Find the leaf UUID using the fallback chain
	const leafUuid = findLeafUuidFromEntries(allSessionEntries, graph, {
		preferredLeafUuid,
	});

	if (!leafUuid) {
		throw new ActiveBranchExtractionError(
			"Could not determine leaf node - no entries with UUIDs found",
		);
	}

	// Walk from leaf to root to get the active branch UUIDs
	const activeBranchUuids = walkParentChainToRoot(leafUuid, graph);

	if (activeBranchUuids.length === 0) {
		throw new ActiveBranchExtractionError(
			"Could not build active branch chain from leaf to root",
		);
	}

	// Convert UUID list to entries, preserving order (root to leaf)
	const entriesInActiveChain: SessionLineItem[] = [];

	// We need to maintain the order from root to leaf
	// activeBranchUuids is already in root-to-leaf order
	for (const uuid of activeBranchUuids) {
		const node = graph.nodes.get(uuid);
		if (node) {
			entriesInActiveChain.push(node.entry);
		}
	}

	// Note: Entries without UUIDs are NOT included. If an entry has no UUID,
	// it cannot be associated with any branch in the parentUuid chain.
	// Summary entries are handled separately in the clone executor.

	const rootNodeUuid = activeBranchUuids[0];
	const entriesInActiveBranch = entriesInActiveChain.length;

	return {
		entriesInActiveChain,
		leafNodeUuid: leafUuid,
		rootNodeUuid,
		extractionStatistics: {
			totalEntriesInFile: allSessionEntries.length,
			entriesInActiveBranch,
			orphanedEntriesDiscarded:
				allSessionEntries.length - entriesInActiveBranch,
		},
	};
}

/**
 * Build a UUID graph from session entries.
 *
 * Creates a map of UUID to graph node, tracking parent/child relationships.
 *
 * @param entries - Session entries
 * @returns UUID graph with nodes, leaves, and roots
 */
export function buildUuidGraphFromEntries(
	entries: SessionLineItem[],
): UuidGraph {
	const nodes = new Map<string, UuidGraphNode>();

	// First pass: create nodes for all entries with UUIDs
	for (const entry of entries) {
		if (entry.uuid) {
			nodes.set(entry.uuid, {
				entry,
				uuid: entry.uuid,
				parentUuid: entry.parentUuid ?? null,
				childUuids: [],
			});
		}
	}

	// Second pass: build child relationships
	for (const node of nodes.values()) {
		if (node.parentUuid && nodes.has(node.parentUuid)) {
			const parentNode = nodes.get(node.parentUuid);
			if (parentNode) {
				parentNode.childUuids.push(node.uuid);
			}
		}
	}

	// Identify leaves (nodes with no children)
	const leafUuids: string[] = [];
	const rootUuids: string[] = [];

	for (const node of nodes.values()) {
		if (node.childUuids.length === 0) {
			leafUuids.push(node.uuid);
		}
		// Root nodes have no parent or parent not in graph
		if (!node.parentUuid || !nodes.has(node.parentUuid)) {
			rootUuids.push(node.uuid);
		}
	}

	return { nodes, leafUuids, rootUuids };
}

/**
 * Find the leaf UUID using a fallback chain.
 *
 * Fallback order:
 * 1. preferredLeafUuid if provided AND exists in graph
 * 2. Leaf with latest timestamp
 * 3. Last leaf in file order
 *
 * @param entries - Session entries
 * @param graph - UUID graph
 * @param options - Search options including preferred leaf
 * @returns The leaf UUID to use, or null if none found
 */
export function findLeafUuidFromEntries(
	entries: SessionLineItem[],
	graph: UuidGraph,
	options: LeafUuidSearchOptions = {},
): string | null {
	// 1. Check if preferred leaf exists in graph AND is actually a leaf node
	if (
		options.preferredLeafUuid &&
		graph.nodes.has(options.preferredLeafUuid) &&
		graph.leafUuids.includes(options.preferredLeafUuid)
	) {
		return options.preferredLeafUuid;
	}

	// No leaves? Return null
	if (graph.leafUuids.length === 0) {
		return null;
	}

	// 2. Find leaf with latest timestamp
	let latestTimestamp = "";
	let latestLeafUuid: string | null = null;

	for (const leafUuid of graph.leafUuids) {
		const node = graph.nodes.get(leafUuid);
		if (node?.entry.timestamp) {
			if (!latestTimestamp || node.entry.timestamp > latestTimestamp) {
				latestTimestamp = node.entry.timestamp;
				latestLeafUuid = leafUuid;
			}
		}
	}

	if (latestLeafUuid) {
		return latestLeafUuid;
	}

	// 3. Fall back to last leaf in file order
	// Find the leaf that appears latest in the entries array
	let lastLeafIndex = -1;
	let lastLeafUuid: string | null = null;

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (entry.uuid && graph.leafUuids.includes(entry.uuid)) {
			if (i > lastLeafIndex) {
				lastLeafIndex = i;
				lastLeafUuid = entry.uuid;
			}
		}
	}

	return lastLeafUuid;
}

/**
 * Walk the parent chain from a leaf node back to the root.
 *
 * @param leafUuid - UUID to start from
 * @param graph - UUID graph
 * @returns Array of UUIDs from root to leaf (in conversation order)
 */
export function walkParentChainToRoot(
	leafUuid: string,
	graph: UuidGraph,
): string[] {
	const chain: string[] = [];
	const visited = new Set<string>();
	let currentUuid: string | null = leafUuid;

	// Walk backwards from leaf to root
	while (currentUuid) {
		// Cycle detection: if we've seen this UUID before, stop
		if (visited.has(currentUuid)) {
			throw new ActiveBranchExtractionError(
				`Cycle detected in parentUuid chain at uuid '${currentUuid}'`,
			);
		}
		visited.add(currentUuid);

		const node = graph.nodes.get(currentUuid);
		if (!node) {
			break;
		}
		chain.push(currentUuid);
		currentUuid = node.parentUuid;
	}

	// Reverse to get root-to-leaf order
	chain.reverse();
	return chain;
}

/**
 * Find the preferred leaf UUID from summary entries.
 *
 * Looks for summary entries with a leafUuid field.
 *
 * @param entries - Session entries
 * @returns The leafUuid from the summary, or undefined if not found
 */
export function findSummaryLeafUuid(
	entries: SessionLineItem[],
): string | undefined {
	for (const entry of entries) {
		if (entry.type === "summary" && entry.leafUuid) {
			return entry.leafUuid;
		}
	}
	return undefined;
}
