import { readFile, stat } from "fs/promises";
import { glob } from "glob";
import matter from "gray-matter";
import { basename, relative } from "path";
import {
  Note,
  SearchOptions,
  VaultConfig,
  isValidType,
  isValidStatus,
  isValidCategory,
  NoteFrontmatter,
  KnowledgeGapsResult,
  ReviewNote,
  RelatedNote,
  VaultGraph,
  OrphanLink,
  QuestionNote,
  GraphNode,
  GraphEdge,
  parseDate,
} from "./types.js";
import { IStorage } from "./storage.js";
import { createStorage } from "./storage-factory.js";

/**
 * Manages indexing and searching of an Obsidian vault
 */
export class ObsidianVault {
  private storage: IStorage;
  private config: VaultConfig;
  private indexErrors: Array<{ path: string; error: string }> = [];

  constructor(config: VaultConfig) {
    this.config = config;
    this.storage = createStorage(config);
  }

  /**
   * Initialize the vault by indexing all notes and setting up search
   * @throws {Error} If vault initialization fails
   */
  async initialize(): Promise<void> {
    try {
      console.error("Initializing Obsidian vault...");
      this.indexErrors = []; // Reset errors
      await this.storage.initialize();
      const notes = await this.indexNotes();
      await this.storage.upsertNotes(notes);
      console.error(`Indexed ${notes.length} notes`);

      if (this.indexErrors.length > 0) {
        console.error(
          `Warning: ${this.indexErrors.length} file(s) failed to index`,
        );
        // Log first few errors for debugging
        this.indexErrors.slice(0, 5).forEach((err) => {
          console.error(`  - ${err.path}: ${err.error}`);
        });
      }
    } catch (error) {
      console.error(
        "Failed to initialize vault:",
        error instanceof Error ? error.message : String(error),
      );
      throw new Error(
        `Vault initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async indexNotes(): Promise<Note[]> {
    const files: string[] = [];

    // Yield to the event loop so any pending I/O callbacks (e.g. writeFile
    // completions) have settled before we start the directory scan.
    await new Promise<void>((resolve) => setImmediate(resolve));

    try {
      for (const pattern of this.config.indexPatterns) {
        const matches = await glob(pattern, {
          cwd: this.config.vaultPath,
          absolute: true,
          ignore: this.config.excludePatterns,
        });
        files.push(...matches);
      }
    } catch (error) {
      throw new Error(
        `Failed to scan vault directory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (files.length === 0) {
      console.error(
        "Warning: No markdown files found matching the index patterns",
      );
    }

    const notesWithPossibleNulls = await Promise.all(
      files.map(async (filePath) => {
        try {
          // Check file size before reading
          const fileStats = await stat(filePath);
          if (fileStats.size > this.config.maxFileSize) {
            this.indexErrors.push({
              path: filePath,
              error: `File too large (${Math.round(fileStats.size / 1024 / 1024)}MB, max ${Math.round(this.config.maxFileSize / 1024 / 1024)}MB)`,
            });
            return null;
          }

          const content = await readFile(filePath, "utf-8");
          const { data, content: markdownContent } = matter(content);

          const title = basename(filePath, ".md");
          const excerpt = this.createExcerpt(markdownContent);

          // Provide safe defaults for missing frontmatter fields with validation
          const { created, modified, tags, type, status, category, ...rest } =
            data;
          const frontmatter: NoteFrontmatter = {
            created: typeof created === "string" ? created : "",
            modified: typeof modified === "string" ? modified : "",
            tags: Array.isArray(tags) ? tags : [],
            type: isValidType(type) ? type : "note",
            status: isValidStatus(status) ? status : "active",
            category: isValidCategory(category) ? category : "personal",
            ...rest, // Add other custom fields after validation
          };

          // Use path.relative for secure path handling
          const relativePath = relative(this.config.vaultPath, filePath);

          return {
            path: relativePath,
            title,
            content: markdownContent,
            frontmatter,
            excerpt,
          } as Note;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.indexErrors.push({ path: filePath, error: errorMessage });
          return null;
        }
      }),
    );

    return notesWithPossibleNulls.filter((n): n is Note => n !== null);
  }

  private createExcerpt(content: string, length: number = 200): string {
    // Pre-slice to avoid processing entire large files
    const maxProcessLength = length * 3;
    const contentToProcess =
      content.length > maxProcessLength
        ? content.slice(0, maxProcessLength)
        : content;

    const cleanContent = contentToProcess
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      // Remove inline code
      .replace(/`[^`]+`/g, "")
      // Remove images
      .replace(/!\[.*?\]\(.*?\)/g, "")
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove wiki links but keep text
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
      // Remove headers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      // Remove blockquotes
      .replace(/^>\s+/gm, "")
      // Remove horizontal rules
      .replace(/^[-*_]{3,}$/gm, "")
      // Remove list markers
      .replace(/^[\s]*[-*+]\s+/gm, "")
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // Remove extra whitespace
      .replace(/\n{2,}/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return (
      cleanContent.slice(0, length) +
      (cleanContent.length > length ? "..." : "")
    );
  }

  /**
   * Search notes with fuzzy matching and filters
   * @param query - Search query string (optional)
   * @param options - Filter and limit options
   * @returns Array of matching notes sorted by relevance and recency
   */
  searchNotes(query: string, options: SearchOptions = {}): Promise<Note[]> {
    return this.storage.searchNotes(query, options);
  }

  /**
   * Get a specific note by its path
   * @param path - Relative path from vault root
   * @returns The note or undefined if not found
   */
  async getNote(path: string): Promise<Note | null> {
    return this.storage.getNote(path);
  }

  /**
   * Get all indexed notes
   * @returns Array of all notes
   */
  async getAllNotes(): Promise<Note[]> {
    return this.storage.getAllNotes();
  }

  /**
   * Get notes with a specific tag (supports hierarchical matching)
   * @param tag - Tag to search for (e.g., "work" or "work/puppet")
   * @returns Array of matching notes
   */
  async getNotesByTag(tag: string): Promise<Note[]> {
    return this.storage.getNotesByTag(tag);
  }

  /**
   * Get the most recently modified notes
   * @param limit - Maximum number of notes to return
   * @returns Array of notes sorted by modification date (newest first)
   */
  async getRecentNotes(limit: number = 10): Promise<Note[]> {
    return this.storage.getRecentNotes(limit);
  }

  private extractWikilinks(content: string): string[] {
    return Array.from(
      content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g),
      (m) => m[1].trim(),
    );
  }

  private extractQuestionLines(content: string): string[] {
    const withoutCode = content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]+`/g, "");
    return withoutCode
      .split("\n")
      .map((line) =>
        line
          .replace(/^#{1,6}\s+/, "")
          .replace(/^>\s+/, "")
          .replace(/^[\s]*[-*+]\s+/, "")
          .replace(/^[\s]*\d+\.\s+/, "")
          .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
          .trim(),
      )
      .filter((line) => line.endsWith("?") && line.length > 3);
  }

  async findKnowledgeGaps(
    options: { limitOrphanLinks?: number; limitQuestionNotes?: number } = {},
  ): Promise<KnowledgeGapsResult> {
    const { limitOrphanLinks = 50, limitQuestionNotes = 20 } = options;
    const notes = await this.storage.getAllNotes();

    const noteTitleSet = new Set(notes.map((n) => n.title.toLowerCase()));

    const orphanLinks: OrphanLink[] = [];
    const questionNotes: QuestionNote[] = [];

    for (const note of notes) {
      for (const target of this.extractWikilinks(note.content)) {
        const targetTitle = target.split("/").pop()!.toLowerCase();
        if (!noteTitleSet.has(targetTitle)) {
          orphanLinks.push({ source: note.path, target });
        }
      }

      const questions = this.extractQuestionLines(note.content);
      if (questions.length > 0) {
        questionNotes.push({ path: note.path, title: note.title, questions });
      }
    }

    return {
      orphanLinks: orphanLinks.slice(0, limitOrphanLinks),
      questionNotes: questionNotes.slice(0, limitQuestionNotes),
      stats: {
        totalOrphanLinks: orphanLinks.length,
        totalQuestionNotes: questionNotes.length,
      },
    };
  }

  async getNotesForReview(
    options: { daysSinceModified?: number; limit?: number } = {},
  ): Promise<ReviewNote[]> {
    const { daysSinceModified = 14, limit = 10 } = options;
    const notes = await this.storage.getAllNotes();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - daysSinceModified);

    const inboundCount = new Map<string, number>(notes.map((n) => [n.path, 0]));
    const titleToPath = new Map(
      notes.map((n) => [n.title.toLowerCase(), n.path]),
    );
    for (const note of notes) {
      for (const target of this.extractWikilinks(note.content)) {
        const targetPath = titleToPath.get(
          target.split("/").pop()!.toLowerCase(),
        );
        if (targetPath) {
          inboundCount.set(targetPath, (inboundCount.get(targetPath) || 0) + 1);
        }
      }
    }

    const candidates: ReviewNote[] = [];

    for (const note of notes) {
      const dateStr =
        (note.frontmatter.modified as string | undefined) ||
        (note.frontmatter.created as string | undefined);
      if (!dateStr) continue;
      const noteDate = parseDate(dateStr);
      if (!noteDate || noteDate >= cutoff) continue;

      const diffDays = Math.round(
        (today.getTime() - noteDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      candidates.push({
        path: note.path,
        title: note.title,
        excerpt: note.excerpt,
        tags: note.frontmatter.tags || [],
        type: note.frontmatter.type,
        status: note.frontmatter.status,
        category: note.frontmatter.category,
        modified: note.frontmatter.modified as string | undefined,
        daysSinceModified: diffDays,
      });
    }

    candidates.sort((a, b) => {
      const daysDiff = b.daysSinceModified - a.daysSinceModified;
      if (daysDiff !== 0) return daysDiff;
      return (inboundCount.get(b.path) || 0) - (inboundCount.get(a.path) || 0);
    });

    return candidates.slice(0, limit);
  }

  async findRelatedNotes(
    notePath: string,
    options: { limit?: number } = {},
  ): Promise<RelatedNote[]> {
    const { limit = 10 } = options;
    const notes = await this.storage.getAllNotes();

    const source = notes.find((n) => n.path === notePath);
    if (!source) return [];

    const sourceOutLinks = new Set(
      this.extractWikilinks(source.content).map((t) =>
        t.split("/").pop()!.toLowerCase(),
      ),
    );
    const sourceTags = new Set(source.frontmatter.tags || []);
    const sourceTitleWords = new Set(
      source.title
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4),
    );

    const results: RelatedNote[] = [];

    for (const candidate of notes) {
      if (candidate.path === notePath) continue;

      let score = 0;
      const relationships: string[] = [];

      if (sourceOutLinks.has(candidate.title.toLowerCase())) {
        score += 5;
        relationships.push("this note links to it");
      }

      const candidateOutLinks = new Set(
        this.extractWikilinks(candidate.content).map((t) =>
          t.split("/").pop()!.toLowerCase(),
        ),
      );
      if (candidateOutLinks.has(source.title.toLowerCase())) {
        score += 5;
        relationships.push("links to this note");
      }

      const sharedTags = (candidate.frontmatter.tags || []).filter((t) =>
        sourceTags.has(t),
      );
      if (sharedTags.length > 0) {
        score += sharedTags.length * 3;
        relationships.push(
          `${sharedTags.length} shared tag${sharedTags.length > 1 ? "s" : ""}: ${sharedTags.join(", ")}`,
        );
      }

      const candidateTitleWords = candidate.title
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4);
      const sharedWords = candidateTitleWords.filter((w) =>
        sourceTitleWords.has(w),
      );
      if (sharedWords.length > 0) {
        score += sharedWords.length;
        relationships.push(
          `shared title word${sharedWords.length > 1 ? "s" : ""}: ${sharedWords.join(", ")}`,
        );
      }

      if (score > 0) {
        results.push({
          path: candidate.path,
          title: candidate.title,
          excerpt: candidate.excerpt,
          tags: candidate.frontmatter.tags || [],
          type: candidate.frontmatter.type,
          status: candidate.frontmatter.status,
          category: candidate.frontmatter.category,
          modified: candidate.frontmatter.modified as string | undefined,
          score,
          relationships,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async getVaultGraph(
    options: { includeEdges?: boolean; orphansOnly?: boolean } = {},
  ): Promise<VaultGraph> {
    const { includeEdges = true, orphansOnly = false } = options;
    const notes = await this.storage.getAllNotes();

    const titleToPath = new Map(
      notes.map((n) => [n.title.toLowerCase(), n.path]),
    );
    const inCount = new Map<string, number>(notes.map((n) => [n.path, 0]));
    const outCount = new Map<string, number>(notes.map((n) => [n.path, 0]));
    const edges: GraphEdge[] = [];
    let brokenLinks = 0;

    for (const note of notes) {
      for (const target of this.extractWikilinks(note.content)) {
        const targetPath = titleToPath.get(
          target.split("/").pop()!.toLowerCase(),
        );
        const targetExists = !!targetPath;

        if (!targetExists) {
          brokenLinks++;
        } else {
          inCount.set(targetPath, (inCount.get(targetPath) || 0) + 1);
        }
        outCount.set(note.path, (outCount.get(note.path) || 0) + 1);

        if (includeEdges) {
          edges.push({ source: note.path, target, targetExists });
        }
      }
    }

    let nodes: GraphNode[] = notes.map((n) => ({
      path: n.path,
      title: n.title,
      inLinks: inCount.get(n.path) || 0,
      outLinks: outCount.get(n.path) || 0,
      tagCount: (n.frontmatter.tags || []).length,
    }));

    if (orphansOnly) {
      nodes = nodes.filter((n) => n.inLinks === 0 && n.outLinks === 0);
    }

    const orphanNotes = nodes.filter(
      (n) => n.inLinks === 0 && n.outLinks === 0,
    ).length;

    const totalLinks = includeEdges
      ? edges.length
      : Array.from(outCount.values()).reduce((a, b) => a + b, 0);

    return {
      nodes,
      ...(includeEdges ? { edges } : {}),
      stats: {
        totalNotes: notes.length,
        totalLinks,
        brokenLinks,
        orphanNotes,
      },
    };
  }
}
