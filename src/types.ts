/**
 * YAML frontmatter structure for Obsidian notes
 */
export interface NoteFrontmatter {
  /** Creation date in YYYY-MM-DD format */
  created?: string;
  /** Last modification date in YYYY-MM-DD format */
  modified?: string;
  /** Array of hierarchical tags (e.g., ["work/puppet", "tech/golang"]) */
  tags?: string[];
  /** Type of note */
  type?: "note" | "project" | "task" | "daily" | "meeting";
  /** Current status of the note */
  status?: "active" | "archived" | "idea" | "completed";
  /** Category for organizational purposes */
  category?: "work" | "personal" | "knowledge" | "life" | "dailies";
  /** Allow additional custom frontmatter fields */
  [key: string]: unknown;
}

/**
 * Represents a single note in the vault
 */
export interface Note {
  /** Relative path from vault root */
  path: string;
  /** Note title (filename without extension) */
  title: string;
  /** Full markdown content */
  content: string;
  /** Parsed YAML frontmatter */
  frontmatter: NoteFrontmatter;
  /** Plain text excerpt (markdown stripped) */
  excerpt?: string;
}

/**
 * Search and filter options for querying notes
 */
export interface SearchOptions {
  /** Filter by tags (supports hierarchical matching) */
  tags?: string[];
  /** Filter by note type */
  type?: NoteFrontmatter["type"];
  /** Filter by status */
  status?: NoteFrontmatter["status"];
  /** Filter by category */
  category?: NoteFrontmatter["category"];
  /** Filter notes modified from this date (YYYY-MM-DD) */
  dateFrom?: string;
  /** Filter notes modified until this date (YYYY-MM-DD) */
  dateTo?: string;
  /** Filter by path pattern (e.g., "Work/Puppet/**", "Projects/**") */
  path?: string;
  /** Include archived notes (default: false) */
  includeArchive?: boolean;
  /** Maximum number of results to return (1-100) */
  limit?: number;
}

/**
 * Configuration for vault indexing and search
 */
export interface VaultConfig {
  /** Absolute path to the Obsidian vault directory */
  vaultPath: string;
  /** Glob patterns for files to index */
  indexPatterns: string[];
  /** Glob patterns for files to exclude */
  excludePatterns: string[];
  /** Metadata fields to extract from frontmatter */
  metadataFields: string[];
  /** Maximum file size to index in bytes (default: 10MB) */
  maxFileSize: number;
  /** Maximum number of search results (default: 100) */
  maxSearchResults: number;
  /** Maximum number of recent notes (default: 100) */
  maxRecentNotes: number;
  /** Use in-memory storage instead of database (default: false) */
  useMemory?: boolean;
  /** Search scoring weights */
  searchWeights: {
    /** Weight for title matches */
    title: number;
    /** Weight for tag matches */
    tags: number;
    /** Weight for frontmatter matches */
    frontmatter: number;
    /** Weight for content matches */
    content: number;
    /** Weight boost for recent notes */
    recency: number;
  };
}

/**
 * Utility: Parses and validates a date string in YYYY-MM-DD format
 * @param dateString - Date string to parse
 * @returns Date object if valid, null otherwise
 */
export function parseDate(dateString: string): Date | null {
  if (!dateString) return null;

  // Validate YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return null;
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return null;
  }

  // Verify the date components match the input (catches invalid dates like Feb 30)
  const [year, month, day] = dateString.split("-").map(Number);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Utility: Validates if a value is a valid note type
 */
export function isValidType(value: unknown): value is NoteFrontmatter["type"] {
  return (
    typeof value === "string" &&
    ["note", "project", "task", "daily", "meeting"].includes(value)
  );
}

/**
 * Utility: Validates if a value is a valid note status
 */
export function isValidStatus(
  value: unknown,
): value is NoteFrontmatter["status"] {
  return (
    typeof value === "string" &&
    ["active", "archived", "idea", "completed"].includes(value)
  );
}

/**
 * Utility: Validates if a value is a valid note category
 */
export function isValidCategory(
  value: unknown,
): value is NoteFrontmatter["category"] {
  return (
    typeof value === "string" &&
    ["work", "personal", "knowledge", "life", "dailies"].includes(value)
  );
}

export interface OrphanLink {
  source: string;
  target: string;
}

export interface QuestionNote {
  path: string;
  title: string;
  questions: string[];
}

export interface KnowledgeGapsResult {
  orphanLinks: OrphanLink[];
  questionNotes: QuestionNote[];
  stats: {
    totalOrphanLinks: number;
    totalQuestionNotes: number;
  };
}

export interface ReviewNote {
  path: string;
  title: string;
  excerpt?: string;
  tags?: string[];
  type?: string;
  status?: string;
  category?: string;
  modified?: string;
  daysSinceModified: number;
}

export interface RelatedNote {
  path: string;
  title: string;
  excerpt?: string;
  tags?: string[];
  type?: string;
  status?: string;
  category?: string;
  modified?: string;
  score: number;
  relationships: string[];
}

export interface GraphNode {
  path: string;
  title: string;
  inLinks: number;
  outLinks: number;
  tagCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  targetExists: boolean;
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges?: GraphEdge[];
  stats: {
    totalNotes: number;
    totalLinks: number;
    brokenLinks: number;
    orphanNotes: number;
  };
}
