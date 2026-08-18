# Phase 11 开发任务

## 1. 目标

在不破坏已恢复用户环境的前提下，完成 Phase 11 剩余真实 Desktop 失败态、权限/网络/数据库模拟、760px 窄窗口和 clean VM 首次使用验收，并将所有结果归档为可发布判定使用的证据。

## 2. 当前状态

已有:

- 项目: `D:\ChatGPT\Codex\skillhubs\SkillHub`，React 19 + TypeScript + Vite + Tauri 2 + Rust + SQLite；包管理器为 pnpm。
- 项目根目录与 `SkillHub` 子目录各有 `AGENTS.md` 和 `MEMORY.md`。开始工作前必须读取实际仓库 `SkillHub\AGENTS.md` 与 `SkillHub\MEMORY.md`。
- 仓库在开始本任务前已经是 dirty；不得覆盖或回滚无关改动。
- Phase 11 总报告: `qa/phase-11/PHASE11-QA-REPORT.md`。
- 证据目录: `qa/phase-11/evidence/`。已归档截图均已人工检查，不包含用户名、绝对路径、数据库位置、API Key 或文件选择器。
- 当前应用环境已恢复到正常 PATH，Git 可用，SkillHub 正常启动，Skill 目录是未配置状态，Dashboard 显示首次设置和 0 Skills。
- QA fixtures 已清理；`qa/phase-11/fixtures/` 应为空。

已通过的真实 Desktop 验收:

- 未配置目录: 清除目录后回到“找到你的第一个 Skill”、0 Skills、可见“选择 Skill 目录”、只读示例 Skill。证据: `evidence/00-restored-unconfigured-light-wide.png`。
- 目录不存在: 真实 QA 目录删除后，显示 `Directory does not exist / 目录不存在. Choose another directory / 请选择其他目录。`，不泄露路径。证据: `evidence/01-directory-not-found-light-wide.png` 和深色/最小窗口变体。
- 目录为空: 真实空 QA 目录扫描后显示 0 Skills，且无不存在/非法 SKILL.md 警告。证据: `evidence/02-empty-directory-light-wide.png`。
- 非法 SKILL.md: 真实 malformed front matter 显示 `Invalid SKILL.md / SKILL.md 不合法. Check its front matter / 请检查文件头。`，不泄露路径。证据: `evidence/03-invalid-skill-light-min-width.png`。
- 其他 allowlist 依赖缺失: `skill-tool.exe` 缺失时，点击播放直接显示双语错误，系统确认没有 `skill-tool.exe` 进程。证据: `evidence/04-skill-tool-missing-preflight.png`。
- Git 缺失: 使用仅作用于 SkillHub 测试进程的 PATH 启动，预先验证同环境 `where.exe git` 找不到 Git。点击 Git QA Skill 后显示双语错误，系统确认没有 `git.exe` 进程。该项目前只有文字运行记录，缺少可归档截图。
- 环境恢复: Git、目录可读、数据库可写、updater 可访问；当前正常诊断仍会把未安装的 `skill-tool.exe` 标记为需要处理，这属于真实主机依赖缺失，已通过上面的 preflight 验证。
- Desktop Visual QA: 宽窗口浅色/深色、当前最小窗口浅色/深色均未观察到文字重叠、横向溢出、关键按钮遮挡。当前 Tauri 配置最小宽度为 900px，因此原要求的约 760px 不能执行。

本轮已经修复的产品问题:

- `src/pages/Dashboard/index.tsx`
  - 首次配置按钮曾因主题变量表现为可点击但不可见；已改为稳定前景/背景对比。
  - 已有 Skill 后原先没有目录切换入口；现在 Dashboard 顶部提供 `Change directory / 更换目录`。
  - 新增 `Clear directory / 清除目录`，只清空 `skill_directory` 配置并重新扫描，不删除任何 Skill 文件；用于恢复未配置状态。
  - 已选目录时显示 `A Skill directory is selected. / 已选择 Skill 目录。`，不显示名称或绝对路径。
- `src/pages/SkillDetail/index.tsx`
  - 不再显示 `skill.source_path`；原 Source Path 卡片会泄露工作区路径。现在显示通用 `Configured Skill directory / 已配置 Skill 目录`。
- `src/components/ExecutionPanel/index.tsx`
  - 执行弹窗使用与 Edit Skill 相同的 `bg-white/60 + backdrop-blur-[15px] + dark:bg-black/60` 遮罩，以及 `bg-card/95 + backdrop-blur-md` 卡片，底层详情不再可读。
- `src-tauri/src/execution/error.rs`
  - `DependencyMissing` 现在输出完整双语动作: install or configure PATH / 请安装或配置 PATH 后再运行。
- `src/i18n/en.json` 与 `src/i18n/zh.json`
  - 添加 `dashboard.changeDirectory`、`dashboard.clearDirectory`、`onboarding.directorySelected`、`skillDetail.sourceScope`、`skillDetail.configuredDirectory`。
