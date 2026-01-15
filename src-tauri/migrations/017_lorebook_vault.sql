-- Lorebook Vault: Global lorebook library for reusable lorebook templates
-- Lorebooks contain processed entries and are copied to stories

CREATE TABLE IF NOT EXISTS lorebook_vault (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Processed entries stored as JSON array
    entries TEXT NOT NULL DEFAULT '[]',
    
    -- Organization
    tags TEXT NOT NULL DEFAULT '[]',
    favorite INTEGER NOT NULL DEFAULT 0,
    
    -- Provenance
    source TEXT NOT NULL DEFAULT 'import',
    original_filename TEXT,
    original_story_id TEXT,
    
    -- Metadata (format, counts, etc.)
    metadata TEXT,
    
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_lorebook_vault_name ON lorebook_vault(name);
CREATE INDEX IF NOT EXISTS idx_lorebook_vault_favorite ON lorebook_vault(favorite);
CREATE INDEX IF NOT EXISTS idx_lorebook_vault_source ON lorebook_vault(source);
