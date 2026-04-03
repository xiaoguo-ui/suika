# 文本工具 Spec

> **一句话说清**：文本工具通过点击画布创建一个 `SuikaText`，同时激活 `TextEditor`（一个隐藏的 `<input>` 做输入代理），用户输入的字符实时更新到 `SuikaText.content`，并通过 `calcTextSize` 自动调整宽高。光标和选区通过 `RangeManager` 管理，绘制在 Canvas 叠加层上。Esc 或失焦退出编辑，空文本自动删除。

---

## 一、功能概述

用户用文本工具在画布上点击，创建一个文本元素并立刻进入编辑模式。支持键盘输入、IME 中文输入、退格删除、方向键移动光标、Shift+方向键选区、Ctrl+A 全选、复制、剪切。退出编辑后文本固化为普通图形元素，可移动/缩放/旋转。

**涉及文件**：

| 文件 | 职责 |
|------|------|
| `tools/tool_draw_text.ts` | `DrawTextTool`：文本工具，仅在 `onEnd` 时调用 `textEditor.active()` |
| `text/text_editor.ts` | `TextEditor`：文本编辑核心，管理隐藏 input、键盘/鼠标事件、激活/退出 |
| `text/range_manager.ts` | `RangeManager`：光标位置和选区范围管理 + 光标线/选区矩形绘制 |
| `graphics/text.ts` | `SuikaText`：文本图形类，`_realDraw` 用 `ctx.fillText`、字形信息计算 |
| `geo/geo_text.ts` | `calcGlyphInfos` / `calcTextSize`：用 Canvas 2D `measureText` 计算排版 |

---

## 二、用户操作流程

| 步骤 | 用户做了什么 | 系统响应 |
|:----:|-------------|---------|
| 1 | 按 T 键或点工具栏 | 切换到文本工具，光标变为十字 |
| 2 | 在画布上点击 | 创建空 `SuikaText`，进入文本编辑模式，隐藏变换手柄 |
| 3 | 键盘输入文字 | 字符追加到 `content`，文本宽高实时自适应 |
| 4 | 中文输入法打字 | IME 组合中间状态实时预览，确认后固化 |
| 5 | 按退格/Delete | 删除光标前/后一个字符 |
| 6 | 方向键左/右 | 移动光标位置 |
| 7 | Shift + 方向键 | 扩展/缩小选区 |
| 8 | Ctrl+A | 全选文本内容 |
| 9 | Ctrl+C / Ctrl+X | 复制/剪切选中文本 |
| 10 | 鼠标点击文本内部 | 光标定位到点击处最近的字形间隙 |
| 11 | 鼠标拖拽 | 从点击处到拖拽处形成选区（蓝色半透明） |
| 12 | 按 Esc 或点击外部 | 退出编辑模式；如果文本为空则自动删除 |
| 13 | 双击已有文本 | 重新进入文本编辑模式 |

---

## 三、业务规则

