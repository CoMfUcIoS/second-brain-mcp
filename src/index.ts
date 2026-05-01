#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ObsidianVault } from "./vault.js";
import { defaultConfig } from "./config.js";
import {
  SearchOptions,
  VaultConfig,
  parseDate,
  isValidType,
  isValidStatus,
  isValidCategory,
  Note,
} from "./types.js";
import { existsSync, statSync, readFileSync } from "fs";
import { resolve, normalize, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Helper: Creates standardized error response
 */
function createErrorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Helper: Creates standardized success response
 */
function createSuccessResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Formats a note summary for consistent response format
 */
interface NoteSummary {
  path: string;
  title: string;
  excerpt?: string;
  tags?: string[];
  type?: string;
  status?: string;
  category?: string;
  modified?: string;
}

function formatNoteSummary(note: Note): NoteSummary {
  return {
    path: note.path,
    title: note.title,
    excerpt: note.excerpt,
    tags: note.frontmatter.tags || [],
    type: note.frontmatter.type,
    status: note.frontmatter.status,
    category: note.frontmatter.category,
    modified: note.frontmatter.modified,
  };
}

/**
 * Helper: Validates configuration
 */
function validateConfig(cfg: VaultConfig): void {
  if (!cfg.indexPatterns || cfg.indexPatterns.length === 0) {
    throw new Error("Config must have at least one index pattern");
  }
  if (cfg.maxSearchResults < 1) {
    throw new Error("maxSearchResults must be >= 1");
  }
  if (cfg.maxRecentNotes < 1) {
    throw new Error("maxRecentNotes must be >= 1");
  }
  if (cfg.maxFileSize < 1) {
    throw new Error("maxFileSize must be >= 1");
  }
}

/**
 * Helper: Gets CLI argument value
 */
function getArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : undefined;
}

/**
 * Helper: Parses comma-separated string to array
 */
function parseArrayArg(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Parse command line arguments
const args = process.argv.slice(2);

// Get vault path (required)
const vaultPath = getArg(args, "--vault-path");

if (!vaultPath) {
  console.error(
    "Error: Vault path is required. Please provide --vault-path argument.",
  );
  console.error('Example: second-brain-mcp --vault-path "/path/to/vault"');
  process.exit(1);
}

const resolvedVaultPath = resolve(vaultPath);

if (!existsSync(resolvedVaultPath)) {
  console.error(`Error: Vault path does not exist: ${resolvedVaultPath}`);
  process.exit(1);
}

const vaultStats = statSync(resolvedVaultPath);
if (!vaultStats.isDirectory()) {
  console.error(`Error: Vault path is not a directory: ${resolvedVaultPath}`);
  process.exit(1);
}

// Parse optional configuration arguments
const indexPatterns =
  parseArrayArg(getArg(args, "--index-patterns")) ??
  defaultConfig.indexPatterns!;
const excludePatterns =
  parseArrayArg(getArg(args, "--exclude-patterns")) ??
  defaultConfig.excludePatterns!;
const metadataFields =
  parseArrayArg(getArg(args, "--metadata-fields")) ??
  defaultConfig.metadataFields!;

const maxFileSizeArg = getArg(args, "--max-file-size");
const maxFileSize = maxFileSizeArg
  ? parseInt(maxFileSizeArg, 10)
  : defaultConfig.maxFileSize!;

const maxSearchResultsArg = getArg(args, "--max-search-results");
const maxSearchResults = maxSearchResultsArg
  ? parseInt(maxSearchResultsArg, 10)
  : defaultConfig.maxSearchResults!;

const maxRecentNotesArg = getArg(args, "--max-recent-notes");
const maxRecentNotes = maxRecentNotesArg
  ? parseInt(maxRecentNotesArg, 10)
  : defaultConfig.maxRecentNotes!;

const useMemory = args.includes("--use-memory");

// Create configuration with CLI args and defaults
const vaultConfig: VaultConfig = {
  vaultPath: resolvedVaultPath,
  indexPatterns,
  excludePatterns,
  metadataFields,
  maxFileSize,
  maxSearchResults,
  maxRecentNotes,
  useMemory,
  searchWeights: defaultConfig.searchWeights!,
};

// Validate configuration
validateConfig(vaultConfig);

const vault = new ObsidianVault(vaultConfig);

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
);

