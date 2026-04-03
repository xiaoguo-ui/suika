# 撤销重做 Spec

> **一句话说清**：所有用户操作（画图、移动、删除、改属性等）都包装成实现 `ICommand` 接口（`redo`/`undo`）的命令对象，`pushCommand` 压入 undoStack 并清空 redoStack；Ctrl+Z 从 undoStack 弹出执行 `undo` 并压入 redoStack；Ctrl+Shift+Z 反过来。`Transaction` 封装了"记录旧值 → 修改 → 记录新值 → 提交"的流程，简化命令创建。

---

## 一、功能概述

用户的每一步操作都可以通过 Ctrl+Z 撤销、Ctrl+Shift+Z 重做。系统用两个栈（undoStack / redoStack）管理历史记录，每条记录是一个命令对象。

**涉及文件**：

| 文件 | 职责 |
|------|------|
| `commands/type.ts` | `ICommand` 接口定义（5 行：`desc` + `redo` + `undo`） |
| `commands/command_manager.ts` | 核心：双栈管理、undo/redo 执行、批量命令、禁用开关 |
| `commands/add_graphs.ts` | `AddGraphCmd`：画图/粘贴时添加新图形 |
| `commands/update_graphics_attrs_cmd.ts` | `UpdateGraphicsAttrsCmd`：移动/缩放/旋转/删除等属性变更 |
| `commands/set_elements_attrs.ts` | `SetGraphsAttrsCmd`：属性面板修改（颜色、圆角、可见性等） |
| `commands/macro.ts` | `MacroCmd`：多个命令打包成一个（undo 时反序执行） |
| `commands/reparent.ts` | `ReparentGraphsCmd`：图层拖拽换父容器 |
| `transaction.ts` | `Transaction`：封装"录旧 → 改 → 录新 → 提交"流程 |
| `host_event_manager/command_key_binding.ts` | 快捷键绑定（Ctrl+Z / Ctrl+Shift+Z） |
| `service/mutate_graphs_and_record.ts` | 属性面板操作封装（setX/setWidth/toggleVisible 等） |
| `service/remove_service.ts` | 删除操作封装（含清理空 Group） |

---

## 二、用户操作流程

| 步骤 | 用户做了什么 | 系统响应 |
|:----:|-------------|---------|
| 1 | 画一个矩形 | `AddGraphCmd` 压入 undoStack，redoStack 清空 |
| 2 | 移动矩形 | `UpdateGraphicsAttrsCmd` 压入 undoStack，redoStack 清空 |
| 3 | 按 Ctrl+Z | 从 undoStack 弹出移动命令 → 执行 `undo`（恢复位置）→ 压入 redoStack |
| 4 | 再按 Ctrl+Z | 从 undoStack 弹出画图命令 → 执行 `undo`（矩形消失）→ 压入 redoStack |
| 5 | 按 Ctrl+Shift+Z | 从 redoStack 弹出画图命令 → 执行 `redo`（矩形重现）→ 压入 undoStack |
| 6 | 画一个椭圆 | `AddGraphCmd` 压入 undoStack，**redoStack 被清空**（分叉了） |

---

## 三、业务规则

### 规则1：ICommand 接口只有三个字段——desc、redo、undo
- **代码线索**：`interface ICommand { desc, redo, undo }`
- **预期位置**：`commands/type.ts`
- **验证方法**：查看接口定义，确认只有三个成员
- **验证结果**：✅ 已找到
- **代码位置**：`commands/type.ts:1-5`
- **为什么这么设计**：这是 Command 模式的精髓——把操作封装成对象，只要求"做"和"撤"两个方法。所有命令类（`AddGraphCmd`、`UpdateGraphicsAttrsCmd`、`SetGraphsAttrsCmd`、`MacroCmd`）都实现这同一个接口，`CommandManager` 不关心具体是什么操作，只管调 `redo()` 或 `undo()`。如果接口更复杂（比如要求传参数），每种命令的实现就不统一了。`desc` 是给调试用的描述字符串，console.log 时能看到"Redo [Add Rect]"而不是"Redo [object Object]"。

