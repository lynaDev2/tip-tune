import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add PostgreSQL full-text search and trigram fuzzy search support.
 * - Enables pg_trgm extension for similarity() and ILIKE optimization
 * - Adds tsvector generated columns for artists and tracks
 * - Creates GIN indexes for full-text search
 * - Creates GIN trigram indexes for fuzzy matching
 *
 * Run: npx typeorm migration:run -d path/to/data-source.js
 * Or apply manually via psql if using synchronize.
 */
export class AddSearchIndexes1737705600000 implements MigrationInterface {
  name = 'AddSearchIndexes1737705600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // Artists: full-text search vector (artistName, genre, bio)
    await queryRunner.query(`
      ALTER TABLE "artists"
      ADD COLUMN IF NOT EXISTS "search_vector" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("artistName", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("genre", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("bio", '')), 'B')
      ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_artists_search_vector"
      ON "artists" USING GIN ("search_vector")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_artists_artistname_trgm"
      ON "artists" USING GIN ("artistName" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_artists_genre_trgm"
      ON "artists" USING GIN ("genre" gin_trgm_ops)
    `);

    // Tracks: full-text search vector (title, genre, description)
    await queryRunner.query(`
      ALTER TABLE "tracks"
      ADD COLUMN IF NOT EXISTS "search_vector" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("genre", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("description", '')), 'B')
      ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tracks_search_vector"
      ON "tracks" USING GIN ("search_vector")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tracks_title_trgm"
      ON "tracks" USING GIN ("title" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tracks_genre_trgm"
      ON "tracks" USING GIN ("genre" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tracks_description_trgm"
      ON "tracks" USING GIN ("description" gin_trgm_ops)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tracks_description_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tracks_genre_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tracks_title_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tracks_search_vector"`);
    await queryRunner.query(`ALTER TABLE "tracks" DROP COLUMN IF EXISTS "search_vector"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_artists_genre_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_artists_artistname_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_artists_search_vector"`);
    await queryRunner.query(`ALTER TABLE "artists" DROP COLUMN IF EXISTS "search_vector"`);

    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm`);
  }
}
