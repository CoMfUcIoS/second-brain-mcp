# Setup Guide

## Quick Start with npx (Recommended)

No installation needed! Just configure Claude Code:

1. **Edit your MCP configuration file:**

   **macOS/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add this configuration:**

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

   **Important:** Replace the vault path with your actual Obsidian vault location.

3. **Restart Claude Code**

   The MCP server will automatically download and run via npx!

## Multiple Vaults

You can configure multiple vaults by adding multiple server entries:

```json
{
  "mcpServers": {
    "obsidian-personal": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path",
        "/Users/username/Documents/Personal Vault"
      ]
    },
    "obsidian-work": {
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

## Local Development Setup

For development or customization:

1. **Install dependencies**

   ```bash
   cd second-brain-mcp
   npm install
   ```

2. **Build the server**

   ```bash
   npm run build
   ```

3. **Link globally**

   ```bash
   npm link
   ```

4. **Configure Claude Code with local version:**

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

5. **Restart Claude Code**

## Testing the Server

You can test the server directly using stdio:

```bash
cd second-brain-mcp
npm start
```

Then send MCP protocol messages via stdin.

## Verification

After setup, you can verify the server is working by asking Claude:

- "Search my notes for docker"
- "Show me active Puppet work"
- "List all my project ideas"
- "What are my recent meeting notes?"

## Troubleshooting

### Server not appearing in Claude Code

1. Check the configuration file path is correct
2. Verify the `dist/index.js` file exists (run `npm run build`)
3. Check Claude Code logs for errors
4. Restart Claude Code completely

### Notes not being indexed

1. Verify your vault structure matches the expected layout
2. Check that notes have proper frontmatter
3. Look at console output when server starts (it shows indexed count and errors)
4. Verify `--index-patterns` in your MCP configuration are correct
5. Check if files exceed `--max-file-size` limit (default 10MB)
6. Large files will be skipped with a warning in the console

### Search returns no results

1. Ensure frontmatter tags are formatted as arrays: `tags: [tag1, tag2]`
2. Check the `modified` and `created` dates are in YYYY-MM-DD format
3. Try a broader search without filters first
4. Use `list_tags` to see what tags are available

## Advanced Configuration

### Configuration Options

All configuration can be done via CLI arguments in your `mcp.json` file. No need to edit source code!

**Available CLI Arguments:**

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--vault-path` | string | **(required)** | Path to your Obsidian vault |
| `--use-memory` | flag | `false` | Use in-memory storage instead of database (for small vaults) |
| `--index-patterns` | string | `Work/**/*.md,Projects/**/*.md,Knowledge/**/*.md,Life/**/*.md,Dailies/**/*.md` | Comma-separated patterns to index |
| `--exclude-patterns` | string | `Archive/**/*.md,_Meta/Attachments/**,.trash/**,node_modules/**,.git/**` | Comma-separated patterns to exclude |
| `--metadata-fields` | string | `tags,type,status,category,created,modified` | Comma-separated frontmatter fields |
| `--max-file-size` | number | `10485760` | Maximum file size in bytes (10MB) |
| `--max-search-results` | number | `100` | Maximum search results to return |
| `--max-recent-notes` | number | `100` | Maximum recent notes to return |

**Example with custom configuration:**

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path", "/Users/username/Documents/Vault",
        "--index-patterns", "Work/**/*.md,Projects/**/*.md,Archive/**/*.md",
        "--exclude-patterns", ".trash/**,node_modules/**",
        "--max-search-results", "50",
        "--max-file-size", "5242880"
      ]
    }
  }
}
```

### Performance Tuning

**For large vaults (1000+ notes):**
- Use database mode (default) for efficient indexing and lower memory usage
- Database is stored in `.obsidian-mcp/notes.db` within your vault
- Indexing persists across server restarts (no re-indexing needed)
- Decrease `--max-search-results` for faster searches if needed
- Use more specific `--index-patterns` to limit indexed notes

**For small vaults (<100 notes):**
- Consider using `--use-memory` flag for faster in-memory search
- Can increase all limits safely
- Index all folders including archive if needed

**Storage Mode Comparison:**
- **Database Mode (Default)**: Best for large vaults, persistent indexing, lower memory
- **Memory Mode (`--use-memory`)**: Best for small vaults, faster search, development/testing

### Index Different Folders

Use the `--index-patterns` argument:

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path", "/path/to/vault",
        "--index-patterns", "Work/**/*.md,Projects/**/*.md,CustomFolder/**/*.md"
      ]
    }
  }
}
```

### Exclude More Patterns

Use the `--exclude-patterns` argument:

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path", "/path/to/vault",
        "--exclude-patterns", "Archive/**/*.md,_Meta/**,.trash/**,Private/**/*.md"
      ]
    }
  }
}
```

## Development Mode

For active development with auto-rebuild:

```bash
npm run watch
```

This will watch for file changes and rebuild automatically.

## Testing

The project includes comprehensive unit tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

Tests cover:
- Date parsing and validation
- Enum validation (type, status, category)
- Path security (traversal protection)
- File size limits
- Tag matching (hierarchical)
- Frontmatter validation

## Code Quality

Maintain code quality with linting:

```bash
# Check for lint errors
npm run lint

# Auto-fix lint issues
npm run lint:fix
```

The project enforces:
- No explicit `any` types
- TypeScript strict mode
- Consistent code style
- Test coverage for new features

## Next Steps

- Read the full [README.md](README.md) for all available tools
- Check out the [Security Features](#security-features) section
- Start using natural language queries with Claude Code!
