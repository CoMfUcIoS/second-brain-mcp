
# Development & Storage Architecture

## Table of Contents

- [Development](#development)
- [Storage Architecture](#storage-architecture)

## Development

```bash
# Install dependencies
npm install

# Watch mode (auto-rebuild on changes)
npm run watch

# Build
npm run build

# Start server
npm start

# Run tests
npm test

# Run tests with coverage
npm test:coverage

# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix
```

**Note:**
- All server logs and error messages are printed to stderr.

## Storage Architecture

The server uses **SQLite database storage by default** for efficient indexing and persistent caching:

- **Database Mode (Default):** Stores indexed notes in `.second-brain-mcp/notes.db` within your vault
  - Persistent indexing (survives server restarts)
  - Efficient for large vaults (1000+ notes)
  - Full-text search with SQLite FTS5
  - Lower memory usage

- **Memory Mode (Optional):** Use `--use-memory` flag for in-memory storage
  - Faster for small vaults (<100 notes)
  - No disk I/O overhead
  - Useful for development and testing
  - Uses Fuse.js for fuzzy search

See [`docs/architecture.mmd`](architecture.mmd) and [`docs/database-schema.mmd`](database-schema.mmd) for diagrams.
