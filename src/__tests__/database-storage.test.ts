import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseStorage } from '../database-storage.js';
import { Note } from '../types.js';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

describe('DatabaseStorage', () => {
  let testVaultPath: string;
  let storage: DatabaseStorage;

  beforeEach(async () => {
    testVaultPath = join(tmpdir(), `test-db-vault-${Date.now()}`);
    await mkdir(testVaultPath, { recursive: true });
    storage = new DatabaseStorage(testVaultPath);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    await rm(testVaultPath, { recursive: true, force: true });
  });

  describe('Initialization', () => {
    test('creates database directory if not exists', async () => {
      const dbDir = join(testVaultPath, '.second-brain-mcp');
      expect(existsSync(dbDir)).toBe(true);
    });

    test('creates database file', async () => {
      const dbPath = join(testVaultPath, '.second-brain-mcp', 'notes.db');
      expect(existsSync(dbPath)).toBe(true);
    });

    test('creates notes table', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Test',
        content: 'Content',
        frontmatter: {}
      };
      await storage.upsertNote(note);
      const retrieved = await storage.getNote('test.md');
      expect(retrieved).not.toBeNull();
    });

    test('creates FTS table for full-text search', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Searchable Title',
        content: 'Searchable content',
        frontmatter: {}
      };
      await storage.upsertNote(note);
      const results = await storage.searchNotes('Searchable');
      expect(results.length).toBe(1);
    });
  });

  describe('upsertNote', () => {
    test('inserts new note', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Test Note',
        content: 'Test content',
        excerpt: 'Test excerpt',
        frontmatter: {
          tags: ['test', 'example'],
          type: 'note',
          status: 'active',
          category: 'personal',
          created: '2025-01-01',
          modified: '2025-01-02'
        }
      };

      await storage.upsertNote(note);
      const retrieved = await storage.getNote('test.md');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('Test Note');
      expect(retrieved?.content).toBe('Test content');
      expect(retrieved?.excerpt).toBe('Test excerpt');
      expect(retrieved?.frontmatter.tags?.sort()).toEqual(['example', 'test']);
      expect(retrieved?.frontmatter.type).toBe('note');
      expect(retrieved?.frontmatter.status).toBe('active');
      expect(retrieved?.frontmatter.category).toBe('personal');
    });

    test('updates existing note', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Original Title',
        content: 'Original content',
        frontmatter: { tags: ['original'] }
      };

      await storage.upsertNote(note);

      const updated: Note = {
        path: 'test.md',
        title: 'Updated Title',
        content: 'Updated content',
        frontmatter: { tags: ['updated'] }
      };

      await storage.upsertNote(updated);
      const retrieved = await storage.getNote('test.md');

      expect(retrieved?.title).toBe('Updated Title');
      expect(retrieved?.content).toBe('Updated content');
      expect(retrieved?.frontmatter.tags).toEqual(['updated']);
    });

    test('handles note without tags', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Test',
        content: 'Content',
        frontmatter: {}
      };

      await storage.upsertNote(note);
      const retrieved = await storage.getNote('test.md');

      expect(retrieved?.frontmatter.tags).toEqual([]);
    });

    test('stores custom frontmatter fields', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Test',
        content: 'Content',
        frontmatter: {
          tags: ['test'],
          customField: 'custom value',
          anotherField: 123
        }
      };

      await storage.upsertNote(note);
      const retrieved = await storage.getNote('test.md');

      expect(retrieved?.frontmatter.customField).toBe('custom value');
      expect(retrieved?.frontmatter.anotherField).toBe(123);
    });

    test('applies default values for missing frontmatter', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Test',
        content: 'Content',
        frontmatter: {}
      };

      await storage.upsertNote(note);
      const retrieved = await storage.getNote('test.md');

      expect(retrieved?.frontmatter.type).toBe('note');
      expect(retrieved?.frontmatter.status).toBe('active');
      expect(retrieved?.frontmatter.category).toBe('personal');
    });
  });

  describe('upsertNotes', () => {
    test('inserts multiple notes in bulk', async () => {
      const notes: Note[] = [
        {
          path: 'note1.md',
          title: 'Note 1',
          content: 'Content 1',
          frontmatter: { tags: ['test1'] }
        },
        {
          path: 'note2.md',
          title: 'Note 2',
          content: 'Content 2',
          frontmatter: { tags: ['test2'] }
        },
        {
          path: 'note3.md',
          title: 'Note 3',
          content: 'Content 3',
          frontmatter: { tags: ['test3'] }
        }
      ];

      await storage.upsertNotes(notes);
      const allNotes = await storage.getAllNotes();

      expect(allNotes.length).toBe(3);
      expect(allNotes.map(n => n.title).sort()).toEqual(['Note 1', 'Note 2', 'Note 3']);
    });

    test('handles empty array', async () => {
      await storage.upsertNotes([]);
      const allNotes = await storage.getAllNotes();
      expect(allNotes.length).toBe(0);
    });
  });

  describe('getNote', () => {
    test('returns null for non-existent note', async () => {
      const note = await storage.getNote('nonexistent.md');
      expect(note).toBeNull();
    });

    test('retrieves note with all fields', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Test',
        content: 'Content',
        excerpt: 'Excerpt',
        frontmatter: {
          tags: ['tag1', 'tag2'],
          type: 'project',
          status: 'active',
          category: 'work',
          created: '2025-01-01',
          modified: '2025-01-02'
        }
      };

      await storage.upsertNote(note);
      const retrieved = await storage.getNote('test.md');

      expect(retrieved).toEqual(note);
    });
  });

  describe('getAllNotes', () => {
    test('returns empty array when no notes', async () => {
      const notes = await storage.getAllNotes();
      expect(notes).toEqual([]);
    });

    test('returns all notes', async () => {
      const notes: Note[] = [
        { path: 'note1.md', title: 'Note 1', content: 'Content 1', frontmatter: {} },
        { path: 'note2.md', title: 'Note 2', content: 'Content 2', frontmatter: {} },
        { path: 'note3.md', title: 'Note 3', content: 'Content 3', frontmatter: {} }
      ];

      await storage.upsertNotes(notes);
      const allNotes = await storage.getAllNotes();

      expect(allNotes.length).toBe(3);
    });
  });

  describe('searchNotes', () => {
    beforeEach(async () => {
      const notes: Note[] = [
        {
          path: 'work.md',
          title: 'Work Project',
          content: 'Important work content about project alpha',
          frontmatter: {
            tags: ['work', 'project'],
            type: 'project',
            status: 'active',
            category: 'work',
            modified: '2025-01-15'
          }
        },
        {
          path: 'personal.md',
          title: 'Personal Note',
          content: 'Personal thoughts and ideas',
          frontmatter: {
            tags: ['personal', 'ideas'],
            type: 'note',
            status: 'active',
            category: 'personal',
            modified: '2025-01-10'
          }
        },
        {
          path: 'archive/old.md',
          title: 'Old Note',
          content: 'Archived content',
          frontmatter: {
            tags: ['archive'],
            type: 'note',
            status: 'archived',
            category: 'personal',
            modified: '2024-12-01'
          }
        }
      ];

      await storage.upsertNotes(notes);
    });

    test('searches with full-text query', async () => {
      const results = await storage.searchNotes('project');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Work Project');
    });

    test('searches without query returns all notes', async () => {
      const results = await storage.searchNotes('', { includeArchive: true });
      expect(results.length).toBe(3);
    });

    test('filters by tags', async () => {
      const results = await storage.searchNotes('', { tags: ['work'] });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Work Project');
    });

    test('filters by hierarchical tags', async () => {
      await storage.upsertNote({
        path: 'puppet.md',
        title: 'Puppet Task',
        content: 'Puppet content',
        frontmatter: { tags: ['work/puppet'] }
      });

      const results = await storage.searchNotes('', { tags: ['work'] });
      expect(results.length).toBe(2);
      expect(results.some(n => n.frontmatter.tags?.includes('work/puppet'))).toBe(true);
    });

    test('filters by path', async () => {
      const results = await storage.searchNotes('', { path: 'work.md' });
      expect(results.length).toBe(1);
      expect(results[0].path).toBe('work.md');
    });

    test('filters by path with /** pattern', async () => {
      const results = await storage.searchNotes('', { path: 'archive/**', includeArchive: true });
      expect(results.length).toBe(1);
      expect(results[0].path).toBe('archive/old.md');
    });

    test('excludes archive by default', async () => {
      const results = await storage.searchNotes('', { includeArchive: false });
      expect(results.every(n => !n.path.toLowerCase().startsWith('archive'))).toBe(true);
    });

    test('includes archive when requested', async () => {
      const results = await storage.searchNotes('', { includeArchive: true });
      expect(results.some(n => n.path.startsWith('archive'))).toBe(true);
    });

    test('filters by type', async () => {
      const results = await storage.searchNotes('', { type: 'project' });
      expect(results.length).toBe(1);
      expect(results[0].frontmatter.type).toBe('project');
    });

    test('filters by status', async () => {
      const results = await storage.searchNotes('', { status: 'archived', includeArchive: true });
      expect(results.length).toBe(1);
      expect(results[0].frontmatter.status).toBe('archived');
    });

    test('filters by category', async () => {
      const results = await storage.searchNotes('', { category: 'work' });
      expect(results.length).toBe(1);
      expect(results[0].frontmatter.category).toBe('work');
    });

    test('filters by dateFrom', async () => {
      const results = await storage.searchNotes('', { dateFrom: '2025-01-01' });
      expect(results.length).toBe(2);
      expect(results.every(n => {
        const date = new Date(n.frontmatter.modified || '');
        return date >= new Date('2025-01-01');
      })).toBe(true);
    });

    test('filters by dateTo', async () => {
      const results = await storage.searchNotes('', { dateTo: '2025-01-01', includeArchive: true });
      expect(results.length).toBe(1);
      expect(results[0].frontmatter.modified).toBe('2024-12-01');
    });

    test('applies limit', async () => {
      const results = await storage.searchNotes('', { limit: 2 });
      expect(results.length).toBe(2);
    });

    test('combines multiple filters', async () => {
      const results = await storage.searchNotes('', {
        tags: ['work'],
        type: 'project',
        status: 'active'
      });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Work Project');
    });

    test('orders by modification date', async () => {
      const results = await storage.searchNotes('');
      const dates = results.map(n => new Date(n.frontmatter.modified || '').getTime());

      // Check if sorted in descending order (newest first)
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    });
  });

  describe('getNotesByTag', () => {
    beforeEach(async () => {
      const notes: Note[] = [
        {
          path: 'work1.md',
          title: 'Work 1',
          content: 'Content',
          frontmatter: { tags: ['work'] }
        },
        {
          path: 'work2.md',
          title: 'Work 2',
          content: 'Content',
          frontmatter: { tags: ['work/project'] }
        },
        {
          path: 'personal.md',
          title: 'Personal',
          content: 'Content',
          frontmatter: { tags: ['personal'] }
        }
      ];

      await storage.upsertNotes(notes);
    });

    test('retrieves notes with exact tag', async () => {
      const results = await storage.getNotesByTag('work');
      expect(results.length).toBe(2);
    });

    test('retrieves notes with hierarchical tag', async () => {
      const results = await storage.getNotesByTag('work');
      expect(results.some(n => n.frontmatter.tags?.includes('work/project'))).toBe(true);
    });

    test('returns empty array for non-existent tag', async () => {
      const results = await storage.getNotesByTag('nonexistent');
      expect(results.length).toBe(0);
    });
  });

  describe('getRecentNotes', () => {
    beforeEach(async () => {
      const notes: Note[] = [
        {
          path: 'old.md',
          title: 'Old',
          content: 'Content',
          frontmatter: { modified: '2024-01-01' }
        },
        {
          path: 'recent.md',
          title: 'Recent',
          content: 'Content',
          frontmatter: { modified: '2025-01-15' }
        },
        {
          path: 'middle.md',
          title: 'Middle',
          content: 'Content',
          frontmatter: { modified: '2025-01-10' }
        }
      ];

      await storage.upsertNotes(notes);
    });

    test('retrieves most recent notes', async () => {
      const results = await storage.getRecentNotes(2);
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Recent');
      expect(results[1].title).toBe('Middle');
    });

    test('respects limit parameter', async () => {
      const results = await storage.getRecentNotes(1);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Recent');
    });

    test('returns all notes when limit exceeds count', async () => {
      const results = await storage.getRecentNotes(10);
      expect(results.length).toBe(3);
    });
  });

  describe('clear', () => {
    test('removes all notes from storage', async () => {
      const notes: Note[] = [
        { path: 'note1.md', title: 'Note 1', content: 'Content', frontmatter: { tags: ['test'] } },
        { path: 'note2.md', title: 'Note 2', content: 'Content', frontmatter: {} }
      ];

      await storage.upsertNotes(notes);
      expect((await storage.getAllNotes()).length).toBe(2);

      await storage.clear();
      expect((await storage.getAllNotes()).length).toBe(0);
    });

    test('clears FTS index', async () => {
      const note: Note = {
        path: 'test.md',
        title: 'Searchable',
        content: 'Content',
        frontmatter: {}
      };

      await storage.upsertNote(note);
      expect((await storage.searchNotes('Searchable')).length).toBe(1);

      await storage.clear();
      expect((await storage.searchNotes('Searchable')).length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('handles malformed JSON in custom frontmatter', async () => {
      // This test verifies the error handling in rowToNote
      const note: Note = {
        path: 'test.md',
        title: 'Test',
        content: 'Content',
        frontmatter: {
          customField: { complex: 'object' }
        }
      };

      await storage.upsertNote(note);
      const retrieved = await storage.getNote('test.md');

      // Should still retrieve the note even if JSON parsing has issues
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('Test');
    });
  });

  describe('Multi-tag Filtering', () => {
    beforeEach(async () => {
      const notes: Note[] = [
        {
          path: 'note1.md',
          title: 'Note 1',
          content: 'Content',
          frontmatter: { tags: ['work', 'project'] }
        },
        {
          path: 'note2.md',
          title: 'Note 2',
          content: 'Content',
          frontmatter: { tags: ['work', 'meeting'] }
        },
        {
          path: 'note3.md',
          title: 'Note 3',
          content: 'Content',
          frontmatter: { tags: ['personal'] }
        }
      ];

      await storage.upsertNotes(notes);
    });

    test('filters with multiple tags (OR logic)', async () => {
      const results = await storage.searchNotes('', { tags: ['project', 'meeting'] });
      expect(results.length).toBe(2);
    });
  });
});
