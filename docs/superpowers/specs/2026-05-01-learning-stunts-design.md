# Design: Learning Stunts — Vault Intelligence Tools

**Date:** 2026-05-01  
**Issue:** [#11 — Can it pull "learning stunts"?](https://github.com/CoMfUcIoS/obsidian-mcp-sb/issues/11)  
**Status:** Approved

## Summary

Add four read-only MCP tools that enable vault-wide intelligence operations the AI cannot perform without file system access. All tools are computed from the in-memory note index at call time. No writes. No new dependencies. No storage layer changes.

## Scope

**In:** `find_knowledge_gaps`, `get_notes_for_review`, `find_related_notes`, `get_vault_graph`  
**Out:** Write tools (separate issue), argumentation type system, confidence scoring, spaced-repetition decay math

## Files Changed

- `src/vault.ts` — 4 new public methods
- `src/index.ts` — 4 tool definitions + switch case handlers

## Shared Utility

Wikilink extraction regex, reused across all tools that parse note content:

```
/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
```

Extracts the target note name from `[[Target]]` and `[[Target|Display Text]]`.

---

## Tool 1: `find_knowledge_gaps`

### Purpose

Scan the entire vault for structural holes: links pointing at notes that don't exist, and notes containing unanswered questions. Vault-wide — impossible to compute without reading every file.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "limitOrphanLinks": {
      "type": "number",
      "description": "Max orphan link results (default: 50)",
      "default": 50
    },
    "limitQuestionNotes": {
      "type": "number",
      "description": "Max question note results (default: 20)",
      "default": 20
    }
  }
}
```

### Output Shape

```json
{
  "orphanLinks": [
    { "source": "Work/Meetings/2025-01-10.md", "target": "Projects/Alpha" }
  ],
  "questionNotes": [
    {
      "path": "Knowledge/Golang/Concurrency.md",
      "title": "Concurrency",
      "questions": ["How does the scheduler handle blocking syscalls?"]
    }
  ],
  "stats": {
    "totalOrphanLinks": 14,
    "totalQuestionNotes": 7
  }
}
```

### Implementation Notes

- Build a `Set<string>` of all note titles (filename without `.md`) from `getAllNotes()`
- Scan each note's `content` for wikilinks; check each target against the set
- Question lines: split content by newline, keep lines matching `/\?\s*$/` after stripping markdown syntax (headers, bullets, blockquotes)
- Skip code blocks when extracting question lines

---

## Tool 2: `get_notes_for_review`

### Purpose

Return notes not modified in N days, sorted by inbound link count (importance proxy). Implements spaced-repetition surfacing without any convention requirements from the user.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "daysSinceModified": {
      "type": "number",
      "description": "Only return notes not modified in this many days (default: 14)",
      "default": 14
    },
    "limit": {
      "type": "number",
      "description": "Max results (default: 10)",
      "default": 10
    }
  }
}
```

### Output Shape

`NoteSummary[]` extended with `daysSinceModified: number` per note.

### Implementation Notes

- Use `frontmatter.modified` parsed via existing `parseDate()`. Fallback to `frontmatter.created`. Notes with neither date are excluded.
- Compute inbound link count: for each note, count how many other notes `[[link]]` to it. Use this as sort tiebreaker (more inbound links = higher priority).
- Sort: primary = oldest first (most overdue), secondary = inbound link count descending.

---

## Tool 3: `find_related_notes`

### Purpose

Given a note, score and rank all other notes by relationship strength. Returns the top N with human-readable relationship labels so the AI can explain why each note is related.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Relative path to the source note"
    },
    "limit": {
      "type": "number",
      "description": "Max results (default: 10)",
      "default": 10
    }
  },
  "required": ["path"]
}
```

### Scoring

| Signal                                    | Points |
| ----------------------------------------- | ------ |
| Source note links to candidate            | +5     |
| Candidate links to source note            | +5     |
| Shared tag (per tag)                      | +3     |
| Shared title word (non-trivial, per word) | +1     |

### Output Shape

```json
[
  {
    "path": "Knowledge/Golang/Channels.md",
    "title": "Channels",
    "score": 13,
    "relationships": [
      "links to this note",
      "3 shared tags: golang, knowledge, concurrency"
    ]
  }
]
```

### Implementation Notes

- Extract source note's wikilinks and tags upfront
- For each candidate note: compute score, collect relationship strings
- Filter out score=0 notes
- Sort descending by score, slice to `limit`
- Title word filter: lowercase, split on non-word chars, exclude words under 4 chars

---

## Tool 4: `get_vault_graph`

### Purpose

Return the full link graph as structured data. Gives the AI vault topology it can reason over (clusters, orphans, bridge notes, broken links) without reading every file.

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "includeEdges": {
      "type": "boolean",
      "description": "Include edge list (default: true). Set false for large vaults to get node stats only.",
      "default": true
    },
    "orphansOnly": {
      "type": "boolean",
      "description": "Return only nodes with no inbound or outbound links (default: false)",
      "default": false
    }
  }
}
```

### Output Shape

```json
{
  "nodes": [
    {
      "path": "Work/Projects/Alpha.md",
      "title": "Alpha",
      "inLinks": 3,
      "outLinks": 2,
      "tagCount": 4
    }
  ],
  "edges": [
    {
      "source": "Work/Projects/Alpha.md",
      "target": "Knowledge/Golang/Channels.md",
      "targetExists": true
    }
  ],
  "stats": {
    "totalNotes": 240,
    "totalLinks": 612,
    "brokenLinks": 14,
    "orphanNotes": 23
  }
}
```

When `includeEdges: false`, the `edges` key is omitted.

### Implementation Notes

- Build a title→path map from all notes for O(1) target resolution
- Two passes: first pass extracts all edges, second pass computes per-node in/out counts
- `targetExists` = whether the wikilink target resolves to an indexed note
- `orphanNotes` in stats = notes with `inLinks === 0 && outLinks === 0`

---

## Testing

Each tool gets unit tests in `src/__tests__/`:

- `find_knowledge_gaps`: fixture vault with known broken links and question lines
- `get_notes_for_review`: notes with varied `modified` dates including edge cases (no date, today, 100 days ago)
- `find_related_notes`: notes with overlapping tags and cross-links; verify score calculation
- `get_vault_graph`: small graph with known orphans and broken links; verify stats
