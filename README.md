# Second Brain MCP Server

A read-only MCP server for intelligent, secure access to your Obsidian vault—enabling semantic search, metadata filtering, and more for LLMs.

## Features

- **Efficient Database Storage**: SQLite-based indexing for large vaults with persistent caching
- **Memory Mode Option**: Optional in-memory indexing for small vaults or development
- **Semantic Search**: Full-text search across all notes with fuzzy matching
- **Tag-Based Filtering**: Search by hierarchical tags (e.g., `work/puppet`, `tech/golang`)
- **Path-Based Filtering**: Filter by directory patterns (e.g., `Work/Puppet/**`)
- **Temporal Queries**: Filter notes by creation/modification dates
- **Metadata Filtering**: Filter by type, status, and category
- **Note Retrieval**: Get full content of specific notes
- **Smart Summarization**: Generate summaries of note collections
- **Recent Notes**: Quick access to recently modified notes
- **Archive Control**: Optionally include archived notes in searches
- **Knowledge Gaps**: Detect orphaned wikilinks and open questions across the vault
- **Spaced Review**: Surface stale notes ranked by link importance for periodic review
- **Related Notes**: Score-based discovery of related notes via shared links, tags, and title overlap
- **Vault Graph**: Full link graph with hub detection, broken link stats, and orphan analysis
- **Security**: Path traversal protection, file size limits, input validation

## Vault Compatibility

This server works with **any directory of Markdown files** — not just Obsidian vaults. It operates purely on the filesystem and has no dependency on the Obsidian app.

| Tool                                      | Compatible | Notes                                                        |
| ----------------------------------------- | ---------- | ------------------------------------------------------------ |
| [Obsidian](https://obsidian.md)           | ✅         | Primary use case                                             |
| [Foam](https://foambubble.github.io/foam) | ✅         | Confirmed — same `.md` + `[[wikilinks]]` format              |
| [Logseq](https://logseq.com)              | ✅         | Plain `.md` files work; Logseq-specific block syntax ignored |
| [Dendron](https://www.dendron.so)         | ✅         | Hierarchical filenames index correctly                       |
| Plain Markdown directories                | ✅         | No frontmatter required — defaults applied                   |

### Using with Foam

Point `--vault-path` at your Foam workspace root. No configuration changes needed:

```bash
npx -y @comfucios/second-brain-mcp --vault-path "/path/to/your/foam-workspace"
```

Foam features that work out of the box:

- `[[wikilinks]]` and `[[target|aliased links]]` resolved in graph tools
- YAML frontmatter tags (both inline `[tag1, tag2]` and block list style)
- Nested tag hierarchies (`work/backend`)
- Sub-folder structure (`notes/`, `journal/`, `projects/`)
- Notes without frontmatter indexed with safe defaults

The `.vscode/` folder is automatically excluded from indexing.

## Read-Only Design

This MCP server is intentionally **read-only** to ensure your vault remains safe during AI interactions. It provides:

- ✅ Search and retrieve notes
- ✅ Filter by metadata and paths
- ✅ Generate summaries and statistics
- ❌ No note creation or editing
- ❌ No file modifications

For write operations, consider using dedicated Obsidian plugins with built-in safety checks.

## Installation

## Configuration & Installation

### One-Click Installation

- **VS Code:**
  [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Second_Brain_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=second-brain-mcp&config=%7B%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40comfucios%2Fsecond-brain-mcp%22%5D%7D)
- **VS Code Insiders:**
  [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Second_Brain_MCP-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=second-brain-mcp&config=%7B%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40comfucios%2Fsecond-brain-mcp%22%5D%7D)
- **Cursor:**
  [![Install in Cursor](https://img.shields.io/badge/Cursor-Install_Second_Brain_MCP-00D8FF?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/en/install-mcp?name=second-brain-mcp&config=eyJ0eXBlIjoic3RkaW8iLCJjb21tYW5kIjoibnB4IC15IEBjb21mdWNpb3Mvc2Vjb25kLWJyYWluLW1jcCIsImVudiI6e319)

### Manual Installation

No installation needed! Use directly with npx:

```bash
npx -y @comfucios/second-brain-mcp --vault-path "/path/to/your/vault"
```

#### Local Development

```bash
cd second-brain-mcp
npm install
npm run build
npm link
```

This makes the server available globally as `second-brain-mcp`.

### Claude Code & Claude Desktop

#### Claude Code

Add the server using:

```bash
claude mcp add second-brain -- npx -y @comfucios/second-brain-mcp --vault-path "/path/to/your/vault"
```

#### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path",
        "/path/to/your/vault"
      ]
    }
  }
}
```

See [docs/configuration.md](docs/configuration.md) for vault structure, CLI arguments, and configuration examples.

See [docs/api.md](docs/api.md) for the full MCP API reference and usage examples.

## Usage with Claude Code

Add to your MCP configuration file.

### Single Vault Configuration

**macOS/Linux:** Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** Edit `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path",
        "/Users/ioanniskarasavvaidis/Documents/Obsidian Vault"
      ]
    }
  }
}
```

### Multiple Vault Configuration

You can configure multiple vault instances:

```json
{
  "mcpServers": {
    "second-brain-personal": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path",
        "/Users/username/Documents/Personal Vault"
      ]
    },
    "second-brain-work": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path",
        "/Users/username/Documents/Work Vault"
      ]
    }
  }
}
```

### Local Development Setup

If you're developing locally with `npm link`:

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "second-brain-mcp",
      "args": ["--vault-path", "/path/to/your/vault"]
    }
  }
}
```

