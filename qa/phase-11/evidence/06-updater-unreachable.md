# Updater unreachable runtime record

Date: 2026-08-05 (Asia/Shanghai)

## Operation

1. Started the real Tauri Desktop application with only the SkillHub process environment pointed at an unused local proxy address.
2. Kept system proxy, firewall, network settings, and the configured updater endpoint unchanged.
3. In English, opened Settings and ran environment diagnostics.
4. Repeated the diagnostic in Chinese.
5. Closed the isolated process and removed the process-scoped proxy environment.

## Expected

Updater access should be classified as unavailable, with a localized actionable network message and no endpoint, path, or raw transport error leakage.

## Actual

English displayed: `Unable to connect to the update server. Check your network connection, then try again.`

Chinese displayed the equivalent localized message: `无法连接更新服务器，请检查网络连接后重试。`

The diagnostic UI remained usable and no sensitive endpoint or internal path was shown.

## Result

Real Desktop updater-unreachable handling: **PASS**.

Evidence: `06-updater-unreachable-en.png` and `06-updater-unreachable-zh.png`.

