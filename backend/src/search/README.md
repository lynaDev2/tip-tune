# Search Module

Full-text search for artists and tracks with filters, sorting, pagination, fuzzy matching, and autocomplete suggestions.

## Prerequisites

- **PostgreSQL** with `pg_trgm` extension (for fuzzy search).
- **Migration**: Run the search migration so `search_vector` columns and indexes exist:

```bash
# From backend directory; ensure .env DB_* vars are set
npm run migration:run
```

Migration adds:

- `pg_trgm` extension
- `search_vector` tsvector (generated) columns on `artists` and `tracks`
- GIN indexes for full-text search
- GIN trigram indexes for fuzzy matching

## API Endpoints

### `GET /api/search`

Search artists and/or tracks.

| Query       | Type            | Description                                                    |
|------------|------------------|----------------------------------------------------------------|
| `q`        | string (optional)| Search query (names, titles, genres, bios, descriptions)       |
| `type`     | `artist` \| `track` | Limit to artists or tracks; both when omitted              |
| `genre`    | string (optional)| Filter by genre                                                |
| `releaseDateFrom` | ISO date (optional) | Track release date from                              |
| `releaseDateTo`   | ISO date (optional) | Track release date to                                |
| `sort`     | string (optional)| `relevance` \| `recent` \| `popular` \| `alphabetical` \| `popular_tips` \| `popular_plays` (default: `relevance`) |
| `page`     | number (optional)| Page number (default: 1)                                       |
| `limit`    | number (optional)| Items per page (default: 10, max: 100)                         |

**Examples:**

- `GET /api/search?q=rock&type=track&genre=pop&sort=popular&page=1&limit=10`
- `GET /api/search?q=artist%20name&type=artist`
- `GET /api/search?releaseDateFrom=2020-01-01&releaseDateTo=2024-12-31&sort=recent`

### `GET /api/search/suggestions`

Autocomplete suggestions for artists and tracks.

| Query   | Type            | Description                          |
|--------|------------------|--------------------------------------|
| `q`    | string (required)| Partial query (min 2 characters)     |
| `type` | `artist` \| `track` (optional) | Limit to artists or tracks   |
| `limit`| number (optional)| Max suggestions (default: 10, max: 20) |

**Example:** `GET /api/search/suggestions?q=roc&limit=10`

## Features

- **Full-text search**: PostgreSQL `tsvector` / `to_tsquery` on artist names, genres, bios, track titles, genres, descriptions.
- **Fuzzy matching**: `pg_trgm` `similarity()` for typo tolerance.
- **Filters**: Genre, release date range (tracks only).
- **Sorting**: Relevance, most recent, most popular (tips/plays), alphabetical.
- **Pagination**: `page`, `limit`, `total`, `totalPages`.
- **Suggestions**: ILIKE-based autocomplete; min 2 characters.

## Unit Tests

```bash
npx jest src/search
```
