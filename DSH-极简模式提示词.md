# DSH 极简模式（minimal preset）提示词完整版

> 来源：开源仓库 [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)，默认分支 `master`
> 核对提交：`22ddee3`（2026-10-23，Merge PR #7075）
> 模型：`deepseek-flash` = **DeepSeek-V4.1-Flash-1017**（旧名 `deepseek-v4-flash` 已退役，仅作兼容接受）
> 整理日期：2026-10-26

---

## 一、系统提示词（系统 prompt）全文

极简模式发给模型的 system prompt **只有一句**：

```text
You are a helpful software engineer assistant.
```

就这一句，没有别的。完整版到此为止。

这不是摘要，也不是我压缩过的结果——DSH 的极简 preset 把 persona 设为 `complete: true`，所以 `renderPrompt` 会把所有其他 section 全部丢弃，只保留这一句。

### 权威出处（三重互证）

1. **preset 定义** `packages/bundle/web-app/presets/minimal.patch.yml:11-16`

   ```yaml
   - id: persona
     name: '@deepseek-ai/dsh-persona'
     config:
       prefix: You are a helpful software engineer assistant.
       complete: true
       includeRuntimeContext: false
   ```

2. **快照黄金文件** `snapshots/web/minimal-preset/system-prompt.expected.md`（内容即上面那一行）

3. **端到端测试断言的 inline snapshot** `apps/web/tests/minimal-preset.snapshot.ts`

   ```ts
   "prompt": "You are a helpful software engineer assistant.",
   "tools": ["bash", "read_image", "working_directory"],
   "goalCommand": false,
   ```

---

## 二、为什么只剩一句：机制说明

`packages/core/system-prompt/src/index.ts` 里的装配逻辑：

- `PromptSection.complete` —— 该 section 被当作**完整**系统提示词。
- 装配仍会跑完整的 waterfall（让 tools / contexts / variables 正常解析），但**结束后会把这一个 section 还原为唯一的 section**。
- 同时只允许存在一个有效 `complete` section，多于一个直接抛错：

  ```ts
  if (completeSections.length > 1) {
    throw new Error(`multiple complete prompt sections are active: ...`)
  }
  ```

- `includeRuntimeContext: false` 再额外调用 `suppressRuntimeContext()`，把「动态运行时上下文快照」也一并关掉。

对比 standard 模式的 persona 只有 `prefix: You are a coding agent powered by the {{model}} model.`，没有 `complete`，所以标准模式下 harness 身份、各工具的使用指引、plan mode、MCP、文件引用等 section 都会正常追加进去。

---

## 三、极简模式的完整组成

```yaml
# packages/bundle/web-app/presets/minimal.patch.yml
id: minimal
order: 3
plugins:
  - persona            # 唯一 prompt 来源，complete: true
  - tool-fs            # read: false, readImage: true, write: false, edit: false
  - compaction         # compaction-basic + command-compact（/compact 可用）
  - persistent-shell   # pty + 持久 shell 工具（按平台二选一）
```

### 3.1 模型看到的工具清单

**非 Windows（bash）：**

| 工具 | 说明 |
|---|---|
| `bash` | 持久会话的 bash |
| `read_image` | 读 PNG/JPEG/WebP/GIF |
| `working_directory` | 读取当前工作目录，或用 `cd` 切换 |

**Windows（pwsh，即你本机的情形）：**

| 工具 | 说明 |
|---|---|
| `bash`（实际注册名沿用工具位，底层为 `dsh-tool-pwsh-persistent`） | 持久会话的 PowerShell |
| `read_image` | 读图片 |
| `working_directory` | 读/切工作目录 |

注意 `tool-fs` 的开关 `read: false` / `write: false` / `edit: false` —— 极简模式**没有** `read` / `write` / `edit` 工具。读文件要靠 shell 命令（`sed -n`、`Get-Content` 等）。

### 3.2 `bash` 工具描述全文（模型可见的 tool description）