### 规则2：pushCommand 只入栈不执行 redo
- **代码线索**：`pushCommand` 方法内没有调用 `command.redo()`
- **预期位置**：`command_manager.ts:128-151`
- **验证方法**：在代码中确认 pushCommand 只做 `undoStack.push` 和 `redoStack = []`
- **验证结果**：✅ 已找到
- **代码位置**：`command_manager.ts:128`（pushCommand 定义）
- **为什么这么设计**：调用 `pushCommand` 的时候，操作已经执行过了（比如矩形已经画在画布上了）。如果 pushCommand 再调一次 `redo()`，矩形就会被加两次。所以 pushCommand 只负责"记录这件事发生了"，不负责"做这件事"。这和有些实现里的 `execute + push` 模式不同——那种模式要求命令创建时操作尚未执行，由 `execute` 来首次执行。suika 选择了"先做再记"的方式，因为画图/移动等操作在拖拽过程中已经实时生效了，不需要延迟执行。

### 规则3：新操作清空 redoStack（历史分叉）
- **代码线索**：`this.redoStack = []` 在 `pushCommand` 内
- **预期位置**：`command_manager.ts:149`
- **验证方法**：撤销两步，然后做一个新操作，再按 Ctrl+Shift+Z，确认无法重做
- **验证结果**：✅ 已找到
- **代码位置**：`command_manager.ts:149`
- **为什么这么设计**：假设用户做了 A → B → C，撤销到 A，然后做了 D。此时历史线分叉了——B 和 C 已经不在当前时间线上。如果保留 redoStack，用户 redo 回到的 B/C 状态和 D 冲突（D 可能修改了 B/C 涉及的同一个图形）。所以新操作必须清空 redoStack，保证历史是一条线。这是所有主流编辑器（Photoshop、Figma、VS Code）的标准行为。

### 规则4：拖拽过程中禁用撤销重做
- **代码线索**：`disableRedoUndo` / `enableRedoUndo`、`when: (ctx) => !ctx.isToolDragging`
- **预期位置**：快捷键注册处 `command_key_binding.ts:37`、`command_manager.ts:116-121`
- **验证方法**：拖拽移动图形时按 Ctrl+Z，观察是否无反应
- **验证结果**：✅ 已找到
- **代码位置**：`command_key_binding.ts:37`（`when: !isToolDragging`）、`command_manager.ts:119`（`disableRedoUndo`）
- **为什么这么设计**：拖拽过程中每帧都在更新图形属性，但还没有 `pushCommand`（只有松手时才入栈）。如果此时允许 undo，会撤销上一次已入栈的操作，而当前拖拽的中间态还残留在画面上，数据和视觉不一致。两道防线：(1) 快捷键注册时 `when: !isToolDragging` 直接拦截按键；(2) `CommandManager` 内部 `isEnableRedoUndo` 标志位，缩放工具拖拽时主动调 `disableRedoUndo()`。

### 规则5：AddGraphCmd 用 deleted 标记实现软删除
- **代码线索**：`el.setDeleted(true/false)`、`el.removeFromParent` / `parent.insertChild`
- **预期位置**：`add_graphs.ts:11-29`
- **验证方法**：画一个矩形 → Ctrl+Z（消失）→ Ctrl+Shift+Z（重现），整个过程不创建新对象
- **验证结果**：✅ 已找到
- **代码位置**：`add_graphs.ts:11`（redo）、`add_graphs.ts:22`（undo）
- **为什么这么设计**：undo 画图时不能真正销毁图形对象——因为用户可能还会 redo 把它加回来。如果销毁了，redo 时就要重新创建，但新对象的 id 不同、引用不同，其他持有旧引用的地方（如 selectedElements）就断了。所以用 `setDeleted(true)` 做软删除：对象还在 `doc` 的全局 Map 里（通过 id 能找到），只是标记为已删除 + 从父容器的 children 中移除。redo 时 `setDeleted(false)` + `insertChild` 恢复。这样同一个对象在 undo/redo 间来回切换，引用始终有效。

