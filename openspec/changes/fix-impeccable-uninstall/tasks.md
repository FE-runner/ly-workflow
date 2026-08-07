## 1. skill 目录：复制过滤 + 历史目录清理

- [ ] 1.1 新增显式映射表`CATEGORY_DIR_MAP: Record<SkillCategory, string>`（当前只需`impeccable: 'impeccable'`一条，但显式写成映射表，不假设分类标识=目录名——`inferCategory()`现有的`tool→tools`/`domain→domains`就不是同名），`installSkillFiles`（`installer.ts:353`）根据`ctx.config`算出被跳过的`SkillCategory`集合，查表得到对应模板/安装子目录名
- [ ] 1.2 `fs.copy(skillsTemplateDir, skillsDestDir, ...)` 加 `filter` 选项，路径命中被跳过分类的模板子目录前缀时返回 `false`
- [ ] 1.3 复制完成后，检查目标目录`~/.claude/skills/ly/<跳过的分类目录名>/`是否存在（覆盖本变更上线前的历史安装），存在则`fs.remove`整个子目录

## 2. 命令文件清理（用生成器固有指纹校验，不新增标记）

- [ ] 2.1 新增函数：扫描`templates/skills/<category>/`下当前定义的skill名称清单（复用已有的`collectInvocableSkills`，不重新写一套）
- [ ] 2.2 `installSkillCommands`（`skill-registry.ts:278`）生成前，先扫描`commandsDir`已存在文件，文件名命中"被跳过分类的当前skill名称清单"的，进入候选删除列表
- [ ] 2.3 候选文件做指纹校验：读取内容，检查是否同时命中`# <skill名称>`标题行与该skill的安装路径子串（`skillsInstallDir`+relPath+`SKILL.md`，或scripted类型的`run_skill.js`路径）——两者都命中才删；不命中则跳过并记录进`skippedCleanupFiles`
- [ ] 2.4 确认`generateCommandContent()`不需要改动——现有输出格式本身就是指纹来源，不新增标记字段

## 3. InstallResult 数据契约

- [ ] 3.1 `types/index.ts`的`InstallResult`新增字段：`removedSkillCommands: string[]`、`removedSkillDirectories: string[]`、`skippedCleanupFiles: string[]`
- [ ] 3.2 `installWorkflows()`（`installer.ts:1014`附近）的初始`result`对象里同步初始化这三个字段为空数组——不是只加类型定义，要确认初始值和所有失败路径都保持契约完整
- [ ] 3.3 `installSkillFiles`/`installSkillCommands`清理逻辑写入上述字段
- [ ] 3.4 `init.ts`安装总结里新增一段展示：删除了哪些命令/目录、跳过清理了哪些文件（附原因）

## 4. 范围确认（update仍执行清理，只是不提供切换入口）

- [ ] 4.1 确认`update.ts`调用路径（`init --skip-prompt`）下，如果配置里`skipImpeccable`已经是true，清理逻辑正常触发——不是"update完全跳过清理"
- [ ] 4.2 `init.ts`交互式流程里，"是否安装impeccable"提示旁补一句提示：以后要切换选择，需重跑`ly init`（不能靠`ly update`切换，但update会沿用你已选的配置执行清理）

## 5. 未来分类扩展的前置条件说明（不实现，只写清楚）

- [ ] 5.1 在`skill-registry.ts`的`SkillCategory`类型定义旁补一句注释：新增可选分类前，需先扩展这个联合类型、`inferCategory()`的目录映射、以及`CATEGORY_DIR_MAP`三处，清理逻辑本身届时可直接复用，不需要重写

## 6. 验证

- [ ] 6.1 场景1：本地模拟"历史安装"——用当前生成器实际跑一遍生成的命令内容作为历史fixture（不是手工模拟旧格式，避免掩盖兼容性问题），放进`~/.claude/skills/ly/impeccable/`和`~/.claude/commands/ly/`，重装选跳过，确认全部被清理
- [ ] 6.2 场景2：从未装过impeccable，选跳过，确认无删除动作无报错
- [ ] 6.3 场景3：在`~/.claude/commands/ly/`下放一个文件名撞车但内容不含对应路径子串的自定义文件，重装选跳过，确认该文件不被删、且`skippedCleanupFiles`里有记录
- [ ] 6.4 场景4：验证`fs.copy`的`filter`回调本身——断言跳过分类时`templates/skills/impeccable/`整个子树不出现在复制结果里
- [ ] 6.5 场景5：配置里`skipImpeccable`已是true，跑`update`（`init --skip-prompt`路径），确认清理逻辑同样触发
- [ ] 6.6 `pnpm typecheck && pnpm build && pnpm test` 过，新增单元测试覆盖 6.1-6.5 五个场景