- `MEMORY.md`
  - 已追加长期有效的 Phase 11 Desktop QA 设计决策和状态。

不要修改:

- 不要删除、覆盖或批量移动用户现有 Skill。
- 不要卸载 Git，不要永久修改系统 PATH、代理、防火墙、ACL 或网络设置。
- 不要直接修改正式数据库，不能读取、打印、复制 `.env`、token、API Key、私钥或其他凭据。
- 不要保存任何包含用户名、完整用户路径、数据库路径、命令参数、API Key 输入框或文件选择器的截图。
- 不要把 QA fixtures 扫描进正式用户数据库；所有新夹具必须在 `qa/phase-11/fixtures/` 下，完成后删除。
- 不要把“代码存在”当作运行时 PASS；必须有真实 Desktop 操作、可读结果、截图或受控运行记录。

## 3. 用户体验目标

用户应该感觉:

- 目录状态可被立即区分：未配置、目录不存在、目录为空、没有合法 SKILL.md、目录不可读。
- 选择目录后知道已经配置，但不会看到完整目录路径。
- 不存在、空目录、非法 SKILL.md 都有中英文问题说明和下一步动作。
- 当 Git 或其他 allowlist executable 缺失时，点击播放后会在创建子进程前立即得到可操作提示；没有裸露 `program not found`、Rust 错误或路径。
- 执行错误弹窗背景与 Edit Skill 一致：内容不可读、卡片不透明、错误与背景不重叠。
- Dashboard 无论是否已有 Skill，都能更换或清除目录；清除目录不删除文件。
- 深色、浅色、当前最小窗口下文字、按钮、错误卡片均可读且无横向溢出。

## 4. 技术要求

必须:

- 每次开始先检查 Git 状态，保留现有用户改动。
- 所有截图按稳定文件名保存到 `qa/phase-11/evidence/`，并在保存前检查敏感信息。
- 每个验证项在 `PHASE11-QA-REPORT.md` 记录夹具、操作、预期、实际、证据和 PASS/FAIL/BLOCKED。
- 对缺失 Git 使用进程级隔离 PATH：先用同一环境 `where.exe git` 验证找不到，再启动 SkillHub；结束后停止隔离进程并以正常 PATH 重启。
- 对缺失 allowlist executable 使用真实 QA Skill 的 `execution.command`，由正常 UI 点击播放触发；再用进程检查证明没有目标进程。
- 对权限、数据库和 updater 模拟使用临时 QA 数据/进程级配置；不可修改正式数据库、用户 ACL 或系统网络设置。
- 继续维持不显示绝对路径的契约；不允许重新引入 `skill.source_path` 到用户界面或截图。
- 若改变 API/状态契约，先更新 `Tech-Spec.md` 或等价契约；当前未计划此类变更。
- 继续使用最小修改，不引入新依赖或无关重构。

已知构建与验证命令:

