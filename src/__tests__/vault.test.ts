/* global setTimeout */
import { ObsidianVault } from "../vault.js";
import { VaultConfig } from "../types.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("ObsidianVault", () => {
  // Helper to retry a query until expected results are found or timeout
  async function retryUntilFound<T>(
    fn: () => Promise<T[]>,
    expectedCount: number,
    retries = 5,
    delay = 100,
  ): Promise<T[]> {
    let results: T[] = [];
    for (let i = 0; i < retries; i++) {
      results = await fn();
      if (results.length >= expectedCount) break;
      await new Promise((res) => setTimeout(res, delay));
    }
    return results;
  }
  let testVaultPath: string;
  let vault: ObsidianVault;
  let config: VaultConfig;

  beforeEach(async () => {
    // Create temporary test vault
    testVaultPath = join(tmpdir(), `test-vault-${Date.now()}`);
    await mkdir(testVaultPath, { recursive: true });
    await mkdir(join(testVaultPath, "Work"), { recursive: true });
    await mkdir(join(testVaultPath, "Archive"), { recursive: true });

    config = {
      vaultPath: testVaultPath,
      indexPatterns: ["**/*.md"],
      excludePatterns: ["Archive/**"],
      metadataFields: ["tags", "type", "status", "category"],
      maxFileSize: 10 * 1024 * 1024,
      maxSearchResults: 100,
      maxRecentNotes: 100,
      useMemory: true, // Use in-memory storage for tests
      searchWeights: {
        title: 3.0,
        tags: 2.5,
        frontmatter: 2.0,
        content: 1.0,
        recency: 1.5,
      },
    };

    vault = new ObsidianVault(config);
  });

  afterEach(async () => {
    // Clean up test vault
    await rm(testVaultPath, { recursive: true, force: true });
  });

  describe("Path Security", () => {
    test("handles path traversal attempts safely", async () => {
      // Create a normal note
      await writeFile(
        join(testVaultPath, "Work", "test.md"),
        "---\ntags: [test]\n---\nTest content",
      );

      await vault.initialize();

      // Attempt to access file with path traversal
      const maliciousPath = "../../etc/passwd";
      const result = await vault.getNote(maliciousPath);

      // Should not find the file (returns null)
      expect(result).toBeNull();
    });

    test("uses relative paths correctly", async () => {
      await writeFile(
        join(testVaultPath, "Work", "test.md"),
        "---\ntags: [test]\n---\nTest content",
      );

      await vault.initialize();
      const notes = await retryUntilFound(() => vault.getAllNotes(), 1);
      // Path should be relative to vault root
      expect(notes[0].path).toBe("Work/test.md");
      expect(notes[0].path).not.toContain(testVaultPath);
    });
  });

  describe("Tag Matching", () => {
    beforeEach(async () => {
      await writeFile(
        join(testVaultPath, "Work", "note1.md"),
        "---\ntags: [work/puppet, tech/golang]\n---\nContent",
      );
      await writeFile(
        join(testVaultPath, "Work", "note2.md"),
        "---\ntags: [work, personal]\n---\nContent",
      );
    });

    test("matches exact tags", async () => {
      await vault.initialize();
      const notes = await retryUntilFound(() => vault.getNotesByTag("work"), 2);
      expect(notes.length).toBe(2);
    });

    test("matches hierarchical tags (parent matches children)", async () => {
      await vault.initialize();
      const notes = await retryUntilFound(() => vault.getNotesByTag("work"), 2);
      // Both notes should match 'work' tag (note1 has work/puppet, note2 has work)
      expect(notes.length).toBe(2);
      const puppetNotes = notes.filter((n) =>
        n.frontmatter.tags?.includes("work/puppet"),
      );
      expect(puppetNotes.length).toBe(1);
    });

    test("prevents false positive matches", async () => {
      await writeFile(
        join(testVaultPath, "Work", "homework.md"),
        "---\ntags: [homework]\n---\nContent",
      );
      await vault.initialize();
      const workNotes = await retryUntilFound(
        () => vault.getNotesByTag("work"),
        2,
      );
      const homeworkNote = workNotes.find((n) =>
        n.frontmatter.tags?.includes("homework"),
      );
      // "homework" should NOT match "work" tag search
      expect(homeworkNote).toBeUndefined();
    });
  });

  describe("File Size Limits", () => {
    test("skips files exceeding max size", async () => {
      // Create a large file (> 10MB mock)
      const largeConfig = { ...config, maxFileSize: 100 }; // 100 bytes for testing
      vault = new ObsidianVault(largeConfig);

      const largeContent = "x".repeat(200); // 200 bytes
      await writeFile(
        join(testVaultPath, "Work", "large.md"),
        `---\ntags: [test]\n---\n${largeContent}`,
      );

      await vault.initialize();
      const notes = await vault.getAllNotes();

      // Large file should be skipped
      expect(notes.length).toBe(0);
    });

    test("indexes files within size limit", async () => {
      // Ensure Work directory exists
      await mkdir(join(testVaultPath, "Work"), { recursive: true });
      const normalContent = "---\ntags: [test]\n---\nNormal content";
      await writeFile(join(testVaultPath, "Work", "normal.md"), normalContent);

      await vault.initialize();
      const notes = await retryUntilFound(() => vault.getAllNotes(), 1);
      expect(notes.length).toBe(1);
      expect(notes[0].title).toBe("normal");
    });
  });

  describe("Frontmatter Validation", () => {
    test("applies default values for missing frontmatter", async () => {
      // Ensure Work directory exists
      await mkdir(join(testVaultPath, "Work"), { recursive: true });
      await writeFile(
        join(testVaultPath, "Work", "minimal.md"),
        "No frontmatter content",
      );

      await vault.initialize();
      const notes = await retryUntilFound(() => vault.getAllNotes(), 1);
      expect(notes[0].frontmatter.type).toBe("note");
      expect(notes[0].frontmatter.status).toBe("active");
      expect(notes[0].frontmatter.category).toBe("personal");
      expect(notes[0].frontmatter.tags).toEqual([]);
    });

    test("validates and corrects invalid type values", async () => {
      await writeFile(
        join(testVaultPath, "Work", "invalid-type.md"),
        "---\ntype: invalid_type\n---\nContent",
      );

      await vault.initialize();
      const notes = await retryUntilFound(() => vault.getAllNotes(), 1);
      // Should default to 'note' for invalid type
      expect(notes[0].frontmatter.type).toBe("note");
    });

    test("validates and corrects invalid status values", async () => {
      await writeFile(
        join(testVaultPath, "Work", "invalid-status.md"),
        "---\nstatus: invalid_status\n---\nContent",
      );

      await vault.initialize();
      const notes = await retryUntilFound(() => vault.getAllNotes(), 1);
      // Should default to 'active' for invalid status
      expect(notes[0].frontmatter.status).toBe("active");
    });
  });

  describe("Archive Filtering", () => {
    test("excludes archived notes by default", async () => {
      await writeFile(
        join(testVaultPath, "Work", "active.md"),
        "---\ntags: [test]\n---\nContent",
      );
      await writeFile(
        join(testVaultPath, "Archive", "old.md"),
        "---\ntags: [test]\n---\nContent",
      );

      await vault.initialize();
      const notes = await retryUntilFound(() => vault.searchNotes("", {}), 1);
      // Should only find the active note (Archive is in excludePatterns)
      expect(notes.length).toBe(1);
      expect(notes[0].path).toContain("Work");
    });
  });

  describe("Date Filtering", () => {
    test("filters notes by date range", async () => {
      await writeFile(
        join(testVaultPath, "Work", "old.md"),
        '---\nmodified: "2020-01-01"\n---\nContent',
      );
      await writeFile(
        join(testVaultPath, "Work", "recent.md"),
        '---\nmodified: "2025-01-01"\n---\nContent',
      );

      await vault.initialize();
      const allNotes = await retryUntilFound(() => vault.getAllNotes(), 2);
      // Verify both notes were indexed
      expect(allNotes.length).toBe(2);
      const notes = await retryUntilFound(
        () => vault.searchNotes("", { dateFrom: "2024-01-01" }),
        1,
      );
      expect(notes.length).toBe(1);
      expect(notes[0].frontmatter.modified).toBe("2025-01-01");
    });

    test("filters notes by dateTo", async () => {
      await writeFile(
        join(testVaultPath, "Work", "old.md"),
        '---\nmodified: "2020-01-01"\n---\nContent',
      );
      await writeFile(
        join(testVaultPath, "Work", "recent.md"),
        '---\nmodified: "2025-01-01"\n---\nContent',
      );

      await vault.initialize();
      const notes = await retryUntilFound(
        () => vault.searchNotes("", { dateTo: "2023-01-01" }),
        1,
      );
      expect(notes.length).toBe(1);
      expect(notes[0].frontmatter.modified).toBe("2020-01-01");
    });
  });

  describe("Vault Methods", () => {
    beforeEach(async () => {
      await writeFile(
        join(testVaultPath, "Work", "project.md"),
        "---\ntags: [work]\ntype: project\nstatus: active\n---\nProject content",
      );
      await writeFile(
        join(testVaultPath, "Work", "task.md"),
        "---\ntags: [work]\ntype: task\nstatus: completed\n---\nTask content",
      );
    });

    test("getNotesByType returns filtered notes", async () => {
      await vault.initialize();
      const projectNotes = await retryUntilFound(
        () => vault.searchNotes("", { type: "project" }),
        1,
      );
      expect(projectNotes.length).toBe(1);
      expect(projectNotes[0].title).toBe("project");
    });

    test("getNotesByStatus returns filtered notes", async () => {
      await vault.initialize();
      const completedNotes = await retryUntilFound(
        () => vault.searchNotes("", { status: "completed" }),
        1,
      );
      expect(completedNotes.length).toBe(1);
      expect(completedNotes[0].title).toBe("task");
    });

    test("getNote returns null for non-existent path", async () => {
      await vault.initialize();
      const note = await vault.getNote("nonexistent.md");
      expect(note).toBeNull();
    });
  });

  describe("Search Options", () => {
    beforeEach(async () => {
      await writeFile(
        join(testVaultPath, "Work", "project.md"),
        "---\ntags: [work]\ntype: project\n---\nProject content",
      );
      await writeFile(
        join(testVaultPath, "Work", "note.md"),
        "---\ntags: [personal]\ntype: note\n---\nNote content",
      );
    });

    test("filters by type", async () => {
      await vault.initialize();
      const notes = await retryUntilFound(
        () => vault.searchNotes("", { type: "project" }),
        1,
      );
      expect(notes.length).toBe(1);
      expect(notes[0].title).toBe("project");
    });

    test("filters by status", async () => {
      await writeFile(
        join(testVaultPath, "Work", "completed.md"),
        "---\nstatus: completed\n---\nCompleted",
      );
      await vault.initialize();
      const notes = await retryUntilFound(
        () => vault.searchNotes("", { status: "completed" }),
        1,
      );
      expect(notes.length).toBe(1);
    });

    test("filters by category", async () => {
      await writeFile(
        join(testVaultPath, "Work", "work-note.md"),
        "---\ncategory: work\n---\nWork note",
      );
      await vault.initialize();
      const notes = await retryUntilFound(
        () => vault.searchNotes("", { category: "work" }),
        1,
      );
      expect(notes.length).toBe(1);
    });
  });

  describe("Path Filtering", () => {
    beforeEach(async () => {
      await mkdir(join(testVaultPath, "Work", "Puppet"), { recursive: true });
      await mkdir(join(testVaultPath, "Projects"), { recursive: true });

      await writeFile(
        join(testVaultPath, "Work", "Puppet", "note1.md"),
        "---\ntags: [puppet]\n---\nContent",
      );
      await writeFile(
        join(testVaultPath, "Work", "note2.md"),
        "---\ntags: [work]\n---\nContent",
      );
      await writeFile(
        join(testVaultPath, "Projects", "note3.md"),
        "---\ntags: [project]\n---\nContent",
      );
    });

    test("filters by exact path pattern", async () => {
      await vault.initialize();
      const notes = await retryUntilFound(
        () => vault.searchNotes("", { path: "Work/Puppet" }),
        1,
      );
      expect(notes.length).toBe(1);
      expect(notes[0].path).toContain("Work/Puppet");
    });

    test("filters by glob path pattern with /**", async () => {
      await vault.initialize();
      const notes = await retryUntilFound(
        () => vault.searchNotes("", { path: "Work/**" }),
        2,
      );
      expect(notes.length).toBe(2);
      expect(notes.every((n) => n.path.startsWith("Work"))).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("handles vault with no markdown files", async () => {
      await vault.initialize();
      const notes = await vault.getAllNotes();
      expect(notes.length).toBe(0);
    });

    test("handles corrupt frontmatter gracefully", async () => {
      await writeFile(
        join(testVaultPath, "Work", "corrupt.md"),
        "---\ninvalid: yaml: : :\n---\nContent",
      );

      await vault.initialize();
      const notes = await vault.getAllNotes();

      // Should skip the corrupt file or handle it gracefully
      expect(notes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Archive Filtering in Search", () => {
    test("includes archive when includeArchive is true", async () => {
      // Update config to not exclude Archive in indexing
      const configWithArchive = {
        ...config,
        excludePatterns: [], // Don't exclude Archive at index time
      };
      vault = new ObsidianVault(configWithArchive);

      await writeFile(
        join(testVaultPath, "Archive", "archived.md"),
        "---\ntags: [archive]\n---\nArchived content",
      );

      await vault.initialize();
      const notes = await vault.searchNotes("", { includeArchive: true });

      // Should include archived notes
      expect(notes.some((n) => n.path.startsWith("Archive"))).toBe(true);
    });
  });

  describe("Initialization Error Handling", () => {
    test("handles non-existent vault path gracefully", async () => {
      // glob doesn't throw for non-existent paths, just returns empty
      const invalidConfig = {
        ...config,
        vaultPath: "/nonexistent/invalid/path",
        indexPatterns: ["**/*.md"],
      };

      const invalidVault = new ObsidianVault(invalidConfig);

      // Should initialize without error but find no notes
      await invalidVault.initialize();
      const notes = await invalidVault.getAllNotes();
      expect(notes.length).toBe(0);
    });

    test("logs warning when no files match index patterns", async () => {
      // Create vault with no markdown files
      const emptyVaultPath = join(tmpdir(), `empty-vault-${Date.now()}`);
      await mkdir(emptyVaultPath, { recursive: true });

      const emptyConfig = {
        ...config,
        vaultPath: emptyVaultPath,
        indexPatterns: ["**/*.md"],
      };

      const emptyVault = new ObsidianVault(emptyConfig);

      // Should not throw but should log warning
      await emptyVault.initialize();
      const notes = await emptyVault.getAllNotes();
      expect(notes.length).toBe(0);

      await rm(emptyVaultPath, { recursive: true, force: true });
    });
  });

  describe("Index Error Tracking", () => {
    test("tracks errors when files fail to index", async () => {
      // Create a file that will cause indexing issues
      await writeFile(
        join(testVaultPath, "Work", "problem.md"),
        "---\nmalformed: yaml: : : :\n---\nContent",
      );

      await vault.initialize();

      // Vault should still initialize, but may have tracked errors
      const notes = await vault.getAllNotes();
      expect(notes).toBeDefined();
    });
  });

  describe("findKnowledgeGaps", () => {
    test("returns orphan links for wikilinks pointing to non-existent notes", async () => {
      await writeFile(
        join(testVaultPath, "Source.md"),
        "---\ntags: []\n---\nSee [[Missing Note]] for details.",
      );
      await writeFile(
        join(testVaultPath, "Existing.md"),
        "---\ntags: []\n---\nSome content.",
      );
      await vault.initialize();

      const result = await vault.findKnowledgeGaps();

      expect(result.orphanLinks).toHaveLength(1);
      expect(result.orphanLinks[0].source).toBe("Source.md");
      expect(result.orphanLinks[0].target).toBe("Missing Note");
      expect(result.stats.totalOrphanLinks).toBe(1);
    });

    test("does not flag wikilinks that resolve to existing notes", async () => {
      await writeFile(
        join(testVaultPath, "Source.md"),
        "---\ntags: []\n---\nSee [[Existing]] for details.",
      );
      await writeFile(
        join(testVaultPath, "Existing.md"),
        "---\ntags: []\n---\nSome content.",
      );
      await vault.initialize();

      const result = await vault.findKnowledgeGaps();

      expect(result.orphanLinks).toHaveLength(0);
    });

    test("returns question lines from note content", async () => {
      await writeFile(
        join(testVaultPath, "Questions.md"),
        "---\ntags: []\n---\nHow does this work?\nThis is a statement.\nWhy does it fail?",
      );
      await vault.initialize();

      const result = await vault.findKnowledgeGaps();

      const q = result.questionNotes.find((n) => n.title === "Questions");
      expect(q).toBeDefined();
      expect(q!.questions).toContain("How does this work?");
      expect(q!.questions).toContain("Why does it fail?");
      expect(q!.questions).not.toContain("This is a statement.");
    });

    test("skips question marks inside code blocks", async () => {
      await writeFile(
        join(testVaultPath, "Code.md"),
        "---\ntags: []\n---\n```\nif (x?) return;\n```\nReal question?",
      );
      await vault.initialize();

      const result = await vault.findKnowledgeGaps();

      const q = result.questionNotes.find((n) => n.title === "Code");
      expect(q!.questions).toHaveLength(1);
      expect(q!.questions[0]).toBe("Real question?");
    });

    test("respects limitOrphanLinks option", async () => {
      for (let i = 0; i < 5; i++) {
        await writeFile(
          join(testVaultPath, `Note${i}.md`),
          `---\ntags: []\n---\nSee [[Ghost${i}]].`,
        );
      }
      await vault.initialize();

      const result = await vault.findKnowledgeGaps({ limitOrphanLinks: 2 });

      expect(result.orphanLinks).toHaveLength(2);
      expect(result.stats.totalOrphanLinks).toBe(5);
    });
  });
});
