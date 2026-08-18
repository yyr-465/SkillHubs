---
name: Markdown to HTML
description: Convert Markdown documents into safe, sanitized HTML with configurable headings and code highlighting.
category: development
risk: low
icon: 📄
---

# Markdown to HTML

A documentation helper for turning Markdown into presentation-ready HTML.

## What it covers

- Headings, lists, tables, and blockquotes
- Fenced code blocks with syntax highlighting
- Safe HTML output (raw HTML is never passed through)

## Example

```js
import { markdownToHtml } from "./convert";

const html = markdownToHtml("# Hello");
console.log(html);
```

> This is a read-only catalogue example. It contains no execution declaration.
