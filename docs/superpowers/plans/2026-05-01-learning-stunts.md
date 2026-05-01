# Learning Stunts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four read-only vault intelligence MCP tools: `find_knowledge_gaps`, `get_notes_for_review`, `find_related_notes`, and `get_vault_graph`.

**Architecture:** All tools are pure read operations computed from `getAllNotes()` at call time. No storage layer changes, no new dependencies. Shared wikilink extraction private method on `ObsidianVault`. New return types added to `types.ts`.

**Tech Stack:** TypeScript, Jest (ESM mode via `node --experimental-vm-modules`), existing `ObsidianVault` + `IStorage` abstractions.

---

## File Map

| File                          | Change                                                                    |
| ----------------------------- | ------------------------------------------------------------------------- |
| `src/types.ts`                | Add 7 new exported interfaces                                             |
| `src/vault.ts`                | Add private `extractWikilinks` + `extractQuestionLines`, 4 public methods |
| `src/__tests__/vault.test.ts` | Add 4 new `describe` blocks, one per tool                                 |
| `src/index.ts`                | Add 4 tool definitions to `tools[]` + 4 case handlers                     |

---

## Task 1: Add New Types to `src/types.ts`

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Append the 7 new interfaces to `src/types.ts`**

Add at the end of the file:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/ioanniskarasavvaidis/Apps/Atlas/REPOS/obsidian-mcp-sb && pnpm build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add interfaces for learning stunts tools"
```

---

## Task 2: Add Private Helpers to `src/vault.ts`

**Files:**

- Modify: `src/vault.ts`

These two private methods are shared by all four new public methods. Add them before the closing `}` of the `ObsidianVault` class.

- [ ] **Step 1: Update the import in `src/vault.ts` to include the new types**

Change the existing import block (lines 5–13):

```typescript
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
} from "./types.js";
```

- [ ] **Step 2: Add `extractWikilinks` private method inside the class**

Add before the closing `}` of `ObsidianVault`:

```typescript
  private extractWikilinks(content: string): string[] {
    return Array.from(
      content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g),
      (m) => m[1].trim(),
    );
  }
```

- [ ] **Step 3: Add `extractQuestionLines` private method inside the class**

Add directly after `extractWikilinks`:

````typescript
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
````

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/vault.ts
git commit -m "feat(vault): add extractWikilinks and extractQuestionLines private helpers"
```

---

## Task 3: Implement `findKnowledgeGaps`

**Files:**

- Modify: `src/vault.ts`
- Modify: `src/__tests__/vault.test.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block at the end of the existing `describe("ObsidianVault", ...)` in `src/__tests__/vault.test.ts`:

````typescript
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
````

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --testPathPattern="vault.test" 2>&1 | grep -E "PASS|FAIL|findKnowledgeGaps"
```

Expected: FAIL — `vault.findKnowledgeGaps is not a function`

- [ ] **Step 3: Implement `findKnowledgeGaps` in `src/vault.ts`**

Add after `extractQuestionLines`, before the closing `}` of the class:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern="vault.test" 2>&1 | grep -E "PASS|FAIL|findKnowledgeGaps|✓|✗|×"
```

Expected: all `findKnowledgeGaps` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vault.ts src/__tests__/vault.test.ts
git commit -m "feat(vault): implement findKnowledgeGaps"
```

---

## Task 4: Implement `getNotesForReview`

**Files:**

