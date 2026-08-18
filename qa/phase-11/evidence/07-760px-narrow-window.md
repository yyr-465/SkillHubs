# 760px narrow-window runtime record

Date: 2026-08-05 (Asia/Shanghai)

## Operation

1. Changed the Tauri minimum window width from 900px to 760px.
2. Rebuilt the Rust desktop target and frontend.
3. Started the real Tauri Desktop application.
4. Resized the window to the 760px-class narrow layout.
5. Checked Dashboard, Settings diagnostics, Skills, and a scrolled Dashboard state in English and Chinese.

## Result

- No horizontal scrollbar was observed.
- Dashboard actions remained visible and usable.
- Settings diagnostic rows wrapped without overlap or clipping.
- Skills filters wrapped onto multiple rows without horizontal overflow.
- Dashboard empty state, scan warning, cards, and sample Skill remained readable.
- Vertical scrolling remained available for content below the viewport.

Light-theme evidence: `07-narrow-760-dashboard-zh.png`, `08-narrow-760-settings-zh.png`, `09-narrow-760-skills-zh.png`, `10-narrow-760-dashboard-en.png`, and `11-narrow-760-dashboard-scroll-en.png`.

Status: **PASS for the 760px light-theme check**. Additional dark-theme
evidence passed at the application's current minimum width (approximately
900px content / 939px outer window), because the runtime cannot be resized
below that minimum. Captures: `12-narrow-min-dark-dashboard.png` and
`14-narrow-min-dark-settings.png`.