### 规则1：DrawTextTool 极简——只做一件事：调用 textEditor.active()
- **代码线索**：`DrawTextTool.onEnd` → `editor.textEditor.active({ pos })`
- **预期位置**：`tool_draw_text.ts:32-39`
- **验证方法**：按 T 点击画布，观察是否立刻出现光标闪烁
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_text.ts:36`
- **为什么这么设计**：文本工具的交互模式和矩形/椭圆完全不同——矩形是"拖拽画形状"，文本是"点击进入编辑"。`DrawTextTool` 的 `onStart/onDrag` 都是空操作，只在 `onEnd`（点击松手）时创建文本并进入编辑。工具本身不需要管输入逻辑，全部委托给 `TextEditor`，职责非常清晰。`keepToolSelectedAfterUse` 设置为 false 时，创建后自动切回选择工具。

### 规则2：TextEditor 用隐藏 input 做输入代理，而不是 Canvas 原生文本输入
- **代码线索**：`createInputDom()`、`position: 'fixed'`、`opacity: 0`、`zIndex: '-1'`
- **预期位置**：`text_editor.ts:11-20`（样式）、`text_editor.ts:39-44`（创建）
- **验证方法**：进入文本编辑模式后检查 DOM，会发现一个隐藏的 `<input>` 元素
- **验证结果**：✅ 已找到
- **代码位置**：`text_editor.ts:11`（defaultInputStyle）、`text_editor.ts:39`（createInputDom）
- **为什么这么设计**：Canvas 没有原生的文本输入能力。要在 Canvas 上实现文本编辑，需要一个 DOM 元素接收键盘事件和 IME 输入，然后把输入内容转发到 Canvas 绘制。隐藏 input 的技巧：`opacity: 0` 让它不可见，`position: fixed` 放在光标附近（这样 IME 候选框也出现在光标旁），`zIndex: -1` 不遮挡画布。每次进入编辑模式调 `inputDom.focus()` 抢焦点。这是 Canvas 文本编辑器的标准方案（Figma、Excalidraw 也用类似手法）。

### 规则3：输入事件分两路——直接输入 vs IME 组合输入
- **代码线索**：`e.isComposing`、`composingText`、`leftContentWhenComposing`、`compositionend`
- **预期位置**：`text_editor.ts:151-200`（input 事件处理）、`text_editor.ts:301-305`（compositionend）
- **验证方法**：切换到中文输入法打 "nihao"，观察拼音实时预览，确认后变成 "你好"
- **验证结果**：✅ 已找到
- **代码位置**：`text_editor.ts:157`（isComposing 判断）、`text_editor.ts:301`（compositionend）
- **为什么这么设计**：英文直接输入 `e.data` 就是最终字符，直接拼接到 content。中文/日文等 IME 输入时 `e.isComposing = true`，`e.data` 是中间拼音，不能直接覆盖——需要保留拼音前后的原始文本（`leftContentWhenComposing` / `rightContentWhenComposing`），每次 input 事件用 `左 + 拼音 + 右` 拼接预览内容。直到 `compositionend` 触发，拼音被替换为最终汉字，`composingText` 清空。如果不做这个分路，中文输入会出现字符重复或丢失。

### 规则4：文本宽高随内容自适应（autoFit）
- **代码线索**：`updateTextContentAndResize`、`calcTextSize`、`tmpCtx.measureText`
- **预期位置**：`text_editor.ts:136-142`（静态方法）、`text.ts:53-58`（构造函数 autoFit）
- **验证方法**：输入一段长文本，观察文本框自动变宽；删除文字，文本框自动缩短
- **验证结果**：✅ 已找到
- **代码位置**：`text_editor.ts:136`（updateTextContentAndResize）
- **为什么这么设计**：每次内容变化都调 `calcTextSize` 用 `ctx.measureText(content)` 重新测量宽度和高度，然后 `updateAttrs({ content, width, height })`。宽度完全由文本内容决定（单行文本，不换行），高度由 `fontBoundingBoxAscent + fontBoundingBoxDescent` 决定。这比固定宽度然后换行简单得多——当前实现只支持单行文本。如果以后要支持多行/自动换行，需要引入段落排版引擎。

### 规则5：光标定位用二分查找字形位置
- **代码线索**：`getCursorIndex`、`binary search`、`glyphs[mid].position.x`
- **预期位置**：`text.ts:158-184`
- **验证方法**：在文本中间点击，观察光标出现在最近的字符间隙
- **验证结果**：✅ 已找到
- **代码位置**：`text.ts:158`（getCursorIndex）
- **为什么这么设计**：先用 `applyInverseMatrix` 把鼠标世界坐标转成文本本地坐标，然后对字形位置数组做二分查找找到 `point.x` 落在哪两个字形之间，取较近的那个。字形位置数组是 `calcGlyphInfos` 预计算的，每个字符的 x 坐标递增（因为是单行从左到右），天然有序，所以二分查找 O(log n) 效率很高。如果用线性查找 O(n) 在字符很多时会慢。同时处理了边界：`left === 0` 返回 0（光标在最前），`left >= glyphs.length` 返回末尾。

### 规则6：选区管理用 start/end 模型，绘制时转换成视口坐标
- **代码线索**：`IRange { start, end }`、`getSortedRange()`、`getCursorLinePos()`、`drawRange`
- **预期位置**：`range_manager.ts:6-9`（IRange）、`range_manager.ts:89-129`（getCursorLinePos）、`range_manager.ts:131-170`（draw）
- **验证方法**：Shift+右方向键扩大选区，观察蓝色高亮；鼠标拖选也有蓝色高亮
- **验证结果**：✅ 已找到
- **代码位置**：`range_manager.ts:6`（IRange）、`range_manager.ts:131`（draw）
- **为什么这么设计**：`start` 是锚点（不动的一端），`end` 是活动端（跟随光标/键盘移动的一端）。`start === end` 时没有选区，只绘制光标线（竖线）；`start !== end` 时绘制选区矩形（半透明蓝色填充）。`getSortedRange()` 返回 `rangeLeft/rangeRight`（保证 left <= right），因为 `start` 可能大于 `end`（从右往左选）。绘制时把字形本地坐标 → 世界坐标 → 视口坐标（`editor.toViewportPt`），保证缩放/平移后光标和选区位置正确。

### 规则7：退出编辑时空文本自动删除，非空文本提交 Transaction
- **代码线索**：`inactive()`、`!content → removeGraphicsAndRecord`、`transaction.commit`
- **预期位置**：`text_editor.ts:115-134`
- **验证方法**：进入编辑不输入任何内容直接 Esc，文本元素消失；输入内容后 Esc，文本保留且 Ctrl+Z 可撤销
- **验证结果**：✅ 已找到
- **代码位置**：`text_editor.ts:119`（空判断）、`text_editor.ts:122`（commit）
- **为什么这么设计**：空文本在画布上不可见，留着只会污染图层面板。所以 `inactive()` 检查 `content` 是否为空——空则直接调 `removeGraphicsAndRecord` 删除（可撤销）。非空则用 `Transaction` 记录变更（进入编辑时 `recordOld` 记录原始 content/width，退出时 `update` 记录新值，`commit` 入栈 `UpdateGraphicsAttrsCmd`），确保 Ctrl+Z 可以撤销回编辑前的状态。退出时还恢复 `enableTransformControl=true` 和 `enableDrawSizeIndicator=true`，让选中框和变换手柄重新出现。

### 规则8：字形信息（Glyph）由 calcGlyphInfos 预计算并缓存
- **代码线索**：`_glyphs`（缓存）、`calcGlyphInfos`、`ctx.measureText(c)`（逐字符测量）
- **预期位置**：`text.ts:131-138`（getGlyphs 缓存逻辑）、`geo_text.ts:28-52`（calcGlyphInfos）
- **验证方法**：连续调用 `getGlyphs()` 两次，第二次直接返回缓存不重新计算
- **验证结果**：✅ 已找到
- **代码位置**：`text.ts:131`（getGlyphs）、`geo_text.ts:28`（calcGlyphInfos）
- **为什么这么设计**：`calcGlyphInfos` 遍历 content 的每个字符，调 `ctx.measureText(c)` 获取宽度、高度、baseline 偏移，然后累加 x 坐标生成字形数组。末尾额外加一个宽度为 0 的虚拟字形（代表文本末尾光标位置）。`SuikaText._glyphs` 做了缓存——只有 content、fontSize、fontFamily 变化时才清空（`updateAttrs` 中 `_glyphs = null`）。因为字形测量需要调用 Canvas API，频繁测量有性能开销，缓存避免重复计算。`fontKerning = 'none'` 关闭字距调整，保证逐字符测量的累加宽度和 `fillText` 整体渲染一致。

### 规则9：键盘事件在隐藏 input 上处理，不走全局快捷键
- **代码线索**：`inputDom.addEventListener('keydown')`、Backspace/Delete/ArrowLeft/ArrowRight/Ctrl+A/C/X
- **预期位置**：`text_editor.ts:202-296`
- **验证方法**：文本编辑模式下按退格删字，按方向键移动光标；不会触发全局快捷键
- **验证结果**：✅ 已找到
- **代码位置**：`text_editor.ts:202`（keydown 监听）
- **为什么这么设计**：隐藏 input 独占焦点后，键盘事件先到 input，不会冒泡到 `HostEventManager` 的全局监听。这天然隔离了文本编辑和全局快捷键——编辑模式下按 Backspace 是删字而不是删除图形，按方向键是移动光标而不是微调图形位置，Ctrl+A 是全选文本而不是全选图形。不需要额外加 `if (textEditor.isActive()) return` 这样的守卫代码（虽然某些地方也加了双重保险）。Esc 键在 input 上直接调 `inactive()` 退出编辑。

### 规则10：文本渲染用 ctx.fillText，先 translate 到 baseline 位置
- **代码线索**：`ctx.translate(0, fontBoundingBoxAscent)`、`ctx.fillText(content, 0, 0)`
- **预期位置**：`text.ts:106-108`
- **验证方法**：画一个文本，观察文字基线正确对齐
- **验证结果**：✅ 已找到
- **代码位置**：`text.ts:107`（translate）、`text.ts:108`（fillText）
- **为什么这么设计**：Canvas 的 `fillText(text, x, y)` 默认 y 是文字基线（baseline）位置，不是左上角。`SuikaText` 的包围盒原点是左上角，所以 draw 时先 `ctx.translate(0, fontBoundingBoxAscent)` 把坐标原点移到基线位置，再 `fillText(content, 0, 0)` 在基线上绘制。`fontBoundingBoxAscent` 是从基线到字体顶部的距离，正好等于从包围盒顶部到基线的距离。如果不做这个偏移，文字会向上"跑出"包围盒。

---

## 四、核心代码路径（完整调用链）

### 第 1 步：按 T → 激活文本工具

```
用户按 T
  → ToolManager.setActiveTool('drawText')
    → new DrawTextTool(editor)
    → cursor = 'crosshair'            ← 光标变十字