- Modify: `src/vault.ts`
- Modify: `src/__tests__/vault.test.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block inside `describe("ObsidianVault", ...)`:

```typescript
describe("getNotesForReview", () => {
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  }

  test("returns notes not modified within the threshold", async () => {
    await writeFile(
      join(testVaultPath, "Old.md"),
      `---\nmodified: "${daysAgo(30)}"\ntags: []\n---\nOld content.`,
    );
    await writeFile(
      join(testVaultPath, "Recent.md"),
      `---\nmodified: "${daysAgo(3)}"\ntags: []\n---\nRecent content.`,
    );
    await vault.initialize();

    const result = await vault.getNotesForReview({ daysSinceModified: 14 });

    expect(result.map((n) => n.title)).toContain("Old");
    expect(result.map((n) => n.title)).not.toContain("Recent");
  });

  test("includes daysSinceModified on each result", async () => {
    await writeFile(
      join(testVaultPath, "OldNote.md"),
      `---\nmodified: "${daysAgo(20)}"\ntags: []\n---\nContent.`,
    );
    await vault.initialize();

    const result = await vault.getNotesForReview({ daysSinceModified: 14 });

    expect(result[0].daysSinceModified).toBeGreaterThanOrEqual(20);
  });

  test("excludes notes with no date", async () => {
    await writeFile(
      join(testVaultPath, "NoDate.md"),
      "---\ntags: []\n---\nNo date.",
    );
    await vault.initialize();

    const result = await vault.getNotesForReview({ daysSinceModified: 0 });

    expect(result.map((n) => n.title)).not.toContain("NoDate");
  });

  test("respects limit option", async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(
        join(testVaultPath, `Old${i}.md`),
        `---\nmodified: "${daysAgo(30 + i)}"\ntags: []\n---\nContent.`,
      );
    }
    await vault.initialize();

    const result = await vault.getNotesForReview({
      daysSinceModified: 14,
      limit: 3,
    });

    expect(result).toHaveLength(3);
  });

  test("sorts by most overdue first", async () => {
    await writeFile(
      join(testVaultPath, "VeryOld.md"),
      `---\nmodified: "${daysAgo(60)}"\ntags: []\n---\nContent.`,
    );
    await writeFile(
      join(testVaultPath, "SlightlyOld.md"),
      `---\nmodified: "${daysAgo(20)}"\ntags: []\n---\nContent.`,
    );
    await vault.initialize();

    const result = await vault.getNotesForReview({ daysSinceModified: 14 });

    expect(result[0].title).toBe("VeryOld");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --testPathPattern="vault.test" 2>&1 | grep -E "PASS|FAIL|getNotesForReview"
```

Expected: FAIL — `vault.getNotesForReview is not a function`

- [ ] **Step 3: Implement `getNotesForReview` in `src/vault.ts`**

Add after `findKnowledgeGaps`:

```typescript
  async getNotesForReview(
    options: { daysSinceModified?: number; limit?: number } = {},
  ): Promise<ReviewNote[]> {
    const { daysSinceModified = 14, limit = 10 } = options;
    const notes = await this.storage.getAllNotes();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - daysSinceModified);

    // Build inbound link counts for importance sorting
    const inboundCount = new Map<string, number>(
      notes.map((n) => [n.path, 0]),
    );
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

      const diffDays = Math.floor(
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
      return (
        (inboundCount.get(b.path) || 0) - (inboundCount.get(a.path) || 0)
      );
    });

    return candidates.slice(0, limit);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern="vault.test" 2>&1 | grep -E "PASS|FAIL|getNotesForReview|✓|✗|×"
```

Expected: all `getNotesForReview` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vault.ts src/__tests__/vault.test.ts
git commit -m "feat(vault): implement getNotesForReview"
```

---

## Task 5: Implement `findRelatedNotes`

**Files:**

- Modify: `src/vault.ts`
- Modify: `src/__tests__/vault.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe("findRelatedNotes", () => {
  test("returns empty array for unknown path", async () => {
    await writeFile(
      join(testVaultPath, "A.md"),
      "---\ntags: []\n---\nContent.",
    );
    await vault.initialize();

    const result = await vault.findRelatedNotes("does-not-exist.md");

    expect(result).toHaveLength(0);
  });

  test("scores notes that the source links to", async () => {
    await writeFile(
      join(testVaultPath, "Source.md"),
      "---\ntags: []\n---\nSee [[Target]].",
    );
    await writeFile(
      join(testVaultPath, "Target.md"),
      "---\ntags: []\n---\nTarget content.",
    );
    await writeFile(
      join(testVaultPath, "Unrelated.md"),
      "---\ntags: []\n---\nNo links.",
    );
    await vault.initialize();

    const result = await vault.findRelatedNotes("Source.md");

    expect(result.map((n) => n.title)).toContain("Target");
    expect(
      result.find((n) => n.title === "Target")!.score,
    ).toBeGreaterThanOrEqual(5);
  });

  test("scores notes that link back to source", async () => {
    await writeFile(
      join(testVaultPath, "Source.md"),
      "---\ntags: []\n---\nContent.",
    );
    await writeFile(
      join(testVaultPath, "Linker.md"),
      "---\ntags: []\n---\nSee [[Source]].",
    );
    await vault.initialize();

    const result = await vault.findRelatedNotes("Source.md");

    const linker = result.find((n) => n.title === "Linker");
    expect(linker).toBeDefined();
    expect(linker!.score).toBeGreaterThanOrEqual(5);
    expect(linker!.relationships).toContain("links to this note");
  });

  test("scores notes by shared tags", async () => {
    await writeFile(
      join(testVaultPath, "Source.md"),
      "---\ntags: [golang, work]\n---\nContent.",
    );
    await writeFile(
      join(testVaultPath, "SameTags.md"),
      "---\ntags: [golang, work]\n---\nOther content.",
    );
    await vault.initialize();

    const result = await vault.findRelatedNotes("Source.md");

    const match = result.find((n) => n.title === "SameTags");
    expect(match).toBeDefined();
    expect(match!.score).toBe(6); // 2 shared tags × 3
  });

  test("excludes source note from results", async () => {
    await writeFile(
      join(testVaultPath, "Source.md"),
      "---\ntags: [golang]\n---\nContent.",
    );
    await vault.initialize();

    const result = await vault.findRelatedNotes("Source.md");

    expect(result.map((n) => n.path)).not.toContain("Source.md");
  });

  test("respects limit option", async () => {
    await writeFile(
      join(testVaultPath, "Source.md"),
      "---\ntags: [golang]\n---\nContent.",
    );
    for (let i = 0; i < 5; i++) {
      await writeFile(
        join(testVaultPath, `Related${i}.md`),
        `---\ntags: [golang]\n---\nContent.`,
      );
    }
    await vault.initialize();

    const result = await vault.findRelatedNotes("Source.md", { limit: 2 });

    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --testPathPattern="vault.test" 2>&1 | grep -E "PASS|FAIL|findRelatedNotes"
```

Expected: FAIL — `vault.findRelatedNotes is not a function`

- [ ] **Step 3: Implement `findRelatedNotes` in `src/vault.ts`**

Add after `getNotesForReview`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern="vault.test" 2>&1 | grep -E "PASS|FAIL|findRelatedNotes|✓|✗|×"
```

Expected: all `findRelatedNotes` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vault.ts src/__tests__/vault.test.ts
git commit -m "feat(vault): implement findRelatedNotes"
```

---

## Task 6: Implement `getVaultGraph`

**Files:**

- Modify: `src/vault.ts`
- Modify: `src/__tests__/vault.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe("getVaultGraph", () => {
  test("returns all notes as nodes", async () => {
    await writeFile(
      join(testVaultPath, "A.md"),
      "---\ntags: []\n---\nContent.",
    );
    await writeFile(
      join(testVaultPath, "B.md"),
      "---\ntags: []\n---\nContent.",
    );
    await vault.initialize();

    const result = await vault.getVaultGraph();

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map((n) => n.title)).toEqual(
      expect.arrayContaining(["A", "B"]),
    );
  });

  test("counts inbound and outbound links per node", async () => {
    await writeFile(
      join(testVaultPath, "A.md"),
      "---\ntags: []\n---\nSee [[B]].",
    );
    await writeFile(
      join(testVaultPath, "B.md"),
      "---\ntags: []\n---\nContent.",
    );
    await vault.initialize();

    const result = await vault.getVaultGraph();

    const nodeA = result.nodes.find((n) => n.title === "A")!;
    const nodeB = result.nodes.find((n) => n.title === "B")!;
    expect(nodeA.outLinks).toBe(1);
    expect(nodeB.inLinks).toBe(1);
  });

  test("includes edges when includeEdges is true", async () => {
    await writeFile(
      join(testVaultPath, "A.md"),
      "---\ntags: []\n---\nSee [[B]].",
    );
    await writeFile(
      join(testVaultPath, "B.md"),
      "---\ntags: []\n---\nContent.",
    );
    await vault.initialize();

    const result = await vault.getVaultGraph({ includeEdges: true });

    expect(result.edges).toBeDefined();
    expect(result.edges).toHaveLength(1);
    expect(result.edges![0]).toMatchObject({
      source: "A.md",
      target: "B",
      targetExists: true,
    });
  });

  test("omits edges when includeEdges is false", async () => {
    await writeFile(
      join(testVaultPath, "A.md"),
      "---\ntags: []\n---\nSee [[B]].",
    );
    await writeFile(
      join(testVaultPath, "B.md"),
      "---\ntags: []\n---\nContent.",
    );
    await vault.initialize();

    const result = await vault.getVaultGraph({ includeEdges: false });

    expect(result.edges).toBeUndefined();
  });

  test("flags broken links in edges and stats", async () => {
    await writeFile(
      join(testVaultPath, "A.md"),
      "---\ntags: []\n---\nSee [[Ghost]].",
    );
    await vault.initialize();

    const result = await vault.getVaultGraph();

    expect(result.stats.brokenLinks).toBe(1);
    const edge = result.edges!.find((e) => e.target === "Ghost");
    expect(edge!.targetExists).toBe(false);
  });

  test("counts orphan notes in stats", async () => {
    await writeFile(
      join(testVaultPath, "Linked.md"),
      "---\ntags: []\n---\nSee [[Linked]].",
    );
    await writeFile(
      join(testVaultPath, "Orphan.md"),
      "---\ntags: []\n---\nNo links.",
    );
    await vault.initialize();

    const result = await vault.getVaultGraph();

    expect(result.stats.orphanNotes).toBe(1);
  });

  test("filters to orphan nodes when orphansOnly is true", async () => {
    await writeFile(
      join(testVaultPath, "Linked.md"),
      "---\ntags: []\n---\nSee [[Linked]].",
    );
    await writeFile(
      join(testVaultPath, "Orphan.md"),
      "---\ntags: []\n---\nNo links.",
    );
    await vault.initialize();

    const result = await vault.getVaultGraph({ orphansOnly: true });

    expect(result.nodes.map((n) => n.title)).toEqual(["Orphan"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --testPathPattern="vault.test" 2>&1 | grep -E "PASS|FAIL|getVaultGraph"
```

Expected: FAIL — `vault.getVaultGraph is not a function`

- [ ] **Step 3: Implement `getVaultGraph` in `src/vault.ts`**

Add after `findRelatedNotes`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern="vault.test" 2>&1 | grep -E "PASS|FAIL|getVaultGraph|✓|✗|×"
```

Expected: all `getVaultGraph` tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test 2>&1 | tail -20
```

Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add src/vault.ts src/__tests__/vault.test.ts
git commit -m "feat(vault): implement getVaultGraph"
```

---

## Task 7: Wire Tools into `src/index.ts`

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Add the 4 tool definitions to the `tools` array**

Add after the `summarize_notes` tool definition (before the closing `]`):

```typescript
  {
    name: 'find_knowledge_gaps',
    description: 'Scan the vault for structural gaps: wikilinks pointing to non-existent notes and notes containing unanswered questions',
    inputSchema: {
      type: 'object',
      properties: {
        limitOrphanLinks: {
          type: 'number',
          description: 'Max orphan link results to return (default: 50)',
          default: 50
        },
        limitQuestionNotes: {
          type: 'number',
          description: 'Max question note results to return (default: 20)',
          default: 20
        }
      }
    }
  },
  {
    name: 'get_notes_for_review',
    description: 'Return notes not modified in N days, sorted by importance (inbound link count). Useful for spaced-repetition review.',
    inputSchema: {
      type: 'object',
      properties: {
        daysSinceModified: {
          type: 'number',
          description: 'Only return notes not modified in this many days (default: 14)',
          default: 14
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10)',
          default: 10
        }
      }
    }
  },
  {
    name: 'find_related_notes',
    description: 'Given a note path, return the most related notes scored by shared tags, wikilinks, and title words',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the source note (e.g., "Work/Projects/Alpha.md")'
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10)',
          default: 10
        }
      },
      required: ['path']
    }
  },
  {
    name: 'get_vault_graph',
    description: 'Return the full vault link graph as structured data: nodes (notes) with link counts, edges (wikilinks), and graph statistics',
    inputSchema: {
      type: 'object',
      properties: {
        includeEdges: {
          type: 'boolean',
          description: 'Include the full edge list (default: true). Set false for large vaults to get node stats only.',
          default: true
        },
        orphansOnly: {
          type: 'boolean',
          description: 'Return only nodes with no inbound or outbound links (default: false)',
          default: false
        }
      }
    }
  },
