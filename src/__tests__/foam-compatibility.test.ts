/* global setTimeout */
/**
 * Foam workspace compatibility tests.
 *
 * Foam (https://foambubble.github.io/foam) stores notes as plain .md files
 * with YAML frontmatter and [[wikilinks]] — the same format as Obsidian.
 * The MCP server operates on the filesystem and has no Obsidian app dependency,
 * so any Foam workspace is a valid vault path.
 *
 * These tests exercise the subset of Foam conventions most likely to diverge:
 *   - title in frontmatter instead of filename
 *   - tags as YAML array
 *   - aliased wikilinks [[target|alias]]
 *   - .vscode/ and other non-md artifacts ignored
 *   - no .obsidian/ folder present
 */
import { MarkdownVault } from "../vault.js";
import { VaultConfig } from "../types.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("Foam Compatibility", () => {
  let workspacePath: string;
  let vault: MarkdownVault;
  let config: VaultConfig;

  async function retryUntilFound<T>(
    fn: () => Promise<T[]>,
    expectedCount: number,
    retries = 5,
    delay = 100,
  ): Promise<T[]> {
    let results: T[] = [];
    for (let i = 0; i < retries; i++) {
      if (i > 0) await vault.initialize();
      results = await fn();
      if (results.length >= expectedCount) break;
      await new Promise((res) => setTimeout(res, delay));
    }
    return results;
  }

  beforeEach(async () => {
    workspacePath = join(tmpdir(), `foam-workspace-${Date.now()}`);
    await mkdir(workspacePath, { recursive: true });
    // Foam workspaces typically have .vscode/ and no .obsidian/
    await mkdir(join(workspacePath, ".vscode"), { recursive: true });
    await mkdir(join(workspacePath, "notes"), { recursive: true });
    await mkdir(join(workspacePath, "journal"), { recursive: true });

    config = {
      vaultPath: workspacePath,
      indexPatterns: ["**/*.md"],
      excludePatterns: [".vscode/**", ".obsidian/**"],
      metadataFields: ["tags", "type", "status", "category"],
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
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  test("indexes .md files without .obsidian/ folder present", async () => {
    await writeFile(
      join(workspacePath, "notes", "hello.md"),
      "---\ntitle: Hello World\ntags: [foam]\n---\nHello from Foam.",
    );

    await vault.initialize();
    const notes = await retryUntilFound(() => vault.getAllNotes(), 1);

    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe("hello");
  });

  test("ignores .vscode/ workspace files", async () => {
    await writeFile(
      join(workspacePath, ".vscode", "settings.json"),
      '{"foam.files.ignore":["**/.obsidian/**"]}',
    );
    await writeFile(
      join(workspacePath, "notes", "actual-note.md"),
      "---\ntags: [test]\n---\nContent.",
    );

    await vault.initialize();
    const notes = await retryUntilFound(() => vault.getAllNotes(), 1);

    expect(notes.length).toBe(1);
    expect(notes[0].path).toContain("notes");
  });

  test("handles Foam-style frontmatter (title + array tags)", async () => {
    await writeFile(
      join(workspacePath, "notes", "my-note.md"),
      [
        "---",
        "title: My Foam Note",
        "tags:",
        "  - golang",
        "  - work/backend",
        "date: 2024-06-01",
        "---",
        "Note body content here.",
      ].join("\n"),
    );

    await vault.initialize();
    const notes = await retryUntilFound(() => vault.getAllNotes(), 1);

    expect(notes[0].frontmatter.tags).toContain("golang");
    expect(notes[0].frontmatter.tags).toContain("work/backend");
  });

  test("resolves [[wikilinks]] between Foam notes", async () => {
    await writeFile(
      join(workspacePath, "notes", "source.md"),
      "---\ntags: []\n---\nSee [[target]] for details.",
    );
    await writeFile(
      join(workspacePath, "notes", "target.md"),
      "---\ntags: []\n---\nTarget content.",
    );

    await vault.initialize();
    const graph = await vault.getVaultGraph();

    expect(graph.stats.brokenLinks).toBe(0);
    const sourceNode = graph.nodes.find((n) => n.title === "source")!;
    const targetNode = graph.nodes.find((n) => n.title === "target")!;
    expect(sourceNode.outLinks).toBe(1);
    expect(targetNode.inLinks).toBe(1);
  });

  test("handles aliased wikilinks [[target|display text]]", async () => {
    await writeFile(
      join(workspacePath, "notes", "page-a.md"),
      "---\ntags: []\n---\nSee [[page-b|click here]].",
    );
    await writeFile(
      join(workspacePath, "notes", "page-b.md"),
      "---\ntags: []\n---\nDestination.",
    );

    await vault.initialize();
    const gaps = await vault.findKnowledgeGaps();

    // aliased link should resolve — no orphan links expected
    expect(gaps.orphanLinks).toHaveLength(0);
  });

  test("indexes notes in nested Foam folders", async () => {
    await mkdir(join(workspacePath, "notes", "projects"), { recursive: true });
    await writeFile(
      join(workspacePath, "notes", "projects", "atlas.md"),
      "---\ntags: [project]\n---\nAtlas project notes.",
    );
    await writeFile(
      join(workspacePath, "journal", "2024-06-01.md"),
      "---\ntags: [journal]\n---\nDaily note.",
    );

    await vault.initialize();
    const notes = await retryUntilFound(() => vault.getAllNotes(), 2);

    expect(notes.length).toBe(2);
    const paths = notes.map((n) => n.path);
    expect(paths).toContain("notes/projects/atlas.md");
    expect(paths).toContain("journal/2024-06-01.md");
  });

  test("handles notes with no frontmatter (plain Markdown files)", async () => {
    await writeFile(
      join(workspacePath, "notes", "plain.md"),
      "# Just a heading\n\nNo frontmatter here.",
    );

    await vault.initialize();
    const notes = await retryUntilFound(() => vault.getAllNotes(), 1);

    expect(notes[0].frontmatter.tags).toEqual([]);
    expect(notes[0].frontmatter.type).toBe("note");
    expect(notes[0].frontmatter.status).toBe("active");
  });

  test("tag hierarchy works with Foam nested tags", async () => {
    await writeFile(
      join(workspacePath, "notes", "backend.md"),
      "---\ntags: [work/backend, golang]\n---\nBackend note.",
    );
    await writeFile(
      join(workspacePath, "notes", "frontend.md"),
      "---\ntags: [work/frontend]\n---\nFrontend note.",
    );

    await vault.initialize();
    const workNotes = await retryUntilFound(
      () => vault.getNotesByTag("work"),
      2,
    );

    expect(workNotes.length).toBe(2);
  });

  test("findRelatedNotes works across Foam workspace notes", async () => {
    await writeFile(
      join(workspacePath, "notes", "rust.md"),
      "---\ntags: [rust, systems]\n---\nRust notes.",
    );
    await writeFile(
      join(workspacePath, "notes", "memory.md"),
      "---\ntags: [rust, memory]\n---\nMemory safety.",
    );
    await writeFile(
      join(workspacePath, "notes", "unrelated.md"),
      "---\ntags: [cooking]\n---\nRecipes.",
    );

    await vault.initialize();
    const related = await vault.findRelatedNotes("notes/rust.md");

    expect(related.map((n) => n.title)).toContain("memory");
    expect(related.map((n) => n.title)).not.toContain("unrelated");
  });
});