```

---

### 第 2 步：点击画布 → 创建文本并进入编辑

```
用户点击画布松手
  → DrawTextTool.onEnd(e)
    ├─ pos = editor.getSceneCursorXY(e)      ← 屏幕坐标 → 场景坐标
    │
    └─ editor.textEditor.active({ pos })
        │
        │  [规则1] 创建空文本
        ├─ textGraphics = new SuikaText({
        │     content: '',
        │     fontSize: defaultFontSize,
        │     fontFamily: defaultFontFamily,
        │     width: 0, height: fontSize,
        │   }, { advancedAttrs: pos, doc })
        │
        ├─ sceneGraph.addItems([textGraphics])   ← 注册到全局 Map
        ├─ canvas.insertChild(textGraphics)      ← 挂到场景树
        ├─ selectedElements.setItems([textGraphics])
        │
        │  [规则7] 开始记录事务
        ├─ transaction.recordOld(id, { content: '', width: 0 })
        │
        │  [规则2] 隐藏变换手柄，聚焦 input
        ├─ enableTransformControl = false
        ├─ enableDrawSizeIndicator = false
        ├─ inputDom.focus()                      ← 隐藏 input 抢焦点
        │
        │  设置光标到末尾
        └─ rangeManager.setRange({ start: 0, end: 0 })
