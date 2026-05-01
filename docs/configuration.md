
# Configuration & CLI Options

## Frontmatter Requirements

All notes must include YAML frontmatter with at least the following fields:

- `tags`: Array of tags (e.g., `[work/puppet, golang]`)
- `type`: One of `note`, `project`, `task`, `daily`, `meeting`
- `status`: One of `active`, `archived`, `idea`, `completed`
- `category`: One of `work`, `personal`, `knowledge`, `life`, `dailies`
- `created`: Creation date (YYYY-MM-DD)
- `modified`: Last modified date (YYYY-MM-DD)

Example:

```yaml
---
tags: [work/puppet, golang]
type: note
status: active
category: work
created: 2024-01-01
modified: 2024-01-02
---
```

## Vault Structure

The server automatically detects your vault structure based on the standardized organization:

```
📁 Work/          - Professional context
📁 Projects/      - Personal projects
📁 Knowledge/     - Learning & references
📁 Life/          - Personal management
📁 Dailies/       - Journal entries
📁 Archive/       - Historical notes (excluded)
📁 _Meta/         - Vault management (excluded)
```

## CLI Arguments

| Argument               | Type   | Default                                                                        | Description                                                  |
| ---------------------- | ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `--vault-path`         | string | **(required)**                                                                 | Path to your Obsidian vault                                  |
| `--use-memory`         | flag   | `false`                                                                        | Use in-memory storage instead of database (for small vaults) |
| `--index-patterns`     | string | `Work/**/*.md,Projects/**/*.md,Knowledge/**/*.md,Life/**/*.md,Dailies/**/*.md` | Comma-separated patterns to index                            |
| `--exclude-patterns`   | string | `Archive/**/*.md,_Meta/Attachments/**,.trash/**,node_modules/**,.git/**`       | Comma-separated patterns to exclude                          |
| `--metadata-fields`    | string | `tags,type,status,category,created,modified`                                   | Comma-separated frontmatter fields                           |
| `--max-file-size`      | number | `10485760`                                                                     | Maximum file size in bytes (10MB)                            |
| `--max-search-results` | number | `100`                                                                          | Maximum search results to return                             |
| `--max-recent-notes`   | number | `100`                                                                          | Maximum recent notes to return                               |

## Example Configuration (JSON)

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "npx",
      "args": [
        "-y",
        "@comfucios/second-brain-mcp",
        "--vault-path",
        "/Users/username/Documents/Vault",
        "--index-patterns",
        "Work/**/*.md,Projects/**/*.md,Archive/**/*.md",
        "--exclude-patterns",
        ".trash/**,node_modules/**",
        "--max-search-results",
        "50",
        "--max-file-size",
        "5242880"
      ]
    }
  }
}
```

## Troubleshooting & FAQ

### The server is not indexing my notes
- Ensure your notes are in one of the indexed folders (see `--index-patterns` in configuration).
- Check that your notes have valid YAML frontmatter as described above.
- Make sure files are not excluded by `--exclude-patterns`.

### I get a file size error
- Files larger than the configured `max-file-size` are skipped. Increase the limit if needed.

### Search results are missing notes
- Confirm the notes have the correct tags, type, status, and category in frontmatter.
- Check if the notes are archived and whether `includeArchive` is set in your query.

### How do I use memory mode?
- Add the `--use-memory` flag to your CLI arguments or configuration.

### How do I configure multiple vaults?
- See the configuration examples in this document and in the main README.
