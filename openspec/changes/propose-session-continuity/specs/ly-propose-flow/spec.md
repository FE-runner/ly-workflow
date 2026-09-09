## MODIFIED Requirements

### Requirement: 在委托 opsx:propose 之前询问一次"全自动 vs 手动"
`/ly:propose` SHALL 在调用 `Skill(opsx:propose)` **之前**询问用户一次："本次收尾走全自动（自动审查 + 自动实施 + 审完代码才停，非清零即停），还是手动逐步确认（每一步都问）？"。该询问 SHALL 是整条收尾编排链路里唯一决定"自动/手动"路径的开关询问，命令后续步骤 SHALL NOT 再重复询问"要不要继续自动"。该询问 SHALL 在 worktree 询问之后进行（若未隔离且用户选择切换 worktree，则当前会话先 cd 进新 worktree，随后**在同一会话内**进行本询问——不存在"下一次会话再询问"的交接）。该选择 SHALL NOT 影响"是否走 worktree"（是否隔离在 worktree 询问中独立决定，两者正交），SHALL NOT 决定"要不要走 review-plan"（两条路径下都有机会走，只是询问的时机和次数不同——全自动自动进入，手动先问要不要跑）。

#### Scenario: 询问只出现一次
- **WHEN** 用户执行 `/ly:propose "描述"`，选择"全自动"，自动流水线执行到审完代码
- **THEN** 命令只在最开始问过一次是全自动还是手动，之后的 apply/review-code 阶段不再重复询问"要不要继续自动"

#### Scenario: 已隔离时先问自动还是手动，不出现 worktree 询问
- **WHEN** 用户已在某个 worktree 内执行 `/ly:propose "描述"`
- **THEN** 命令跳过 worktree 询问，直接询问"全自动 or 手动"，随后进入生成/审查/实施流水线

#### Scenario: 切换 worktree 后同一会话内询问自动还是手动
- **WHEN** 用户在主工作区执行 `/ly:propose "描述"`，worktree 询问选择"切换"，baseline 验证通过
- **THEN** 当前会话 cd 进新 worktree 后立即进行"全自动 or 手动"询问，不结束会话、不开新会话，询问结果直接决定同一会话内后续编排路径