const server = new Server(
  {
    name: "second-brain-mcp",
    version: packageJson.version,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const tools: Tool[] = [
  {
    name: "search_notes",
    description:
      "Search notes in the Obsidian vault using semantic search with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query (optional - leave empty to list all notes with filters)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: 'Filter by tags (e.g., ["work/puppet", "golang"])',
        },
        type: {
          type: "string",
          enum: ["note", "project", "task", "daily", "meeting"],
          description: "Filter by note type",
        },
        status: {
          type: "string",
          enum: ["active", "archived", "idea", "completed"],
          description: "Filter by status",
        },
        category: {
          type: "string",
          enum: ["work", "personal", "knowledge", "life", "dailies"],
          description: "Filter by category",
        },
        dateFrom: {
          type: "string",
          description: "Filter notes modified from this date (YYYY-MM-DD)",
        },
        dateTo: {
          type: "string",
          description: "Filter notes modified until this date (YYYY-MM-DD)",
        },
        path: {
          type: "string",
          description:
            'Filter by path pattern (e.g., "Work/Puppet/**", "Projects/Active/**")',
        },
        includeArchive: {
          type: "boolean",
          description: "Include archived notes in results (default: false)",
          default: false,
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 20)",
          default: 20,
        },
      },
    },
  },
  {
    name: "get_note",
    description: "Retrieve the full content of a specific note by its path",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            'The path to the note (e.g., "Work/Puppet/Meeting Notes.md")',
        },
      },
      required: ["path"],
    },
  },
  {
    name: "get_notes_by_tag",
    description: "Get all notes with a specific tag",
    inputSchema: {
      type: "object",
      properties: {
        tag: {
          type: "string",
          description:
            'Tag to search for (e.g., "work/puppet", "coffee", "golang")',
        },
      },
      required: ["tag"],
    },
  },
  {
    name: "get_recent_notes",
    description: "Get the most recently modified notes",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent notes to retrieve (default: 10)",
          default: 10,
        },
      },
    },
  },
  {
    name: "list_tags",
    description: "List all unique tags used across all notes",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "summarize_notes",
    description: "Get a summary of notes matching criteria",
    inputSchema: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags",
        },
        type: {
          type: "string",
          enum: ["note", "project", "task", "daily", "meeting"],
          description: "Filter by note type",
        },
        status: {
          type: "string",
          enum: ["active", "archived", "idea", "completed"],
          description: "Filter by status",
        },
        category: {
          type: "string",
          enum: ["work", "personal", "knowledge", "life", "dailies"],
          description: "Filter by category",
        },
      },
    },
  },
  {
    name: "find_knowledge_gaps",
    description:
      "Scan the vault for structural gaps: wikilinks pointing to non-existent notes and notes containing unanswered questions",
    inputSchema: {
      type: "object",
      properties: {
        limitOrphanLinks: {
          type: "number",
          description: "Max orphan link results to return (default: 50)",
          default: 50,
        },
        limitQuestionNotes: {
          type: "number",
          description: "Max question note results to return (default: 20)",
          default: 20,
        },
      },
    },
  },
  {
    name: "get_notes_for_review",
    description:
      "Return notes not modified in N days, sorted by importance (inbound link count). Useful for spaced-repetition review.",
    inputSchema: {
      type: "object",
      properties: {
        daysSinceModified: {
          type: "number",
          description:
            "Only return notes not modified in this many days (default: 14)",
          default: 14,
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
          default: 10,
        },
      },
    },
  },
  {
    name: "find_related_notes",
    description:
      "Given a note path, return the most related notes scored by shared tags, wikilinks, and title words",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            'Relative path to the source note (e.g., "Work/Projects/Alpha.md")',
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
          default: 10,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "get_vault_graph",
    description:
      "Return the full vault link graph as structured data: nodes (notes) with link counts, edges (wikilinks), and graph statistics",
    inputSchema: {
      type: "object",
      properties: {
        includeEdges: {
          type: "boolean",
          description:
            "Include the full edge list (default: true). Set false for large vaults to get node stats only.",
          default: true,
        },
        orphansOnly: {
          type: "boolean",
          description:
            "Return only nodes with no inbound or outbound links (default: false)",
          default: false,
        },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_notes": {
        // Validate limit parameter
        const limit = args?.limit as number | undefined;
        if (
          limit !== undefined &&
          (limit < 1 || limit > vaultConfig.maxSearchResults)
        ) {
          return createErrorResponse(
            `Limit must be between 1 and ${vaultConfig.maxSearchResults}`,
          );
        }

        // Validate type enum if provided
        if (args?.type !== undefined && !isValidType(args.type)) {
          return createErrorResponse(
            "Invalid type. Must be one of: note, project, task, daily, meeting",
          );
        }

        // Validate status enum if provided
        if (args?.status !== undefined && !isValidStatus(args.status)) {
          return createErrorResponse(
            "Invalid status. Must be one of: active, archived, idea, completed",
          );
        }

        // Validate category enum if provided
        if (args?.category !== undefined && !isValidCategory(args.category)) {
          return createErrorResponse(
            "Invalid category. Must be one of: work, personal, knowledge, life, dailies",
          );
        }

        // Validate date formats if provided
        if (args?.dateFrom && !parseDate(args.dateFrom as string)) {
          return createErrorResponse("dateFrom must be in YYYY-MM-DD format");
        }

        if (args?.dateTo && !parseDate(args.dateTo as string)) {
          return createErrorResponse("dateTo must be in YYYY-MM-DD format");
        }

        const options: SearchOptions = {
          tags: Array.isArray(args?.tags) ? (args.tags as string[]) : undefined,
          type: args?.type as typeof options.type,
          status: args?.status as typeof options.status,
          category: args?.category as typeof options.category,
          dateFrom: args?.dateFrom as string | undefined,
          dateTo: args?.dateTo as string | undefined,
          path: typeof args?.path === "string" ? args.path : undefined,
          includeArchive:
            typeof args?.includeArchive === "boolean"
              ? args.includeArchive
              : undefined,
          limit: limit,
        };

        const results = await vault.searchNotes(
          typeof args?.query === "string" ? args.query : "",
          options,
        );

        return createSuccessResponse(results.map(formatNoteSummary));
      }

      case "get_note": {
        const requestedPath = args?.path;

        if (!requestedPath || typeof requestedPath !== "string") {
          return createErrorResponse(
            "Path parameter is required and must be a string",
          );
        }

        // Sanitize path to prevent directory traversal
        const normalizedPath = normalize(requestedPath).replace(
          /^(\.\.(\/|\\|$))+/,
          "",
        );
        const fullPath = resolve(vaultConfig.vaultPath, normalizedPath);

        // Ensure the resolved path is within the vault
        if (!fullPath.startsWith(vaultConfig.vaultPath)) {
          return createErrorResponse(
            "Access denied. Path is outside vault directory",
          );
        }

        const note = await vault.getNote(normalizedPath);
        if (!note) {
          return createErrorResponse(`Note not found: ${normalizedPath}`);
        }

        return createSuccessResponse(note);
      }

      case "get_notes_by_tag": {
        const tag = args?.tag;

        if (!tag || typeof tag !== "string") {
          return createErrorResponse(
            "Tag parameter is required and must be a string",
          );
        }

        const notes = await vault.getNotesByTag(tag);
        return createSuccessResponse(notes.map(formatNoteSummary));
      }

      case "get_recent_notes": {
        const limit = typeof args?.limit === "number" ? args.limit : 10;

        if (limit < 1 || limit > vaultConfig.maxRecentNotes) {
          return createErrorResponse(
            `Limit must be between 1 and ${vaultConfig.maxRecentNotes}`,
          );
        }

        const notes = await vault.getRecentNotes(limit);
        return createSuccessResponse(notes.map(formatNoteSummary));
      }

      case "list_tags": {
        const allNotes = await vault.getAllNotes();
        const tagSet = new Set<string>();
        allNotes.forEach((note) => {
          note.frontmatter.tags?.forEach((tag) => tagSet.add(tag));
        });
        const sortedTags = Array.from(tagSet).sort();

        return createSuccessResponse(sortedTags);
      }

      case "summarize_notes": {
        // Validate enum arguments if provided
        if (args?.type !== undefined && !isValidType(args.type)) {
          return createErrorResponse(
            "Invalid type. Must be one of: note, project, task, daily, meeting",
          );
        }
        if (args?.status !== undefined && !isValidStatus(args.status)) {
          return createErrorResponse(
            "Invalid status. Must be one of: active, archived, idea, completed",
          );
        }
        if (args?.category !== undefined && !isValidCategory(args.category)) {
          return createErrorResponse(
            "Invalid category. Must be one of: work, personal, knowledge, life, dailies",
          );
        }

        const options: SearchOptions = {
          tags: Array.isArray(args?.tags) ? (args.tags as string[]) : undefined,
          type: args?.type as typeof options.type,
          status: args?.status as typeof options.status,
          category: args?.category as typeof options.category,
        };

        const notes = await vault.searchNotes("", options);

        const summary = {
          total: notes.length,
          byType: {} as Record<string, number>,
          byStatus: {} as Record<string, number>,
          byCategory: {} as Record<string, number>,
          recentlyModified: notes.slice(0, 5).map((n) => ({
            title: n.title,
            path: n.path,
            modified: n.frontmatter.modified,
          })),
        };

        notes.forEach((note) => {
          if (note.frontmatter.type) {
            summary.byType[note.frontmatter.type] =
              (summary.byType[note.frontmatter.type] || 0) + 1;
          }
          if (note.frontmatter.status) {
            summary.byStatus[note.frontmatter.status] =
              (summary.byStatus[note.frontmatter.status] || 0) + 1;
          }
          if (note.frontmatter.category) {
            summary.byCategory[note.frontmatter.category] =
              (summary.byCategory[note.frontmatter.category] || 0) + 1;
          }
        });

        return createSuccessResponse(summary);
      }

      case "find_knowledge_gaps": {
        const limitOrphanLinks =
          typeof args?.limitOrphanLinks === "number"
            ? args.limitOrphanLinks
            : undefined;
        const limitQuestionNotes =
          typeof args?.limitQuestionNotes === "number"
            ? args.limitQuestionNotes
            : undefined;
        const result = await vault.findKnowledgeGaps({
          limitOrphanLinks,
          limitQuestionNotes,
        });
        return createSuccessResponse(result);
      }

      case "get_notes_for_review": {
        const daysSinceModified =
          typeof args?.daysSinceModified === "number"
            ? args.daysSinceModified
            : undefined;
        const limit = typeof args?.limit === "number" ? args.limit : undefined;
        const notes = await vault.getNotesForReview({
          daysSinceModified,
          limit,
        });
        return createSuccessResponse(notes);
      }

      case "find_related_notes": {
        const notePath = args?.path;
        if (!notePath || typeof notePath !== "string") {
          return createErrorResponse(
            "path parameter is required and must be a string",
          );
        }
        const normalizedPath = normalize(notePath).replace(
          /^(\.\.(\/|\\|$))+/,
          "",
        );
        const fullPath = resolve(vaultConfig.vaultPath, normalizedPath);
        if (!fullPath.startsWith(vaultConfig.vaultPath)) {
          return createErrorResponse(
            "Access denied. Path is outside vault directory",
          );
        }
        const limit = typeof args?.limit === "number" ? args.limit : undefined;
        const related = await vault.findRelatedNotes(normalizedPath, { limit });
        return createSuccessResponse(related);
      }

      case "get_vault_graph": {
        const includeEdges =
          typeof args?.includeEdges === "boolean"
            ? args.includeEdges
            : undefined;
        const orphansOnly =
          typeof args?.orphansOnly === "boolean" ? args.orphansOnly : undefined;
        const graph = await vault.getVaultGraph({ includeEdges, orphansOnly });
        return createSuccessResponse(graph);
      }

      default:
        return createErrorResponse(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : String(error),
    );
  }
});

async function main() {
  try {
    console.error(`Initializing Second Brain MCP Server...`);
    console.error(`Vault path: ${resolvedVaultPath}`);

    await vault.initialize();

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Second Brain MCP Server running on stdio");
  } catch (error) {
    console.error("Fatal error during initialization:");
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error in main:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
