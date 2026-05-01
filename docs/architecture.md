
# Architecture Diagram (Mermaid)

This diagram shows the high-level system architecture and data flow for the MCP Second Brain Server.

> **Tip:** View this diagram using the [Mermaid Live Editor](https://mermaid.live/) or a compatible Markdown viewer.

````mermaid
graph TD
    A[MCP Client<br/>Claude/VSCode] -->|MCP Protocol| B[MCP Server<br/>index.ts]
    B -->|Initialize| C[MarkdownVault<br/>vault.ts]
    C -->|Create Storage| D{Storage Factory<br/>storage-factory.ts}

    D -->|Default| E[DatabaseStorage<br/>database-storage.ts]
    D -->|--use-memory| F[MemoryStorage<br/>memory-storage.ts]

    E -->|Stores in| G[(SQLite DB<br/>.second-brain-mcp/notes.db)]
    F -->|Stores in| H[In-Memory<br/>Map + Fuse.js]

    C -->|Scan Files| I[Markdown Vault<br/>*.md files]
    I -->|Parse Frontmatter| J[gray-matter]
    J -->|Index Notes| E
    J -->|Index Notes| F

    B -->|search_notes| C
    B -->|get_note| C
    B -->|get_notes_by_tag| C
    B -->|list_tags| C

    G -.->|FTS5 Search| E
    H -.->|Fuzzy Search| F

    style E fill:#4CAF50
    style F fill:#2196F3
    style G fill:#4CAF50
    style H fill:#2196F3
````