### 规则6：UpdateGraphicsAttrsCmd 用属性快照实现通用撤销
- **代码线索**：`originAttrsMap`、`updatedAttrsMap`、`removedIds`、`newIds`
- **预期位置**：`update_graphics_attrs_cmd.ts:5-108`
- **验证方法**：移动一个矩形 → Ctrl+Z → 位置恢复；缩放 → Ctrl+Z → 大小恢复
- **验证结果**：✅ 已找到
- **代码位置**：`update_graphics_attrs_cmd.ts:5`
- **为什么这么设计**：移动改 transform、缩放改 width/height + transform、旋转改 transform、删除改 deleted 状态——这些操作看似不同，但本质都是"一组图形的属性从 A 变到了 B"。`originAttrsMap` 记录变更前的属性快照，`updatedAttrsMap` 记录变更后的。undo 就用 originAttrsMap 恢复，redo 就用 updatedAttrsMap 应用。一个类搞定所有属性变更类的撤销重做，而不需要 MoveCmd、ResizeCmd、RotateCmd、DeleteCmd 四个类。`removedIds` 和 `newIds` 处理删除和新增图形的场景——undo 删除操作时把图形恢复（`setDeleted(false)`），redo 时再删除。

### 规则7：Transaction 封装了"录旧 → 改 → 录新 → 提交"四步流程
- **代码线索**：`recordOld`、`update`、`commit`、`new Transaction(editor)`
- **预期位置**：`transaction.ts:6-77`
- **验证方法**：在 `mutate_graphs_and_record.ts` 中观察 Transaction 的使用模式
- **验证结果**：✅ 已找到
- **代码位置**：`transaction.ts:6`（类定义）、`mutate_graphs_and_record.ts:23`（使用示例）
- **为什么这么设计**：不用 Transaction 时，创建 `UpdateGraphicsAttrsCmd` 需要手动构造两个 Map（originAttrsMap 和 updatedAttrsMap），容易忘记录旧值或遗漏某个图形。Transaction 用链式调用 `recordOld → 执行修改 → update → commit` 统一流程，减少出错。`isCommitDone` 防止同一个 Transaction 提交两次（一旦提交就不能再改了）。`updateParentSize` 自动处理 Frame/Group 的尺寸联动——修改子元素后父容器可能需要调整大小，这个也要记入同一条命令。

### 规则8：MacroCmd 把多个命令打包成一个，undo 时反序执行
- **代码线索**：`MacroCmd`、`this.cmds`、`cmds.length - 1 → 0`
- **预期位置**：`commands/macro.ts:3-16`
- **验证方法**：分组操作（Ctrl+G）后 Ctrl+Z 一步撤回所有变更
- **验证结果**：✅ 已找到
- **代码位置**：`commands/macro.ts:3`
- **为什么这么设计**：有些操作逻辑上是一步但实际包含多个子命令。比如"分组"需要：(1) 创建 Group；(2) 移动子元素到 Group 下；(3) 调整 Group 尺寸。如果分成三条命令入栈，用户要按三次 Ctrl+Z 才能完全撤销，体验很差。MacroCmd 把这三条打包成一条，用户按一次 Ctrl+Z 就全撤销了。undo 时反序执行（`i = length-1 → 0`），因为后执行的命令可能依赖前面命令的结果——反序撤销保证依赖关系正确。

### 规则9：batchCommand 把连续操作标记为一组
- **代码线索**：`batchCommandStart`、`batchCommandEnd`、`isBatched`
- **预期位置**：`command_manager.ts:122-127`（标记）、`command_manager.ts:49-56`（redo 时批量处理）
- **验证方法**：用方向键连续微调图形位置，Ctrl+Z 一步撤回所有微调
- **验证结果**：✅ 已找到
- **代码位置**：`command_manager.ts:122`（batchCommandStart）、`command_manager.ts:49`（redo 批量逻辑）
- **为什么这么设计**：和 MacroCmd 不同，batch 模式用于"运行时才知道有多少个子命令"的场景。比如按住方向键连续移动，每次 keydown 都 pushCommand 一条移动命令，但这些应该作为一组撤销。MacroCmd 要求提前知道所有子命令，batch 模式只需要在开始时 `batchCommandStart`、结束时 `batchCommandEnd`，中间 push 的所有命令都标记 `isBatched=true`。undo/redo 时遇到 `isBatched` 会把连续的 batched 命令一起弹出一起执行。