- `pnpm exec tsc --noEmit`
- `pnpm run build`
- `pnpm run lint`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo build --manifest-path src-tauri/Cargo.toml`
- `pnpm tauri build --bundles nsis`

注意:

- 本地 `pnpm tauri build --bundles nsis` 会成功生成 `src-tauri/target/release/skillhub.exe` 和 NSIS installer，但最终因没有 `TAURI_SIGNING_PRIVATE_KEY` 退出非零。这是本地 updater 签名限制，不是桌面构建失败；不得读取或设置该密钥。
- 直接 `cargo build --release` 不能替代 `pnpm tauri build` 做桌面视觉验证，因为前者可能保留 dev URL / 内嵌资源状态。
- 当前 `tauri.conf.json` 设置 `minWidth: 900`，与 Phase 11 的约 760px 要求冲突。不要擅自降低；先在报告中保持 BLOCKED，除非用户明确授权改变最小宽度。

## 5. 执行流程

Step0 分析现状

1. 阅读 `SkillHub/AGENTS.md`、`SkillHub/MEMORY.md`、`qa/phase-11/PHASE11-QA-REPORT.md` 和本文件。
2. 检查 `git -C SkillHub status --short`，确认 QA fixtures 为空、SkillHub 是否以正常 PATH 运行。
3. 检查证据目录是否有敏感截图；历史根目录 `desktop-qa-*.png` 不可作为 Phase 11 证据，因为其中曾出现路径/桌面/API Key 输入框。

Step1 补齐目录不可读

1. 创建仅位于 `qa/phase-11/fixtures/unreadable-directory/` 的夹具。
2. 记录 ACL 后只对该夹具进行最小可恢复权限模拟；先验证模拟生效。
3. 在真实 SkillHub 中配置、扫描并取得中英文权限提示和重新选择操作。
4. 恢复原 ACL，重新验证可读取，并删除夹具。
5. 如果本机无法安全模拟 ACL，标记 BLOCKED，不要改用户目录权限。

Step2 补齐数据库不可写

1. 只能使用临时应用数据目录和临时数据库；不能修改正式数据库。
2. 找出项目是否已有开发/QA 应用标识或可配置 app data path。若没有安全测试入口，先记录 BLOCKED，不要直接改变用户数据库 ACL。
3. 对临时数据库模拟不可写，运行环境诊断，验证无数据库路径泄露的可操作中英文提示。
4. 恢复临时数据库权限并复核正常可写。

Step3 补齐 updater 不可访问

1. 优先使用仅对 SkillHub 测试进程生效的 endpoint/proxy 覆盖；不得永久改代理或关闭网络。
2. 运行环境诊断，确认 updater 显示不可访问和网络/代理处理建议。
3. 恢复后重新诊断，必须显示 updater 可访问。

Step4 补齐 Git 缺失截图

1. 再创建短生命周期 `git-missing` QA fixture。
2. 用进程级 PATH 启动，先记录 `where.exe git` 失败。
3. 进入 Git QA Skill，点击播放，截取不含路径、背景不可读、具有双语错误和重试按钮的弹窗。
4. 检查 `git.exe` 不存在，记录后停止隔离进程、删除夹具、恢复无目录状态。

Step5 760px 与 clean VM

1. 760px: 当前状态为 BLOCKED，因为应用的 `minWidth` 为 900。只有用户授权改变产品最小宽度后，才能修改 `tauri.conf.json` 并重新运行浅色/深色 760px QA。
2. clean VM: 必须使用真正干净 Windows VM 或新 Windows 用户环境；不得把当前开发机当作等价物。计时从首次启动到通过 UI 选择含合法 SKILL.md 的目录并看到第一个真实 Skill，目标不超过 5 分钟。保存无敏感信息的首次启动、目录选择、扫描结果截图。

Step6 恢复与汇报

1. 删除所有明确位于 `qa/phase-11/fixtures/` 的夹具。
2. 停止隔离启动的 SkillHub，确认正常 PATH 下 Git 可用。
3. 使用 Dashboard `Clear directory / 清除目录` 恢复未配置状态，确保不删除 Skill 文件。
4. 启动正常 SkillHub，运行诊断并确认 Git 可用、数据库可写、updater 可访问、目录提示“请选择 Skill 目录”。
5. 更新 `PHASE11-QA-REPORT.md`、`MEMORY.md`（仅长期结论，不记录凭据或路径），并给出明确的 PASS/CONDITIONAL PASS/FAIL。

## 6. 验收标准

功能:

- 已通过: 未配置目录、目录不存在、目录为空、非法 SKILL.md、Git 缺失、`skill-tool.exe` 缺失、正常恢复。
- 仍需通过: 目录不可读、数据库不可写、updater 不可访问、clean VM 首次使用。
- 执行依赖缺失必须在 spawn 前阻止；目标 executable 进程不得出现。
- 清除目录只改配置，不删除用户 Skill 文件。

代码:

- TypeScript 类型检查通过；相关 Rust 测试和 build 通过。
- 错误状态不得依赖解析原始系统错误文本。
- UI、错误、日志和截图不得包含绝对路径、环境变量、数据库位置、stack trace、凭据或 API Key。
- 对任何新修复增加聚焦测试；当前已有 `execution::manager::tests::spawn_failure_writes_sanitized_audit` 覆盖失败审计。

UI:

- 已通过: 宽窗口浅色/深色和 900px 最小窗口浅色/深色；错误卡片、目录动作、示例 Skill、执行弹窗可见且可读。
- 仍 BLOCKED: 约 760px 宽窗口，因为产品最小宽度为 900px。
- 执行弹窗必须与 Edit Skill 遮罩观感一致，底层内容不可读。

验收报告:

- 每项必须有 PASS、FAIL 或 BLOCKED；不得以代码阅读代替真实 Desktop PASS。
- 当前 Phase 11 结论是 `CONDITIONAL PASS`，绝不能宣称全面完成，直到所有 BLOCKED 项完成。

## 7. 输出格式

每一步报告:

修改文件:
- 列出绝对路径和修改目的；没有修改则写“无”。

原因:
- 说明该步骤验证的用户风险和验收项。

测试:
- 操作步骤。
- 预期结果。
- 实际结果。
- PASS、FAIL 或 BLOCKED。
- 关联截图或日志文件。

风险:
- 剩余风险。
- 环境是否已恢复。
- 是否存在无法在当前机器完成的验证。

最终汇报:

- 已通过项目。
- 未通过/阻塞项目及客观原因。
- 测试命令和结果。
- Desktop Visual QA 证据目录。
- clean VM 实际耗时（若未执行则明确 BLOCKED）。
- 环境恢复检查结果。
- Phase 11 最终结论。
- `MEMORY.md` 是否更新及摘要。
