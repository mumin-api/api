# 📚 Hadith Data Sources

## Recommended: Sunnah.com GitHub Repository

### Quick Setup

```bash
# 1. Clone the hadith data repository
git clone https://github.com/sunnah-com/hadith-json

# 2. Create seed-data directory
mkdir -p prisma/seed-data

# 3. Copy Sahih al-Bukhari data
cp hadith-json/bukhari.json prisma/seed-data/

# 4. Run seed script
npm run seed
```

## Alternative Sources

### 1. **Sunnah.com API**
- URL: https://api.sunnah.com/v1/hadiths/bukhari
- Format: JSON
- Free: Yes
- Arabic + English

### 2. **HadithAPI.com**
- URL: https://hadithapi.com/
- Format: REST API
- Free: Yes
- Multiple collections

### 3. **GitHub: fawazahmed0/hadith-api**
```bash
git clone https://github.com/fawazahmed0/hadith-api
```
- Multiple translations
- JSON format

## Sample Data (For Testing)

The seed script includes 3 sample hadiths for testing:

1. **Hadith 1** - Actions are by intentions
2. **Hadith 2** - Five pillars of Islam
3. **Hadith 3** - Definition of a Muslim

Run `npm run seed` to load sample data immediately.

## Full Data Structure

Expected JSON format:
```json
{
  "books": [
    {
      "bookNumber": 1,
      "hadiths": [
        {
          "hadithNumber": 1,
          "arabicText": "...",
          "arabicNarrator": "...",
          "englishText": "...",
          "englishNarrator": "...",
          "grade": "sahih",
          "reference": "Sahih al-Bukhari 1"
        }
      ]
    }
  ]
}
```

## Seeding Steps

1. **Download data** (choose one):
   - GitHub: `git clone https://github.com/sunnah-com/hadith-json`
   - Direct: Download bukhari.json

2. **Place in project**:
   ```bash
   mkdir -p prisma/seed-data
   cp bukhari.json prisma/seed-data/
   ```

3. **Run migrations**:
   ```bash
   npx prisma migrate dev
   ```

4. **Seed database**:
   ```bash
   npm run seed
   ```

5. **Verify**:
   ```bash
   npx prisma studio
   # Check Hadith and Translation tables
   ```

## Notes

- **Sahih al-Bukhari** contains ~7,563 hadiths
- Seeding takes ~5-10 minutes for full collection
- Sample data seeds in <1 second
- All data is free and open-source

## License

Hadith data is typically public domain or under permissive licenses. Always check the specific repository for license details.