### 规则10：每次 undo/redo 后自动触发渲染和状态通知
- **代码线索**：`this.editor.render()`、`this.emitStatusChange()`、`canRedo`/`canUndo`
- **预期位置**：`command_manager.ts:74-76`（redo 末尾）、`command_manager.ts:112-114`（undo 末尾）
- **验证方法**：Ctrl+Z 后画面立即更新；工具栏的撤销/重做按钮灰显状态正确变化
- **验证结果**：✅ 已找到
- **代码位置**：`command_manager.ts:74`（redo 渲染）、`command_manager.ts:112`（undo 渲染）、`command_manager.ts:152`（emitStatusChange）
- **为什么这么设计**：undo/redo 修改了图形属性但没有触发渲染，用户看不到变化。所以每次 undo/redo 末尾都调 `editor.render()` 强制刷新画面。`emitStatusChange` 通知 UI 层更新按钮状态——undoStack 为空时撤销按钮灰显，redoStack 为空时重做按钮灰显。这个事件也在 `pushCommand` 末尾触发，因为新操作清空了 redoStack，重做按钮需要变灰。

---

## 四、核心代码路径（完整调用链）

### 第 1 步：用户画矩形 → 命令入栈

```
用户松开鼠标
  → DrawGraphicsTool.onEnd()
    → new AddGraphCmd('Add Rect', editor, [graphics])
    → commandManager.pushCommand(cmd)
      ├─ emit('beforeExecCmd')                  ← 通知外部（如自动保存）
      ├─ console.log('[Exec] Add Rect')         ← 调试日志
      ├─ undoStack.push({ command: cmd })       ← [规则2] 只入栈不执行
      ├─ redoStack = []                         ← [规则3] 清空重做栈
      └─ emitStatusChange({ canUndo:true, canRedo:false })
```

---

### 第 2 步：用户移动矩形 → Transaction 流程

```
SelectMoveTool.onDrag（每帧）
  │  首次拖拽时创建 Transaction
  ├─ transaction = new Transaction(editor)
  ├─ transaction.recordOld(id, { transform: [...] })  ← 记录移动前的 transform
  ├─ 直接修改图形：graphics.setWorldTransform(newTf)   ← 操作已实时生效
  └─ editor.render()                                   ← 每帧都重绘

SelectMoveTool.onEnd
  ├─ transaction.update(id, { transform: [...] })      ← 记录移动后的 transform
  ├─ transaction.updateParentSize(elements)             ← 联动更新父 Frame 尺寸
  └─ transaction.commit('Update Graphics Attributes')
       → new UpdateGraphicsAttrsCmd(desc, editor, originMap, updatedMap)
       → commandManager.pushCommand(cmd)
```

---

### 第 3 步：Ctrl+Z → 撤销

```
用户按 Ctrl+Z
  → KeyBindingManager 匹配快捷键
    → when: !isToolDragging                    ← [规则4] 拖拽中不响应
    → commandManager.undo()
      │
      ├─ if (!isEnableRedoUndo) return         ← [规则4] 双重保险
      ├─ topCmdItem = undoStack.pop()
      │
      │  如果是 batched 命令 [规则9]：
      ├─ while (undoStack.at(-1).isBatched)
      │     cmdItems.push(undoStack.pop())     ← 把连续的 batched 命令都弹出
      │
      │  逐个执行 undo：
      ├─ for (cmdItem of cmdItems)
      │     console.log('[Undo] ...')
      │     redoStack.push(cmdItem)            ← 压入 redoStack
      │     cmdItem.hooks?.beforeUndo?.()      ← 可选的前置钩子
      │     command.undo()
      │       │
      │       │  如果是 AddGraphCmd [规则5]：
      │       ├─ el.setDeleted(true)           ← 软删除（不销毁对象）
      │       ├─ el.removeFromParent()         ← 从场景树移除
      │       └─ selectedElements.clear()
      │       │
      │       │  如果是 UpdateGraphicsAttrsCmd [规则6]：
      │       ├─ for ([id, attrs] of originAttrsMap)
      │       │     graphics.updateAttrs(attrs) ← 恢复旧属性
      │       ├─ removedIds → setDeleted(false) ← 恢复被删除的图形
      │       └─ newIds → setDeleted(true)      ← 删除新增的图形
      │       │
      │       │  如果是 MacroCmd [规则8]：
      │       └─ for (i = cmds.length-1; i >= 0; i--)
      │            cmds[i].undo()              ← 反序执行
      │
      ├─ editor.render()                       ← [规则10] 强制刷新画面
      └─ emitStatusChange({ canUndo:..., canRedo:true })
```