```text
Run commands in a bash shell
* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.
* Network access depends on the task environment. Prefer configured mirrors/proxies when they are available.
* State is persistent across command calls and discussions with the user.
* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.
* Please avoid commands that may produce a very large amount of output.
* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background.
```

参数 schema：

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": ["command"]
}
```

### 3.3 PowerShell 版工具描述全文（Windows 生效）

```text
Run commands in a PowerShell shell
* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.
* You don't have access to the internet via this tool.
* State is persistent across command calls and discussions with the user.
* Use native Windows paths (C:\...) and $env:NAME variables; this is PowerShell, not bash.
* Please avoid commands that may produce a very large amount of output.
* Please run long lived commands in the background, e.g. 'Start-Job' or start a server with Start-Process.
```

> ⚠️ 注意 Windows 分支的措辞与 bash 分支不一致：pwsh 版写的是「You don't have access to the internet via this tool」，bash 版写的是「Network access depends on the task environment」。这是上游原文，不是笔误。

### 3.4 其余两个工具的描述

```text
read_image:
Read a PNG/JPEG/WebP/GIF file and return the image itself. Large images are downscaled
automatically; do not install image libraries or create thumbnails to inspect an image.
  file_path: Path to the image file, resolved by the filesystem backend.

working_directory:
Read the current working directory, or change it with cd. Relative paths use the current
directory. Existing shells and running processes keep their own directories.
  cd: Existing directory to enter. Omit to read the current directory.
```

---

## 四、运行时上下文（runtime context）

极简模式配置了 `includeRuntimeContext: false`，正常情况下**不发**运行时上下文快照。

但快照会话文件 `snapshots/web/minimal-preset/session.v4.jsonl` 里记录了一条：

```text
Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

Current working directory: "<cwd>".
```

两者不矛盾：这是 `dsh-tool-fs` / 工作目录服务以 `required: true` 注册的**必需**上下文，`suppressRuntimeContext()` 只压制可选的贡献，`required` 的仍会保留。测试断言里明确写了这条：

```ts
expect(runtimeContexts).toEqual([
  `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\nCurrent working directory: ${JSON.stringify(cwd)}.`,
])
```

所以完整清单是：**1 句 system prompt + 1 条工作目录上下文 + 3 个工具 schema**。

---

## 五、如何在不改源码的前提下复现 / 定制

极简 preset 本质是普通 YAML 行，可在 profile 的 patch 里按 `id` 覆盖：

```yaml
- id: preset-minimal
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: minimal
    order: 3
    plugins:
      - id: persona
        name: '@deepseek-ai/dsh-persona'
        config:
          prefix: 你的自定义 system prompt
          complete: true          # 保留则仍然压制其他所有 section
          includeRuntimeContext: false
```

去掉 `complete: true` 即恢复为标准装配（harness 身份 + 各工具指引 + 运行时上下文都会回来）。

---

## 六、模型参数（顺带核对）

| 项 | 值 |
|---|---|
| API 模型名 | `deepseek-flash` |
| 模型版本 | DeepSeek-V4.1-Flash-1017 |
| 上下文长度 | 1M（`1_048_576`） |
| 最大输出 | 官方文档 384K；仓库 catalog 中 `max_output_tokens` 为 393,216，`maxTokens` 取 256,000 |
| 思考模式 | 支持非思考 / 思考（默认开启思考） |
| 视觉 | 支持 |
| 旧名兼容 | `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍接受，但已退役，实际由 V4.1-Flash 承接 |

仓库侧出处：`packages/llm/llm-deepseek/src/models.ts`（`id: 'deepseek-flash'`, `name: 'DeepSeek-V4.1-Flash'`）。

---

## 七、一句话总结

DSH 极简模式的「完整版最新版提示词」就是：

**`You are a helpful software engineer assistant.`**

其余一切（工具指引、运行时上下文、计划模式、文件引用、MCP 说明）都被 `complete: true` 主动舍弃，只靠 3 个工具 schema 和 shell 本身完成任务。这是刻意为之的 RL / 基线测试形态，不是缺失。
