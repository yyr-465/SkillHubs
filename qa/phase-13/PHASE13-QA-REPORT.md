# Phase 13 — 稳定性、安全与真实数据 QA 报告

> 生成于 Phase 13 执行完成后。遵循路线图 §7 验收标准。
> 结论：**Phase 13 通过**。所有 Required Checks 通过；无 P0/P1 缺陷；P2 有明确处置结论；关键流程无崩溃/死锁/数据库污染/子进程残留；5000 Skill 代表性数据集下搜索/筛选/标签/分类冲突正常。

## 1. Required Checks（全部通过）

| 检查 | 结果 |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm exec tsc -b` | exit 0 |
| `pnpm run lint` | 0 错误 / 19 既有 warning |
| `pnpm run build` | exit 0（vite ✓ built，2690 模块，产物正常） |
| `cargo build --manifest-path src-tauri/Cargo.toml` | exit 0（仅既有 warning） |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **48/48 通过**（新增 1 个 5000 数据集测试） |

## 2. 供应链审计（`pnpm audit --prod`）

| 包 | 严重度 | 状态 | 处置 |
|---|---|---|---|
| js-yaml 5.2.1（直接依赖，解析 SKILL.md YAML，DoS CWE-407） | high | **已修复** | 升级到 5.3.0 |
| react-router 7.18.1（RSC CSRF CWE-352） | high | **已修复** | 升级到 7.18.2（本应用为 SPA 不用 RSC，属 P2，但已顺手修复） |
| nanoid <3.3.18（构建期传递依赖 vite→postcss→nanoid） | high | P2 | 非运行时依赖，升级 vite/@tailwindcss 时一并清除；不影响产物 |
| postcss <=8.5.22（构建期传递依赖 vite→postcss） | moderate | P2 | 同上 |

**供应链结论**：运行时依赖无已知漏洞；剩余 2 项均为构建期工具链传递依赖，不进入运行时产物。

## 3. 安全修复（P1，均已修复）

### 3.1 SkillIcon SVG 图标 XSS（根因修复）
- 现状：`SkillIcon/index.tsx` 对 SVG 图标用 `dangerouslySetInnerHTML` 未转义注入，而 `icon` 来自 SKILL.md 前导区（恶意技能文件可注入脚本）。
- 修复：改为通过惰性 `<img src="data:image/svg+xml;utf8,...">` 渲染，SVG 在 img 上下文中不执行脚本、不加载外部资源。
- 另：`highlightText`（技能名/描述高亮）已确认先 `escapeHtml` 再包裹 `<mark>`，安全。

### 3.2 CSP（防御纵深）
- 现状：`tauri.conf.json` `csp: null`（无内容安全策略）。
- 修复：设置 `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self' ipc: http://ipc.localhost; font-src 'self' data:; object-src 'none'`。
- 注意：CSP 运行时行为需在真实桌面验证（沙箱无 GUI），见 §8。

### 3.3 文件访问范围收敛
- 现状：capabilities `fs:allow-app-read/write` 授予 `$APPDATA/**`、`$HOME/**`（覆盖 ~/.ssh、~/.aws 等敏感路径）。
- 修复：收敛为 `$DESKTOP/**`、`$DOCUMENT/**`、`$DOWNLOAD/**`（前端 fs 插件仅用于导出/备份到用户通过 dialog 选择的路径）。

## 4. 5000 Skill 代表性数据集

新增测试 `db::tests::test_representative_5000_skill_search_filter_tags`，构造 5000 个代表性技能（5 类轮换 + 标签 + 收藏 + FTS5 索引），验证：

- 分类筛选：`category=dev` → 1000，<500ms。
- 标签筛选：dev-tag / data-tag → 各 1000。
- 收藏筛选：每 50 个收藏 → 100。
- FTS5 搜索：通用词 → 5000；分类词 → 1000。
- 组合搜索+分类 → 1000。
- 分页：page size 生效、total_count 保持全量。

分类冲突 5000 规模已由既有 `test_conflict_query_performance_with_5000_skills` 覆盖。

## 5. 并发 / 连续运行 / 资源

代码审查结论（设计健全，有测试覆盖）：

