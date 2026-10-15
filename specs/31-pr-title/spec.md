# PR 标题机械检查

范围已在 2026-10-15 对话确认开始：仅补齐 #31 尚未落地的标题检查，保留既有 squash 与发布流程。

- 类型限定为 feat、fix、perf、refactor、style、test、docs、build、ci、chore。
- 范围可省略；填写时使用 core、store、server、web、ui、shell、views、deploy、edge、ci。
- 使用 Conventional Commits 的破坏性标记 `!`，描述包含中文且非空。
- PR 创建、更新、重新打开及编辑标题后重新验证；纳入主分支必过检查。
- Infra 验证合法与非法标题、破坏性标记和换行输入；不改变产品交互。