```

---

### 第 3 步：键盘输入 → 更新文本内容

```
用户按键（英文直接输入）
  → inputDom 'input' 事件
    ├─ e.isComposing === false
    │
    │  [规则3] 直接输入路径
    ├─ rangeLeft/rangeRight = rangeManager.getSortedRange()
    ├─ newContent = content[0..rangeLeft] + e.data + content[rangeRight..]
    │
    │  [规则4] 更新内容并自适应尺寸
    ├─ TextEditor.updateTextContentAndResize(textGraphics, newContent)
    │     ├─ { width, height } = calcTextSize(newContent, fontStyle)
    │     └─ textGraphics.updateAttrs({ content, width, height })
    │           └─ _glyphs = null              ← [规则8] 清空字形缓存
    │
    ├─ rangeManager.setRange({ start: rangeLeft + dataLen, end: ... })
    └─ editor.render()


用户用中文输入法（IME 组合输入）
  → inputDom 'input' 事件（isComposing === true）
    │
    │  [规则3] IME 组合路径
    ├─ 首次组合：记录 leftContent / rightContent（拼音前后的原始文本）
    ├─ composingText = e.data（当前拼音/候选）
    ├─ newContent = leftContent + composingText + rightContent
    ├─ updateTextContentAndResize(textGraphics, newContent)   ← 实时预览
    └─ editor.render()

  → inputDom 'compositionend' 事件
    ├─ composingText = ''                    ← 清空组合状态
    └─（最终字符已经在最后一次 input 事件中写入 content）