---

### 第 4 步：Ctrl+Shift+Z → 重做

```
用户按 Ctrl+Shift+Z
  → commandManager.redo()
    ├─ topCmdItem = redoStack.pop()
    ├─ （batched 逻辑同上）
    ├─ for (cmdItem of cmdItems)
    │     undoStack.push(cmdItem)
    │     command.redo()
    │       │
    │       │  如果是 AddGraphCmd：
    │       ├─ el.setDeleted(false)            ← 恢复图形
    │       ├─ parent.insertChild(el)          ← 重新挂到场景树
    │       └─ selectedElements.setItems([el]) ← 选中恢复的图形
    │       │
    │       │  如果是 UpdateGraphicsAttrsCmd：
    │       └─ for ([id, attrs] of updatedAttrsMap)
    │            graphics.updateAttrs(attrs)   ← 应用新属性
    │
    ├─ editor.render()
    └─ emitStatusChange(...)
```

---

### 第 5 步：属性面板修改 → 直接 pushCommand

```
用户在属性面板改颜色
  → MutateGraphsAndRecord.setCornerRadius(editor, elements, value)
    ├─ prevAttrs = elements.map(el => ({ cornerRadius: el.attrs.cornerRadius }))
    ├─ elements.forEach(el => el.attrs.cornerRadius = value)   ← 先改
    └─ commandManager.pushCommand(
         new SetGraphsAttrsCmd('update Corner Radius', elements, { cornerRadius }, prevAttrs)
       )                                                        ← 再记
```

---

## 五、耦合点

| 耦合系统 | 触发时机 | 为什么需要 |
|---------|---------|-----------|
| KeyBindingManager | Ctrl+Z / Ctrl+Shift+Z | 快捷键触发 undo/redo |
| SelectedElements | undo/redo 后 | AddGraphCmd.undo 清空选中、redo 恢复选中 |
| SceneGraph / render | undo/redo 后 | 属性变了必须重绘画面 |
| SuikaDocument | UpdateGraphicsAttrsCmd | 通过 id 查找图形对象（`doc.getGraphicsById`） |
| Transaction | 工具操作时 | 封装属性变更的录制和提交流程 |
| HostEventManager | 拖拽中 | `isToolDragging` 阻止拖拽中触发 undo |
| UI 工具栏 | emitStatusChange | 更新撤销/重做按钮的启用/禁用状态 |

---

## 六、架构设计决策（知其所以然）

### 为什么用"先做再记"而不是"命令执行"模式？
> 有些 Command 模式的实现是 `commandManager.execute(cmd)`，由 execute 来首次调 `cmd.redo()`。suika 的 `pushCommand` 不调 redo，因为画图、拖拽移动等操作在发生过程中（onDrag）就已经实时修改了图形属性并渲染了——用户拖着矩形在动，不可能等松手后才开始移动。所以 pushCommand 只是"这件事已经做了，记一笔"。这也是为什么 AddGraphCmd 的 redo 可以直接 `setDeleted(false)` 而不用重新 `new SuikaRect`——图形对象早就创建好了。

### 为什么用软删除（setDeleted）而不是真正销毁？
> 图形对象被很多地方引用——`doc` 的全局 Map、父容器的 children、selectedElements、命令对象自身。如果 undo 时真正销毁对象，所有这些引用都要清理；redo 时又要重新创建并恢复所有引用。用 `setDeleted(true)` 做软删除，对象始终存在于 `doc.graphicsStoreManager` 中，只是标记为不可见、从场景树移除。undo/redo 就是在 `true` 和 `false` 之间切换，引用关系完全不变。

### 为什么 UpdateGraphicsAttrsCmd 用 Map 而不是数组？
> `originAttrsMap` 和 `updatedAttrsMap` 的 key 是图形的 id。用 Map 而不是数组有两个好处：(1) 通过 id 可以直接 `doc.getGraphicsById(id)` 找到图形对象，不需要存对象引用（序列化友好）；(2) 同一个操作可能影响多个图形（批量移动），Map 天然去重，不会对同一个图形记两次。