See [docs/examples.md](docs/examples.md) for more example queries.

## Documentation

See [docs/README.md](docs/README.md) for:

- API Reference
- Configuration & CLI Options
- Example Queries
- Development & Storage Architecture
- Contributing
- Dependencies
- Architecture & Database Schema
- Security & Search
- Example Queries
- Development
- Contributing
- Dependencies
- [License](#license)

## Quick Start

Run the server instantly with npx (no install required):

```bash
npx -y @comfucios/second-brain-mcp --vault-path "/path/to/your/vault"
```

Or add to Claude Code/Claude Desktop (see Configuration & Installation below).

---

## Troubleshooting & FAQ

See [docs/configuration.md](docs/configuration.md#troubleshooting--faq) for common issues and solutions.

See [docs/search.md](docs/search.md) for details on search weights and scoring.

See [docs/security.md](docs/security.md) for details on security features and protections.

See [docs/development.md](docs/development.md) for development workflow and storage details.

See [docs/contributing.md](docs/contributing.md) for contribution guidelines.

## Storage Architecture

The server uses **SQLite database storage by default** for efficient indexing and persistent caching:

- **Database Mode (Default)**: Stores indexed notes in `.second-brain-mcp/notes.db` within your vault
  - Persistent indexing (survives server restarts)
  - Efficient for large vaults (1000+ notes)
  - Full-text search with SQLite FTS5
  - Lower memory usage

- **Memory Mode (Optional)**: Use `--use-memory` flag for in-memory storage
  - Faster for small vaults (<100 notes)
  - No disk I/O overhead
  - Useful for development and testing
  - Uses Fuse.js for fuzzy search

See [docs/architecture.md](docs/architecture.md) for the architecture diagram.
See [docs/database-schema.md](docs/database-schema.md) for the database schema.

## Architecture

- **`src/index.ts`**: MCP server implementation with tool handlers
- **`src/vault.ts`**: Vault indexing orchestration and security controls
- **`src/storage.ts`**: Storage interface abstraction
- **`src/database-storage.ts`**: SQLite-based storage implementation
- **`src/memory-storage.ts`**: In-memory storage implementation with Fuse.js
- **`src/storage-factory.ts`**: Storage factory pattern for mode selection
- **`src/config.ts`**: Configuration management with defaults
- **`src/types.ts`**: TypeScript type definitions and validation utilities
- **`src/__tests__/`**: Unit tests for critical functionality

See [docs/dependencies.md](docs/dependencies.md) for a full list of production and development dependencies.

---

## Support

If second-brain-mcp saves you time, consider [sponsoring me on GitHub](https://github.com/sponsors/comfucios) or [buy me a coffee](https://www.buymeacoffee.com/comfucios).

## License

MIT