```

- [ ] **Step 2: Add the 4 case handlers inside the `switch (name)` block**

Add before `default: return createErrorResponse(...)`:

```typescript
      case 'find_knowledge_gaps': {
        const limitOrphanLinks = typeof args?.limitOrphanLinks === 'number' ? args.limitOrphanLinks : undefined;
        const limitQuestionNotes = typeof args?.limitQuestionNotes === 'number' ? args.limitQuestionNotes : undefined;
        const result = await vault.findKnowledgeGaps({ limitOrphanLinks, limitQuestionNotes });
        return createSuccessResponse(result);
      }

      case 'get_notes_for_review': {
        const daysSinceModified = typeof args?.daysSinceModified === 'number' ? args.daysSinceModified : undefined;
        const limit = typeof args?.limit === 'number' ? args.limit : undefined;
        const notes = await vault.getNotesForReview({ daysSinceModified, limit });
        return createSuccessResponse(notes);
      }

      case 'find_related_notes': {
        const notePath = args?.path;
        if (!notePath || typeof notePath !== 'string') {
          return createErrorResponse('path parameter is required and must be a string');
        }
        const normalizedPath = normalize(notePath).replace(/^(\.\.(\/|\\|$))+/, '');
        const fullPath = resolve(vaultConfig.vaultPath, normalizedPath);
        if (!fullPath.startsWith(vaultConfig.vaultPath)) {
          return createErrorResponse('Access denied. Path is outside vault directory');
        }
        const limit = typeof args?.limit === 'number' ? args.limit : undefined;
        const related = await vault.findRelatedNotes(normalizedPath, { limit });
        return createSuccessResponse(related);
      }

      case 'get_vault_graph': {
        const includeEdges = typeof args?.includeEdges === 'boolean' ? args.includeEdges : undefined;
        const orphansOnly = typeof args?.orphansOnly === 'boolean' ? args.orphansOnly : undefined;
        const graph = await vault.getVaultGraph({ includeEdges, orphansOnly });
        return createSuccessResponse(graph);
      }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test 2>&1 | tail -20
```

Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): wire find_knowledge_gaps, get_notes_for_review, find_related_notes, get_vault_graph tools"
```

---

## Task 8: Close GitHub Issue

- [ ] **Step 1: Close issue #11 with a comment**

```bash
gh issue comment 11 --repo CoMfUcIoS/obsidian-mcp-sb --body "Implemented in four new read-only tools: \`find_knowledge_gaps\`, \`get_notes_for_review\`, \`find_related_notes\`, \`get_vault_graph\`. All vault-wide, no writes, no convention requirements. See docs/superpowers/specs/2026-05-01-learning-stunts-design.md for design rationale."
gh issue close 11 --repo CoMfUcIoS/obsidian-mcp-sb
```
