import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { MarkdownVault } from "../vault.js";
import { VaultConfig } from "../types.js";

describe("Integration Tests - Full Workflow", () => {
  let testVaultPath: string;
  let vault: MarkdownVault;
  let config: VaultConfig;

  beforeAll(async () => {
    // Create test vault with sample notes
    testVaultPath = join(tmpdir(), `integration-vault-${Date.now()}`);
    await mkdir(testVaultPath, { recursive: true });
    await mkdir(join(testVaultPath, "Work"), { recursive: true });
    await mkdir(join(testVaultPath, "Projects"), { recursive: true });

    // Create sample notes
    await writeFile(
      join(testVaultPath, "Work", "meeting.md"),
      `---
tags: [work, meeting]
type: meeting
status: active
category: work
modified: "2025-01-15"
---

# Team Meeting

Discussion about Q1 goals and objectives.`,
    );

    await writeFile(
      join(testVaultPath, "Work", "project-alpha.md"),
      `---
tags: [work, project, alpha]
type: project
status: active
category: work
modified: "2025-01-10"
---

# Project Alpha

Important project details here.`,
    );

    await writeFile(
      join(testVaultPath, "Projects", "personal-task.md"),
      `---
tags: [personal, task]
type: task
status: completed
category: personal
modified: "2024-12-01"
---

# Personal Task

Completed personal task.`,
    );

    // Initialize vault
    config = {
      vaultPath: testVaultPath,
      indexPatterns: ["**/*.md"],
      excludePatterns: [],
      metadataFields: [
        "tags",
        "type",
        "status",
        "category",
        "created",
        "modified",
      ],
      maxFileSize: 10 * 1024 * 1024,
      maxSearchResults: 100,
      maxRecentNotes: 100,
      useMemory: true,
      searchWeights: {
        title: 3.0,
        tags: 2.5,
        frontmatter: 2.0,
        content: 1.0,
        recency: 1.5,
      },
    };

    vault = new MarkdownVault(config);
    await vault.initialize();
  }, 15000);

  afterAll(async () => {
    // Clean up test vault
    await rm(testVaultPath, { recursive: true, force: true });
  });

  describe("End-to-End Workflows", () => {
    test("complete workflow: search, filter, and retrieve", async () => {
      // Step 1: Search for work-related notes
      const workNotes = await vault.searchNotes("", { tags: ["work"] });
      expect(workNotes.length).toBe(2);

      // Step 2: Filter by type
      const meetings = await vault.searchNotes("", { type: "meeting" });
      expect(meetings.length).toBe(1);
      expect(meetings[0].title).toBe("meeting");

      // Step 3: Retrieve full note
      const fullNote = await vault.getNote(meetings[0].path);
      expect(fullNote).toBeDefined();
      expect(fullNote?.content).toContain("Team Meeting");
      expect(fullNote?.content).toContain("Q1 goals");
    });

    test("tag-based discovery workflow", async () => {
      // Step 1: List all tags
      const allNotes = await vault.getAllNotes();
      const tagSet = new Set<string>();
      allNotes.forEach((note) => {
        note.frontmatter.tags?.forEach((tag) => tagSet.add(tag));
      });
      const tags = Array.from(tagSet).sort();

      expect(tags).toContain("work");
      expect(tags).toContain("project");
      expect(tags).toContain("personal");

      // Step 2: Explore notes by tag
      const projectNotes = await vault.getNotesByTag("project");
      expect(projectNotes.length).toBe(1);
      expect(projectNotes[0].title).toBe("project-alpha");

      // Step 3: Get full content
      const projectNote = await vault.getNote(projectNotes[0].path);
      expect(projectNote?.frontmatter.tags).toContain("alpha");
    });

    test("temporal workflow: recent notes and date filtering", async () => {
      // Step 1: Get recent notes
      const recentNotes = await vault.getRecentNotes(3);
      expect(recentNotes.length).toBe(3);

      // Should be sorted by modification date (newest first)
      const dates = recentNotes.map((n) =>
        new Date(n.frontmatter.modified || "").getTime(),
      );
      expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
      expect(dates[1]).toBeGreaterThanOrEqual(dates[2]);

      // Step 2: Filter by date range
      const notes2025 = await vault.searchNotes("", {
        dateFrom: "2025-01-01",
      });
      expect(notes2025.length).toBe(2);
      expect(
        notes2025.every((n) => {
          const date = new Date(n.frontmatter.modified || "");
          return date >= new Date("2025-01-01");
        }),
      ).toBe(true);
    });

    test("status tracking workflow", async () => {
      // Step 1: Get all active items
      const activeNotes = await vault.searchNotes("", { status: "active" });
      expect(activeNotes.length).toBe(2);

      // Step 2: Get completed items
      const completedNotes = await vault.searchNotes("", { status: "completed" });
      expect(completedNotes.length).toBe(1);
      expect(completedNotes[0].title).toBe("personal-task");

      // Step 3: Summary by status
      const allNotes = await vault.searchNotes("");
      const summary = {
        byStatus: {} as Record<string, number>,
      };
      allNotes.forEach((note) => {
        if (note.frontmatter.status) {
          summary.byStatus[note.frontmatter.status] =
            (summary.byStatus[note.frontmatter.status] || 0) + 1;
        }
      });

      expect(summary.byStatus.active).toBe(2);
      expect(summary.byStatus.completed).toBe(1);
    });

    test("category-based organization workflow", async () => {
      // Step 1: Get work category notes
      const workNotes = await vault.searchNotes("", { category: "work" });
      expect(workNotes.length).toBe(2);

      // Step 2: Get personal category notes
      const personalNotes = await vault.searchNotes("", { category: "personal" });
      expect(personalNotes.length).toBe(1);

      // Step 3: Generate category summary
      const allNotes = await vault.getAllNotes();
      const categoryCount: Record<string, number> = {};
      allNotes.forEach((note) => {
        if (note.frontmatter.category) {
          categoryCount[note.frontmatter.category] =
            (categoryCount[note.frontmatter.category] || 0) + 1;
        }
      });

      expect(categoryCount.work).toBe(2);
      expect(categoryCount.personal).toBe(1);
    });

    test("multi-filter workflow", async () => {
      // Complex query: work notes that are active projects
      const results = await vault.searchNotes("", {
        tags: ["work"],
        type: "project",
        status: "active",
      });

      expect(results.length).toBe(1);
      expect(results[0].title).toBe("project-alpha");
      expect(results[0].frontmatter.tags).toContain("work");
      expect(results[0].frontmatter.type).toBe("project");
      expect(results[0].frontmatter.status).toBe("active");
    });

    test("path-based navigation workflow", async () => {
      // Step 1: Browse by directory
      const workNotes = await vault.searchNotes("", { path: "Work/**" });
      expect(workNotes.length).toBe(2);
      expect(workNotes.every((n) => n.path.startsWith("Work"))).toBe(true);

      // Step 2: Get specific subdirectory
      const projectNotes = await vault.searchNotes("", { path: "Projects/**" });
      expect(projectNotes.length).toBe(1);
      expect(projectNotes[0].path).toBe("Projects/personal-task.md");
    });

    test("fuzzy search workflow", async () => {
      // Search for content across all notes
      const alphaResults = await vault.searchNotes("alpha");
      expect(alphaResults.length).toBeGreaterThan(0);

      const meetingResults = await vault.searchNotes("meeting");
      expect(meetingResults.length).toBeGreaterThan(0);

      // Verify relevance
      expect(meetingResults.some((n) => n.title === "meeting")).toBe(true);
    });

    test("comprehensive summarization workflow", async () => {
      // Generate full vault summary
      const allNotes = await vault.searchNotes("");

      const summary = {
        total: allNotes.length,
        byType: {} as Record<string, number>,
        byStatus: {} as Record<string, number>,
        byCategory: {} as Record<string, number>,
        recentlyModified: allNotes.slice(0, 3).map((n) => ({
          title: n.title,
          path: n.path,
          modified: n.frontmatter.modified,
        })),
      };

      allNotes.forEach((note) => {
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

      expect(summary.total).toBe(3);
      expect(summary.byType.meeting).toBe(1);
      expect(summary.byType.project).toBe(1);
      expect(summary.byType.task).toBe(1);
      expect(summary.byStatus.active).toBe(2);
      expect(summary.byStatus.completed).toBe(1);
      expect(summary.recentlyModified.length).toBe(3);
    });

    test("empty search returns all notes with limit", async () => {
      const results = await vault.searchNotes("", { limit: 2 });
      expect(results.length).toBe(2);
    });

    test("hierarchical tag matching workflow", async () => {
      // Add a note with hierarchical tags
      await writeFile(
        join(testVaultPath, "Work", "puppet-task.md"),
        `---
tags: [work/puppet, devops]
type: task
status: active
category: work
---

# Puppet Configuration

Puppet-related task.`,
      );

      // Reinitialize vault to pick up new note
      vault = new MarkdownVault(config);
      await vault.initialize();

      // Parent tag should match child
      const workTagged = await vault.getNotesByTag("work");
      expect(
        workTagged.some((n) => n.frontmatter.tags?.includes("work/puppet")),
      ).toBe(true);

      // Exact match should work
      const puppetTagged = await vault.getNotesByTag("work/puppet");
      expect(puppetTagged.length).toBeGreaterThan(0);
    });

    test("note retrieval by type methods", async () => {
      // Test getNotesByType
      const meetings = await vault.searchNotes('', { type: "meeting" });
      expect(meetings.length).toBe(1);
      expect(meetings[0].frontmatter.type).toBe("meeting");

      const projects = await vault.searchNotes('', { type: "project" });
      expect(projects.length).toBe(1);
      expect(projects[0].frontmatter.type).toBe("project");

      // Test getNotesByStatus
      const active = await vault.searchNotes('', { status: "active" });
      expect(active.length).toBeGreaterThan(0);
      expect(active.every((n) => n.frontmatter.status === "active")).toBe(true);

      const completed = await vault.searchNotes('', { status: "completed" });
      expect(completed.length).toBe(1);
      expect(completed[0].frontmatter.status).toBe("completed");
    });
  });
});
