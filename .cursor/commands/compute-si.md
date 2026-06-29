# Super-investor compute chain

Staging unless user confirms prod:

```bash
npm run db:fix-shp-pct-100
npm run db:compute-si:all
npm run validate:si-data
```

Optional refresh after compute:

```bash
npm run db:refresh-si-views
```