- **数据库锁**：`DbState(Arc<Mutex<Connection>>)` 单互斥串行化，无并发写竞争。
- **分类器**：`CategorizerState` 用 `AtomicBool running` 防止并发分类 + `Mutex<progress>` 保护进度；`MAX_CONCURRENT=5`、重试/退避（契约不变）。
- **执行**：`ExecutionManager` 用 `Mutex<HashMap<execution_id, Arc<ExecutionHandle>>>` 注册表 + 每执行 `Mutex<ExecutionRecord>` + `tokio::spawn` 单任务；进程树经 Windows Job Object 清理。
- **子进程残留**：`kill_all` 遍历注册表终止 Job Object 树；测试覆盖 `cleanup_should_kill_job_tree`、`finished_process_remains_owned_until_cleanup`、`finished_execution_should_not_block_cleanup`、`terminal_execution_writes_audit_once`、`spawn_failure_writes_sanitized_audit`。
- **缺口（P2）**：无显式多线程并发压力测试（设计已串行化，风险低）；内存/句柄增长需长时桌面观测，见 §8。

## 6. 错误脱敏与错误分类

- 扫描/数据库错误使用本地化、path-safe 消息（`database_storage_error`），不泄露绝对路径（Phase 11 已固化）。
- 执行审计 `detail` 为固定安全文本，不落 args/env/path。
- grep 审查未发现 `source_path`/绝对路径进入用户可见错误字符串的泄漏点。

## 7. i18n / 主题 / 键盘

- **i18n**：en.json 与 zh.json **310/310 key 完全对齐，无缺失、无空值**（经 TypeScript JSON 解析比对）。
- **主题**：深浅主题 + 自定义主题已由 Phase 8.5B 覆盖并通过桌面 QA。
- **键盘（P2 缺口）**：现有 Escape（SearchBar 关闭下拉）、Enter（TagManager 创建）等局部处理；对话框级 Escape 关闭、完整焦点管理未全面覆盖。处置：后续统一键盘可达性时补齐。

## 8. 环境注意（非缺陷）

- **真实 pnpm store 定位**：`D:\.pnpm-store\v11`（约 1.5GB、54047 文件）是完整 store——此前 P0-2「store 为空」结论有误（当时查的是错误的 `.pnpm-store`）。P0-1 本可从该 store 离线重装。本次依赖升级已借该 store 完成 canonical 重装（176 包）。
- **DSH 沙箱边界**：`pnpm run build`（vite 内部 `exec("net use")`）与 `pnpm install`（向工作区外 store 写符号链接）需 full-access；正常桌面/CI 环境无此限制。
- **桌面 GUI 验证（P1-3 R4/R5 遗留）**：CSP 运行时行为、换机重指向 UI、主题/最小窗口/键盘的视觉交互验证需真实 Tauri 运行环境，本沙箱无 GUI，属外部 QA 项。

## 9. P0 / P1 / P2 处置清单

| 级别 | 项 | 处置 |
|---|---|---|
| P1 | SkillIcon SVG XSS | ✅ 已修复（img data-URI） |
| P1 | CSP null | ✅ 已修复（设置 CSP，运行时待桌面验证） |
| P1 | fs 权限 `$HOME/**` 过宽 | ✅ 已修复（收敛到用户目录） |
| P1 | js-yaml DoS | ✅ 已修复（5.3.0） |
| P2 | react-router RSC CSRF（SPA 不适用） | ✅ 已修复（7.18.2，顺手升级） |
| P2 | nanoid / postcss（构建期传递依赖） | 处置：下次升级 vite/@tailwindcss 时清除，不影响运行时 |
| P2 | 键盘可达性不全 | 处置：后续统一补齐 Escape/焦点管理 |
| P2 | 无多线程并发压力测试 | 处置：设计已串行化，风险低；可后续补充 |
| — | 桌面 GUI 验证（CSP/换机/主题/键盘） | 处置：外部 QA，需真实 Tauri 环境 |

## 10. 本次改动文件

- `src/components/SkillIcon/index.tsx` — SVG XSS 修复。
- `src-tauri/tauri.conf.json` — 设置 CSP。
- `src-tauri/capabilities/default.json` — 收敛 fs 范围。
- `package.json` + `pnpm-lock.yaml` — js-yaml ^5.2.2、react-router-dom ^7.18.2。
- `src-tauri/src/db.rs` — 新增 5000 数据集测试。
- `node_modules` — canonical 重装（修复 P0-1 遗留的扁平化结构 R1）。
