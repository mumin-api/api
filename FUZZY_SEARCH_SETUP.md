# Fuzzy Search Setup Guide

## Prerequisites

Your PostgreSQL database must support the `pg_trgm` extension.

## Installation Steps

### 1. Run the SQL Migration

Execute the migration script to enable `pg_trgm` and create indexes:

```bash
# Connect to your database
psql -d your_database_name -U your_username

# Run the migration
\i setup-pg-trgm.sql

# Or directly:
psql -d your_database_name -U your_username -f setup-pg-trgm.sql
```

### 2. Verify Installation

Check that the extension and indexes were created:

```sql
-- Check extension
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE indexname IN ('hadiths_arabic_text_trgm_idx', 'translations_text_trgm_idx');
```

### 3. Configure Feature Flag (Optional)

Add to your `.env` file:

```env
# Enable/disable fuzzy search (default: enabled)
ENABLE_FUZZY_SEARCH=true
```

Set to `false` to rollback to the legacy search method.

## How It Works

### Query Routing

1. **Empty/Invalid** → Returns empty results
2. **Pure number** (e.g., "27") → Numeric search with exact match priority
3. **Text** → Fuzzy search with trigram similarity

### Fuzzy Search Algorithm

1. **Validation**: Check for empty, too short, or invalid queries
2. **Dynamic Threshold**: Calculate based on query length
   - Short (< 10 chars): 0.5 threshold (strict)
   - Medium (10-30 chars): 0.3 threshold (balanced)
   - Long (> 30 chars): 0.25 threshold (lenient)
3. **Trigram Search**: Use PostgreSQL `similarity()` function
4. **Fallback**: If no results, use keyword search with stop word removal

### Examples

```typescript
// Exact match
search("Передавайте от меня аят")
// → Finds exact hadith

// Partial match (missing words)
search("Передавайте аята")
// → Finds "Передавайте (людям то, что вы услышите) от меня, даже если (дело будет касаться всего лишь одного) аята"

// With typos
search("Передоваите аят")
// → Still finds the hadith (1-2 typos tolerated)

// Numeric
search("27")
// → Finds hadith #27 first, then #1027, #270, etc.
```

## Performance

- **GIN Indexes**: Fast pre-filtering using `%` operator
- **Similarity Scoring**: Only calculated for pre-filtered rows
- **Expected Response Time**: < 200ms for most queries

## Troubleshooting

### Extension Not Found

```sql
ERROR:  extension "pg_trgm" is not available
```

**Solution**: Install PostgreSQL contrib package:
```bash
# Ubuntu/Debian
sudo apt-get install postgresql-contrib

# macOS (Homebrew)
brew install postgresql
```

### Slow Queries

If queries take > 500ms:

1. Check indexes exist: `\di hadiths_arabic_text_trgm_idx`
2. Analyze tables: `ANALYZE hadiths; ANALYZE translations;`
3. Check query plan: `EXPLAIN ANALYZE SELECT ...`

### No Results

If fuzzy search returns nothing:

1. Check threshold: Lower values = more results
2. Fallback activates automatically
3. Check logs for "falling back to keyword search"

## Rollback

To disable fuzzy search:

```env
ENABLE_FUZZY_SEARCH=false
```

To remove the extension:

```sql
DROP INDEX IF EXISTS hadiths_arabic_text_trgm_idx;
DROP INDEX IF EXISTS translations_text_trgm_idx;
DROP EXTENSION IF EXISTS pg_trgm;
```
