# Data Sanitizer

A checklist for handling untrusted input defensively.

## Always

- Validate length, type, and allowed characters at the boundary
- Encode output for its context (HTML, SQL, shell, URL)
- Prefer allowlists over denylists

## Never

- Build SQL by string concatenation
- Render raw HTML from user input
- Pass user input directly to a shell

## Pipeline

```text
validate → normalize → encode → store
```

