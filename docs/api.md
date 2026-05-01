# MCP API Tools Reference

This document describes all available MCP tools, their parameters, and example usage.

## Table of Contents

- [search_notes](#1-search_notes)
- [get_note](#2-get_note)
- [get_notes_by_tag](#3-get_notes_by_tag)
- [get_recent_notes](#4-get_recent_notes)
- [list_tags](#5-list_tags)
- [summarize_notes](#6-summarize_notes)
- [find_knowledge_gaps](#7-find_knowledge_gaps)
- [get_notes_for_review](#8-get_notes_for_review)
- [find_related_notes](#9-find_related_notes)
- [get_vault_graph](#10-get_vault_graph)

## 1. `search_notes`

Search notes with optional filters.

**Parameters:**

- `query` (string, optional): Search query text
- `tags` (array, optional): Filter by tags (e.g., `["work/puppet", "golang"]`)
- `type` (enum, optional): `note`, `project`, `task`, `daily`, `meeting`
- `status` (enum, optional): `active`, `archived`, `idea`, `completed`
- `category` (enum, optional): `work`, `personal`, `knowledge`, `life`, `dailies`
- `dateFrom` (string, optional): Start date (YYYY-MM-DD format, validated)
- `dateTo` (string, optional): End date (YYYY-MM-DD format, validated)
- `path` (string, optional): Filter by directory pattern (e.g., `"Work/Puppet/**"`)
- `includeArchive` (boolean, optional): Include archived notes (default: false)
- `limit` (number, optional): Max results (default: 20, max: configurable via `maxSearchResults`)

## 2. `get_note`

Retrieve the full content of a specific note.

**Parameters:**

- `path` (string, required): Note path (e.g., `"Work/Puppet/Meeting Notes.md"`)

## 3. `get_notes_by_tag`

Get all notes with a specific tag.

**Parameters:**

- `tag` (string, required): Tag to search (e.g., `"work/puppet"`)

## 4. `get_recent_notes`

Get recently modified notes.

**Parameters:**

- `limit` (number, optional): Number of notes (default: 10, max: configurable via `maxRecentNotes`)

## 5. `list_tags`

List all unique tags across the vault.

## 6. `summarize_notes`

Generate summary statistics for notes matching criteria.

**Parameters:**

- `tags` (array, optional): Filter by tags
- `type` (enum, optional): Filter by type
- `status` (enum, optional): Filter by status
- `category` (enum, optional): Filter by category

**Returns:**

- `total`: Number of notes
- `byType`: Breakdown by type
- `byStatus`: Breakdown by status
- `byCategory`: Breakdown by category
- `recentlyModified`: 5 most recently modified notes

## 7. `find_knowledge_gaps`

Identify orphaned wikilinks (links to non-existent notes) and notes containing open questions. Useful for surfacing areas where knowledge is incomplete or under-documented.

**Parameters:**

- `limitOrphanLinks` (number, optional): Max orphan links to return (default: 50)
- `limitQuestionNotes` (number, optional): Max question notes to return (default: 20)

**Returns:**

- `orphanLinks`: Array of `{ source, target }` — wikilinks that point to notes that don't exist
- `questionNotes`: Array of `{ path, title, questions[] }` — notes containing lines that end with `?`
- `stats`: `{ totalOrphanLinks, totalQuestionNotes }`

## 8. `get_notes_for_review`

Surface notes that haven't been touched recently and may need revisiting. Prioritises notes with many inbound links (high-value nodes) over isolated ones.

**Parameters:**

- `daysSinceModified` (number, optional): Only return notes not modified in this many days (default: 30)
- `limit` (number, optional): Max results (default: 20)

**Returns:**

Array of notes with: `path`, `title`, `excerpt`, `tags`, `type`, `status`, `category`, `modified`, `daysSinceModified`

## 9. `find_related_notes`

Find notes related to a given note by shared wikilinks, shared tags, and overlapping title words. Returns a scored list ranked by relationship strength.

**Parameters:**

- `path` (string, required): Path to the source note (e.g., `"Work/Puppet/Overview.md"`)
- `limit` (number, optional): Max results (default: 10)

**Scoring:**

- +5 per shared outgoing wikilink
- +5 if the target links back to the source
- +3 per shared tag
- +1 per shared title word (≥4 characters)

**Returns:**

Array of notes with: `path`, `title`, `excerpt`, `tags`, `type`, `status`, `category`, `modified`, `score`, `relationships[]`

## 10. `get_vault_graph`

Return the full link graph of the vault — nodes, edges, and structural statistics. Useful for understanding vault topology, finding hub notes, and detecting broken links.

**Parameters:**

- `includeEdges` (boolean, optional): Include the full edge list in the response (default: false — stats only)

**Returns:**

- `nodes`: Array of `{ path, title, inLinks, outLinks, tagCount }`
- `edges` (if `includeEdges: true`): Array of `{ source, target, targetExists }`
- `stats`: `{ totalNotes, totalLinks, brokenLinks, orphanNotes }`
