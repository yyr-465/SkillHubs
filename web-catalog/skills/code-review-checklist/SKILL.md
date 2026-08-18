---
name: Code Review Checklist
description: A bilingual checklist for reviewing pull requests with empathy and rigor.
category: development
risk: low
icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect width="24" height="24" rx="5" fill="#6366f1"/><path d="M7 12l3 3 7-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
---

# Code Review Checklist

## Core principles

- Readability first
- One change per pull request
- Tests where it matters

## What to check

- [ ] Correctness and edge cases
- [ ] Security: input handling, secrets, permissions
- [ ] Consistency with the existing codebase
- [ ] Clear naming and comments where needed

## Quick reference

| Area | Question |
| --- | --- |
| Correctness | Does it do what the description says? |
| Security | Does it handle untrusted input safely? |
| Tests | Is the critical path covered? |
