# Database not writable evidence

## Operation

1. Started the QA Desktop build with an isolated temporary application-data
   profile outside the repository.
2. Made only the temporary SQLite database file non-writable; the formal user
   database was not touched.
3. Ran Environment diagnostics and attempted a scan.

## Result

The real Desktop UI displayed the localized actionable message:

- `Database storage is not writable. Check storage permissions or available disk space, then try again.`
- `数据库存储不可写。请检查存储权限或可用磁盘空间，然后重试。`

No database path or system error was shown. The application remained usable via
the in-memory schema fallback, and the temporary profile was removed after the
test.
