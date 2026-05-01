import Database from 'better-sqlite3';
import { Note, SearchOptions, parseDate } from './types.js';
import { IStorage } from './storage.js';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * SQLite-based storage implementation
 * Efficient for large vaults with persistent indexing
 */
export class DatabaseStorage implements IStorage {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor(vaultPath: string) {
    // Store database in vault's .second-brain-mcp directory
    const dbDir = join(vaultPath, '.second-brain-mcp');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    this.dbPath = join(dbDir, 'notes.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
  }

  async initialize(): Promise<void> {
    // Create notes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        excerpt TEXT,
        created TEXT,
        modified TEXT,
        type TEXT,
        status TEXT,
        category TEXT
      )
    `);

    // Create tags table (for many-to-many relationship)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS note_tags (
        note_path TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (note_path, tag),
        FOREIGN KEY (note_path) REFERENCES notes(path) ON DELETE CASCADE
      )
    `);

    // Create frontmatter table for custom fields
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS note_frontmatter (
        note_path TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (note_path, key),
        FOREIGN KEY (note_path) REFERENCES notes(path) ON DELETE CASCADE
      )
    `);

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
      CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
      CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
      CREATE INDEX IF NOT EXISTS idx_note_tags_path ON note_tags(note_path);

      -- Full-text search indexes
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        path UNINDEXED,
        title,
        content,
        tokenize = 'porter'
      );
    `);
  }

  async upsertNote(note: Note): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Insert/update main note
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO notes (path, title, content, excerpt, created, modified, type, status, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        note.path,
        note.title,
        note.content,
        note.excerpt || null,
        note.frontmatter.created || null,
        note.frontmatter.modified || null,
        note.frontmatter.type || 'note',
        note.frontmatter.status || 'active',
        note.frontmatter.category || 'personal'
      );

      // Delete existing tags and frontmatter
      this.db.prepare('DELETE FROM note_tags WHERE note_path = ?').run(note.path);
      this.db.prepare('DELETE FROM note_frontmatter WHERE note_path = ?').run(note.path);

      // Insert tags
      if (note.frontmatter.tags && note.frontmatter.tags.length > 0) {
        const tagStmt = this.db.prepare('INSERT INTO note_tags (note_path, tag) VALUES (?, ?)');
        for (const tag of note.frontmatter.tags) {
          tagStmt.run(note.path, tag);
        }
      }

      // Insert custom frontmatter fields
      const frontmatterStmt = this.db.prepare('INSERT INTO note_frontmatter (note_path, key, value) VALUES (?, ?, ?)');
      for (const [key, value] of Object.entries(note.frontmatter)) {
        if (!['created', 'modified', 'tags', 'type', 'status', 'category'].includes(key)) {
          frontmatterStmt.run(note.path, key, JSON.stringify(value));
        }
      }

      // Update FTS index
      this.db.prepare(`
        INSERT OR REPLACE INTO notes_fts (path, title, content)
        VALUES (?, ?, ?)
      `).run(note.path, note.title, note.content);
    });

    transaction();
  }

  async upsertNotes(notes: Note[]): Promise<void> {
    const transaction = this.db.transaction(() => {
      for (const note of notes) {
        // Insert/update main note
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO notes (path, title, content, excerpt, created, modified, type, status, category)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          note.path,
          note.title,
          note.content,
          note.excerpt || null,
          note.frontmatter.created || null,
          note.frontmatter.modified || null,
          note.frontmatter.type || 'note',
          note.frontmatter.status || 'active',
          note.frontmatter.category || 'personal'
        );

        // Delete existing tags and frontmatter
        this.db.prepare('DELETE FROM note_tags WHERE note_path = ?').run(note.path);
        this.db.prepare('DELETE FROM note_frontmatter WHERE note_path = ?').run(note.path);

        // Insert tags
        if (note.frontmatter.tags && note.frontmatter.tags.length > 0) {
          const tagStmt = this.db.prepare('INSERT INTO note_tags (note_path, tag) VALUES (?, ?)');
          for (const tag of note.frontmatter.tags) {
            tagStmt.run(note.path, tag);
          }
        }

        // Insert custom frontmatter fields
        const frontmatterStmt = this.db.prepare('INSERT INTO note_frontmatter (note_path, key, value) VALUES (?, ?, ?)');
        for (const [key, value] of Object.entries(note.frontmatter)) {
          if (!['created', 'modified', 'tags', 'type', 'status', 'category'].includes(key)) {
            frontmatterStmt.run(note.path, key, JSON.stringify(value));
          }
        }

        // Update FTS index
        this.db.prepare(`
          INSERT OR REPLACE INTO notes_fts (path, title, content)
          VALUES (?, ?, ?)
        `).run(note.path, note.title, note.content);
      }
    });

    transaction();
  }

  async getNote(path: string): Promise<Note | null> {
    const noteRow = this.db.prepare('SELECT * FROM notes WHERE path = ?').get(path) as any;
    if (!noteRow) return null;

    return this.rowToNote(noteRow);
  }

  async getAllNotes(): Promise<Note[]> {
    const rows = this.db.prepare('SELECT * FROM notes').all() as any[];
    return rows.map(row => this.rowToNote(row));
  }

  async searchNotes(query: string, options: SearchOptions = {}): Promise<Note[]> {
    let sql = 'SELECT DISTINCT n.* FROM notes n';
    const params: any[] = [];
    const conditions: string[] = [];

    // Full-text search if query provided
    if (query) {
      sql += ' JOIN notes_fts fts ON n.path = fts.path';
      conditions.push('notes_fts MATCH ?');
      params.push(query);
    }

    // Tag filter with hierarchical support
    if (options.tags && options.tags.length > 0) {
      sql += ' JOIN note_tags nt ON n.path = nt.note_path';
      const tagConditions = options.tags.map(() => '(nt.tag = ? OR nt.tag LIKE ?)').join(' OR ');
      conditions.push(`(${tagConditions})`);
      for (const tag of options.tags) {
        params.push(tag, `${tag}/%`);
      }
    }

    // Path filter
    if (options.path) {
      const pattern = options.path.toLowerCase();
      if (pattern.endsWith('/**')) {
        const prefix = pattern.slice(0, -3);
        conditions.push('LOWER(n.path) LIKE ?');
        params.push(`${prefix}%`);
      } else {
        conditions.push('LOWER(n.path) LIKE ?');
        params.push(`%${pattern}%`);
      }
    }

    // Archive filter
    if (!options.includeArchive) {
      conditions.push("LOWER(n.path) NOT LIKE 'archive/%'");
    }

    // Type filter
    if (options.type) {
      conditions.push('n.type = ?');
      params.push(options.type);
    }

    // Status filter
    if (options.status) {
      conditions.push('n.status = ?');
      params.push(options.status);
    }

    // Category filter
    if (options.category) {
      conditions.push('n.category = ?');
      params.push(options.category);
    }

    // Date range filters
    if (options.dateFrom) {
      conditions.push('n.modified >= ?');
      params.push(options.dateFrom);
    }
    if (options.dateTo) {
      conditions.push('n.modified <= ?');
      params.push(options.dateTo);
    }

    // Build WHERE clause
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Order by relevance (FTS rank) if searching, otherwise by modification date
    sql += query
      ? ' ORDER BY fts.rank, n.modified DESC'
      : ' ORDER BY n.modified DESC';

    // Apply limit
    const limit = options.limit || 20;
    sql += ' LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToNote(row));
  }

  async getNotesByTag(tag: string): Promise<Note[]> {
    const sql = `
      SELECT DISTINCT n.* FROM notes n
      JOIN note_tags nt ON n.path = nt.note_path
      WHERE nt.tag = ? OR nt.tag LIKE ?
      ORDER BY n.modified DESC
    `;
    const rows = this.db.prepare(sql).all(tag, `${tag}/%`) as any[];
    return rows.map(row => this.rowToNote(row));
  }

  async getRecentNotes(limit: number): Promise<Note[]> {
    const rows = this.db.prepare('SELECT * FROM notes ORDER BY modified DESC LIMIT ?').all(limit) as any[];
    return rows.map(row => this.rowToNote(row));
  }

  async clear(): Promise<void> {
    this.db.exec('DELETE FROM notes');
    this.db.exec('DELETE FROM note_tags');
    this.db.exec('DELETE FROM note_frontmatter');
    this.db.exec('DELETE FROM notes_fts');
  }

  async close(): Promise<void> {
    this.db.close();
  }

  /**
   * Convert database row to Note object
   */
  private rowToNote(row: any): Note {
    // Get tags for this note
    const tags = this.db.prepare('SELECT tag FROM note_tags WHERE note_path = ?').all(row.path) as any[];

    // Get custom frontmatter
    const frontmatterRows = this.db.prepare('SELECT key, value FROM note_frontmatter WHERE note_path = ?').all(row.path) as any[];
    const customFrontmatter: Record<string, unknown> = {};
    for (const fm of frontmatterRows) {
      try {
        customFrontmatter[fm.key] = JSON.parse(fm.value);
      } catch {
        customFrontmatter[fm.key] = fm.value;
      }
    }

    return {
      path: row.path,
      title: row.title,
      content: row.content,
      excerpt: row.excerpt,
      frontmatter: {
        created: row.created,
        modified: row.modified,
        tags: tags.map(t => t.tag),
        type: row.type,
        status: row.status,
        category: row.category,
        ...customFrontmatter
      }
    };
  }
}