### 为什么 MacroCmd 的 undo 要反序执行？
> 假设 MacroCmd 包含 [A, B, C] 三个子命令，执行顺序是 A → B → C。C 的结果可能依赖 B 的结果（比如 B 创建了一个 Group，C 把元素移到 Group 里）。如果 undo 也按 A → B → C 的顺序撤销，撤销 A 的时候 B 和 C 的结果还在，可能导致状态不一致。反序撤销 C → B → A 保证每一步撤销时后续步骤已经被撤回，依赖关系干净。

### 为什么属性面板的修改不用 Transaction？
> `setCornerRadius`、`toggleVisible` 等属性面板操作有的用 Transaction，有的直接用 `SetGraphsAttrsCmd`。区别在于：如果操作只改一个简单属性（圆角半径），直接 `new SetGraphsAttrsCmd` 更简洁——记录旧值、修改、入栈三行搞定。Transaction 适合"修改了多个图形的多个属性 + 需要联动更新父容器尺寸"的复杂场景（如移动、缩放）。两者最终都调 `pushCommand`，从 CommandManager 的角度看没有区别。

---

## 七、Transaction 应用实例：对齐 / 翻转 / 删除

以下操作全部复用 `Transaction` + `UpdateGraphicsAttrsCmd` 模式，没有引入新的架构概念。它们是"撤销重做"体系的消费者。

### 对齐（alignAndRecord）

- **文件**：`service/align_and_record.ts`（151 行）
- **触发**：选中 2 个以上图形 → 点对齐按钮（左对齐/居中/右对齐/顶对齐/垂直居中/底对齐）
- **算法**：计算所有选中图形的合并包围盒（`mergeBoxes`），根据对齐类型算出每个图形需要的 dx/dy 偏移量，修改 `worldTransform[4]/[5]`（平移分量）
- **优化**：如果所有图形已经对齐了（`isAlreadyAligned`），直接 return 不生成空命令
- **模式**：`transaction.recordOld → setWorldTransform → transaction.update → commit('Align Left')`

```
用户点"左对齐"
  → alignAndRecord(editor, AlignType.Left)
    ├─ mixedBBox = mergeBoxes(所有选中图形的 bbox)
    ├─ for each graphics:
    │     dx = mixedBBox.minX - bbox[i].minX    ← 算偏移量
    │     worldTf[4] += dx                       ← 改平移分量
    ├─ transaction.updateParentSize(graphicsArr)  ← Group 跟着调
    └─ transaction.commit('Align Left')           ← 入栈，可撤销
```

### 翻转（flipAndRecord）

- **文件**：`service/flip_and_record.ts`（71 行）
- **触发**：选中图形 → 右键菜单"水平翻转"/"垂直翻转"
- **算法**：以选中图形的中心点为翻转中心，构造矩阵 `translate(-center) → scale(-1, 1) → translate(center)`，左乘到每个图形的世界变换上（`prependWorldTransform`）
- **巧妙点**：水平翻转 `scale={x:-1, y:1}`，垂直翻转 `scale={x:1, y:-1}`，共用同一个 `flipAndRecord` 函数
- **模式**：和对齐完全一样——`recordOld → prependWorldTransform → update → commit`

### 删除（removeGraphicsAndRecord）

- **文件**：`service/remove_service.ts`（55 行）
- **触发**：选中图形 → 按 Delete/Backspace
- **流程**：
  1. 每个图形调 `removeFromParent()` + `setDeleted(true)`（软删除）
  2. 检查父 Group 是否变空——空则连带删除（见图层 spec 规则8）
  3. 递归标记所有子节点为已删除（如果删的是 Frame/Group）
  4. 用 `UpdateGraphicsAttrsCmd` 入栈，`removedIds` 记录所有被删除的 id
- **和其他操作的区别**：不用 Transaction，直接 `new UpdateGraphicsAttrsCmd` + `pushCommand`——因为删除只需要记录 removedIds，不需要 recordOld/update 属性变更对