```

---

### 第 4 步：删除/方向键/选区操作

```
用户按 Backspace
  → inputDom 'keydown' 事件
    ├─ rangeLeft === rangeRight（无选区）→ rangeLeft -= 1   ← 删前一个字符
    ├─ rangeLeft !== rangeRight（有选区）→ 删选区内容
    ├─ newContent = content[0..rangeLeft] + content[rangeRight..]
    ├─ updateTextContentAndResize(textGraphics, newContent)
    └─ editor.render()

用户按 ArrowRight
  → inputDom 'keydown' 事件
    ├─ 无 Shift → rangeManager.moveRight()   ← 光标右移一格
    ├─ 有 Shift → rangeManager.moveRangeEnd(+1)  ← 扩展选区
    └─ editor.render()

用户按 Ctrl+A
  → rangeManager.setRange({ start: 0, end: contentLength })  ← 全选
  → editor.render()

用户按 Ctrl+C
  → content = sliceContent(content, rangeLeft, rangeRight)
  → navigator.clipboard.writeText(content)    ← 写入系统剪贴板
```

---

### 第 5 步：鼠标点击/拖选 → 定位光标/选区

```
用户在文本内部点击
  → TextEditor.onStart(event)
    ├─ textGraphics.hitTest(mousePt)          ← 确认点在文本内
    │
    │  [规则5] 二分查找光标位置
    ├─ cursorIndex = textGraphics.getCursorIndex(mousePt)
    │     ├─ point = applyInverseMatrix(transform, mousePt)  ← 世界→本地坐标
    │     └─ 二分查找 glyphs 数组中 point.x 最近的间隙
    │
    ├─ rangeManager.setRange({ start: cursorIndex, end: cursorIndex })
    └─ editor.render()

用户拖拽（从点击处拖到另一处）
  → TextEditor.onDrag(event)
    ├─ cursorIndex = textGraphics.getCursorIndex(mousePt)
    ├─ rangeManager.setRangeEnd(cursorIndex)  ← 只移动 end，start 不变
    └─ editor.render()
```

---

### 第 6 步：光标/选区渲染

```
editor.render()
  → SceneGraph.render()
    → textEditor.drawRange(drawInfo)
      │
      │  [规则6] 计算光标/选区的视口坐标
      ├─ { topInViewport, bottomInViewport, rightInViewport }
      │     = rangeManager.getCursorLinePos(textGraphics)
      │     ├─ startGlyph = glyphs[range.start]  ← 光标位置的字形
      │     ├─ top = applyMatrix(textMatrix, startGlyph.position)  ← 本地→世界
      │     ├─ topInViewport = editor.toViewportPt(top)  ← 世界→视口
      │     └─ 如果有选区：计算 end 字形的 rightInViewport
      │
      │  定位隐藏 input（让 IME 候选框在光标旁）
      ├─ inputDom.style.left/top = bottomInViewport + offset
      │
      │  绘制
      ├─ rangeManager.draw(drawInfo, top, bottom, right)
      │     ├─ 无选区（right === null）
      │     │     → ctx.moveTo/lineTo 画竖线（光标线）
      │     │     → strokeStyle = textEditorCursorLineStroke
      │     └─ 有选区（right !== null）
      │           → ctx.moveTo → 画四边形
      │           → fillStyle = textEditorSelectionFill（半透明蓝）
