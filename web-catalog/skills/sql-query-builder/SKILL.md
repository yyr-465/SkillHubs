---
name: SQL Query Builder
description: Draft readable, parameterized SQL queries for common reporting and lookup patterns.
category: data
risk: low
icon: 🗄️
---

# SQL Query Builder

A short guide to writing clear, parameterized queries.

## Select with filters

```sql
SELECT id, name, category
FROM skills
WHERE category = ? AND risk = ?
ORDER BY name
LIMIT 50;
```

## Tips

- Always use bound parameters, never string interpolation
- Add a `LIMIT` for list pages
- Index the columns you filter and sort by
