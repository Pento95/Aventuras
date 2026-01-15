import type { VaultLorebook, VaultLorebookSource, EntryType, VaultLorebookEntry } from '$lib/types';
import type { LorebookImportResult } from '$lib/services/lorebookImporter';
import { database } from '$lib/services/database';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[LorebookVault]', ...args);
  }
}

/**
 * Store for managing the global Lorebook Vault.
 * Lorebooks in the vault are templates that can be copied to stories.
 */
class LorebookVaultStore {
  lorebooks = $state<VaultLorebook[]>([]);
  isLoaded = $state(false);

  get favorites(): VaultLorebook[] {
    return this.lorebooks.filter(lb => lb.favorite);
  }

  async load(): Promise<void> {
    try {
      this.lorebooks = await database.getVaultLorebooks();
      this.isLoaded = true;
      log('Loaded', this.lorebooks.length, 'vault lorebooks');
    } catch (error) {
      console.error('[LorebookVault] Failed to load:', error);
      this.lorebooks = [];
      this.isLoaded = true;
    }
  }

  async add(input: Omit<VaultLorebook, 'id' | 'createdAt' | 'updatedAt'>): Promise<VaultLorebook> {
    const now = Date.now();
    const lorebook: VaultLorebook = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    await database.addVaultLorebook(lorebook);
    this.lorebooks = [lorebook, ...this.lorebooks];
    log('Added vault lorebook:', lorebook.name);
    return lorebook;
  }

  async update(id: string, updates: Partial<VaultLorebook>): Promise<void> {
    await database.updateVaultLorebook(id, updates);
    this.lorebooks = this.lorebooks.map(lb =>
      lb.id === id ? { ...lb, ...updates, updatedAt: Date.now() } : lb
    );
    log('Updated vault lorebook:', id);
  }

  async delete(id: string): Promise<void> {
    await database.deleteVaultLorebook(id);
    this.lorebooks = this.lorebooks.filter(lb => lb.id !== id);
    log('Deleted vault lorebook:', id);
  }

  async toggleFavorite(id: string): Promise<void> {
    const lorebook = this.lorebooks.find(lb => lb.id === id);
    if (lorebook) {
      await this.update(id, { favorite: !lorebook.favorite });
    }
  }

  /**
   * Save imported lorebook result to the vault.
   */
  async saveFromImport(
    name: string,
    entries: VaultLorebookEntry[],
    result: LorebookImportResult,
    filename: string
  ): Promise<VaultLorebook> {
    const entryBreakdown: Record<EntryType, number> = {
      character: 0, location: 0, item: 0,
      faction: 0, concept: 0, event: 0,
    };
    for (const entry of entries) {
      entryBreakdown[entry.type]++;
    }

    return this.add({
      name,
      description: null,
      entries,
      tags: [],
      favorite: false,
      source: 'import',
      originalFilename: filename,
      originalStoryId: null,
      metadata: {
        format: result.metadata.format,
        totalEntries: entries.length,
        entryBreakdown,
      },
    });
  }

  /**
   * Save lorebook entries from a story to the vault.
   */
  async saveFromStory(
    name: string,
    entries: VaultLorebookEntry[],
    storyId: string
  ): Promise<VaultLorebook> {
    const entryBreakdown: Record<EntryType, number> = {
      character: 0, location: 0, item: 0,
      faction: 0, concept: 0, event: 0,
    };
    for (const entry of entries) {
      entryBreakdown[entry.type]++;
    }

    return this.add({
      name,
      description: null,
      entries,
      tags: [],
      favorite: false,
      source: 'story',
      originalFilename: null,
      originalStoryId: storyId,
      metadata: {
        format: 'aventura',
        totalEntries: entries.length,
        entryBreakdown,
      },
    });
  }

  /**
   * Get a lorebook by ID.
   */
  getById(id: string): VaultLorebook | undefined {
    return this.lorebooks.find(lb => lb.id === id);
  }

  /**
   * Search vault lorebooks.
   */
  async search(query: string): Promise<VaultLorebook[]> {
    if (!query.trim()) {
      return this.lorebooks;
    }
    return database.searchVaultLorebooks(query);
  }
}

export const lorebookVault = new LorebookVaultStore();