```

---

### 第 7 步：Esc / 失焦 → 退出编辑

```
用户按 Esc 或点击画布外部（input 失焦）
  → TextEditor.inactive()
    │
    │  [规则7] 判断文本是否为空
    ├─ if (!content)
    │     → removeGraphicsAndRecord(editor, [textGraphics])  ← 删除空文本
    │
    ├─ else
    │     → transaction.update(id, { content, width })       ← 记录新值
    │     → transaction.updateParentSize([textGraphics])
    │     → transaction.commit('update text content')        ← 入栈命令
    │
    │  恢复编辑器状态
    ├─ enableTransformControl = true
    ├─ enableDrawSizeIndicator = true
    └─ textGraphics = null
```

---

## 五、耦合点

| 耦合系统 | 触发时机 | 为什么需要 |
|---------|---------|-----------|
| ToolManager | 按 T / 创建后切回 select | 工具切换 |
| Transaction / CommandManager | inactive() 时 | 记录文本变更，支持撤销重做 |
| SceneGraph | 每帧 render | 调 `textEditor.drawRange()` 绘制光标/选区 |
| SelectedElements | active() 时 | 选中当前文本元素 |
| ControlHandleManager | active/inactive | 编辑时隐藏变换手柄，退出时恢复 |
| CanvasDragger | 编辑中 | 文本编辑激活时拦截画布拖拽 |
| Clipboard | Ctrl+C/X | 用 `navigator.clipboard.writeText` 写入系统剪贴板 |

---

## 六、架构设计决策（知其所以然）

### 为什么用隐藏 input 而不是自己处理 keydown？
> 自己处理 `keydown` 只能拿到按键码，无法处理 IME 输入（中文、日文等需要组合的输入法）。`<input>` 元素天然支持 IME，通过 `compositionstart/compositionupdate/compositionend` 事件提供完整的组合输入生命周期。另外 `<input>` 自动处理 Ctrl+V 粘贴（虽然当前代码里粘贴还没实现），以及操作系统级的输入法切换。如果自己实现这些，工作量巨大且跨平台兼容性差。

### 为什么 SuikaText 当前只支持单行？
> 多行文本需要：1) 自动换行算法（word wrap），2) 段落排版引擎（行高、对齐），3) 多行光标定位（二维问题，不是一维）。这些都是非常复杂的功能。当前实现优先做通最简单的单行文本，验证整个输入 → 渲染 → 编辑 → 撤销链路。后续如果需要多行，可以在 `calcGlyphInfos` 中加入换行逻辑，`getCursorIndex` 改为二维查找。

### 为什么 calcGlyphInfos 逐字符测量而不是直接用 measureText(content)?
> `measureText(content)` 只返回整个字符串的总宽度，无法知道每个字符的位置。光标定位和选区绘制需要知道每个字符的 x 坐标，所以必须逐字符测量并累加。`fontKerning = 'none'` 关闭字距调整，确保逐字累加的结果和 `fillText` 整体绘制一致（不会因为字距调整导致光标位置和文字渲染对不上）。

### 为什么 inactive() 要区分"空文本删除"和"非空文本提交"？
> 用户可能误点画布创建了文本但没输入内容就 Esc 了。如果不删除空文本，图层面板会积累大量不可见的空对象。空文本走 `removeGraphicsAndRecord` 删除（可撤销），非空文本走 `Transaction.commit` 记录内容变更（也可撤销）。两个路径都能被 Ctrl+Z 恢复。
