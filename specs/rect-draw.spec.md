# 矩形绘制 Spec

> **一句话说清**：矩形工具监听拖拽事件，用起点和终点算出宽高，创建 SuikaRect 加入场景树，松手后压入撤销栈；Shift 画正方形、Alt 从中心画、单击出默认尺寸。

---

## 一、功能概述

用户通过拖拽（或单击）在画布上画出矩形。

**涉及文件**（只有 4 个）：

| 文件 | 职责 |
|------|------|
| `tools/tool_manager.ts` | 工具注册、切换、事件分发 |
| `tools/tool_draw_graphics.ts` | 拖拽绘制的完整流程（基类） |
| `tools/tool_draw_rect.ts` | 矩形特有逻辑：创建 SuikaRect（仅 14 行） |
| `commands/add_graphs.ts` | 撤销重做命令 |

---

## 二、用户操作流程

| 步骤 | 用户做了什么 | 系统响应 |
|:----:|-------------|---------|
| 1 | 按 R 键或点工具栏 | 切换到矩形绘制模式 |
| 2 | 按下鼠标 | 记录起点坐标（经过吸附处理） |
| 3 | 拖拽鼠标 | 实时预览矩形（灰色填充，跟随鼠标变化） |
| 4 | 松开鼠标 | 矩形固定，操作记入撤销栈 |
| 5 | （只点击未拖拽） | 在点击位置生成 100×100 的默认矩形 |

---

## 三、业务规则

| # | 规则 | 代码线索 | 代码位置 | 为什么这么设计 |
|:-:|------|---------|---------|--------------|
| 1 | **拖拽方向不影响结果** | `normalizeRect` | `tool_draw_rect.ts:29` `tool_draw_graphics.ts:184` | 反向拖拽时 width/height 为负值，Canvas API 画不出负宽高的矩形。在创建和更新两个入口都做标准化，用户无论怎么拖都能画。 |
| 2 | **Shift 画正方形** | `adjustSizeWhenShiftPressing` | `tool_draw_graphics.ts:171`（定义）`:268`（调用） | 取 `Math.max(abs(w), abs(h))` 而非最小值，保证用户拖的距离不白费。方法为 `protected`，线段工具重写为角度吸附。 |
| 3 | **Alt 从中心画** | `isAltPressing` | `tool_draw_graphics.ts:249, 271` | Figma/Sketch 通用交互。代码里先 Shift 再 Alt，顺序保证两者可同时生效（Shift+Alt = 从中心画正方形）。 |
| 4 | **单击生成默认矩形** | `drawGraphDefaultWidth` | `tool_draw_graphics.ts:328-329` `setting.ts:91-92` | 不做兜底用户会以为工具坏了。默认 100×100 放在 Setting 里可自定义，矩形中心对齐光标。 |
| 5 | **默认灰色填充** | `firstFill` | `tool_draw_rect.ts:35` `setting.ts:21-23` | 灰色在任何背景上有辨识度，中性色不影响设计判断。`cloneDeep` 防止多个矩形共享颜色对象。 |
| 6 | **自动命名不冲突** | `getNoConflictObjectName` | `tool_draw_rect.ts:32` `utils/common.ts:3` | 只在同层级查重（不同 Frame 可同名），和文件系统同理。 |
| 7 | **宽高为零自动撑开** | `solveWidthOrHeightIsZero` | `tool_draw_graphics.ts:229`（调用）`:303`（定义） | 用网格步长撑开而非固定 1px。`protected` 可重写，线段工具重写为不撑开高度。 |

---

## 四、核心代码路径（完整调用链）

### 第 1 步：按 R → 激活矩形工具

```
用户按 R
  → KeyBindingManager 捕获快捷键
    → tool_manager.ts setActiveTool('drawRect')
      → 从 toolCtorMap 取出构造函数
      → new DrawRectTool(editor)         ← 矩形工具实例化
      → 旧工具.onInactive()
      → 新工具.onActive()                ← 绑定 shiftToggle 等监听
      → emit('switchTool')               ← 通知 UI 更新工具栏高亮
```

---

### 第 2 步：按下鼠标 → 记录起点

```
canvas pointerdown
  → ToolManager.handleDown
    → DrawGraphicsTool.onStart(e)
      → SnapHelper.getSnapPtBySetting()   ← 鼠标坐标吸附到网格
      → this.startPoint = 吸附后的坐标     ← 后续算宽高的基准点
      → this.drawingGraphics = null        ← 清空上一轮状态
```

---

### 第 3 步：拖拽 → 创建矩形并实时更新

```
window pointermove（超过拖拽阈值后）
  → ToolManager.handleMove
    → DrawGraphicsTool.onDrag(e)
      → 禁止删除和右键菜单（防误操作）
      → 坐标吸附：SnapHelper + RefLine
      → this.isDragging = true
      → this.updateRect()                 ← 核心方法 ↓↓↓
```

#### updateRect() 展开

```
updateRect()
  │
  │  ① 算宽高
  ├─ width = 终点x - 起点x
  ├─ height = 终点y - 起点y
  │
  │  ② 边界修正
  ├─ [规则7] 宽或高 = 0？→ 用网格步长撑开
  ├─ [规则3] Alt 按了？  → 起点变中心，宽高翻倍
  ├─ [规则2] Shift 按了？→ 宽高取较大值（正方形）
  │
  │  ③ 创建或更新
  ├─ 首次拖拽（drawingGraphics === null）：
  │   │
  │   │  创建矩形对象
  │   ├─ tool_draw_rect.ts createGraphics(rect, parent)
  │   │   ├─ [规则1] normalizeRect()               ← 处理负宽高
  │   │   ├─ [规则6] getNoConflictObjectName()      ← 自动命名
  │   │   └─ [规则5] new SuikaRect({ fill })        ← 矩形诞生（内存中的数据）
  │   │
  │   │  加入场景
  │   ├─ sceneGraph.addItems([graphics])             ← 注册到文档
  │   ├─ parent.insertChild(graphics)                ← 挂到场景树
  │   └─ selectedElements.setItems([graphics])       ← 自动选中
  │
  ├─ 后续拖拽（drawingGraphics !== null）：
  │   └─ updateGraphics(rect)
  │       ├─ [规则1] normalizeRect()                 ← 再次处理负宽高
  │       └─ updateAttrs({ x, y, width, height })    ← 矩形跟着变大变小
  │
  │  ④ 渲染到屏幕
  └─ editor.render()
      → 场景树从根节点递归遍历
        → 走到 SuikaRect → draw() → _realDraw()
          → Canvas API: rect() + fill()
          → 灰色方块出现在屏幕上
```

---

### 第 4 步：松开鼠标 → 命令入栈

```
window pointerup
  → ToolManager.handleUp
    → DrawGraphicsTool.onEnd(e)
      │
      ├─ 拖拽过（drawingGraphics !== null）：
      │   └─ 直接跳到 ↓ 入栈
      │
      ├─ [规则4] 没拖拽过（drawingGraphics === null）：
      │   ├─ 从 Setting 读默认宽高（100×100）
      │   ├─ createGraphics() → 创建默认矩形，中心对齐光标
      │   └─ addItems + insertChild + setItems + render
      │
      └─ 命令入栈：
          └─ commandManager.pushCommand(new AddGraphCmd(...))
              ← 只压栈，不执行 redo（矩形已在场景里）
              ← 清空 redoStack

    → DrawGraphicsTool.afterEnd()
      ├─ isDragging = false
      ├─ 恢复删除和右键菜单
      ├─ 清空参考线
      └─ keepToolSelectedAfterUse = false？→ 切回 select 工具
```

---

### 第 5 步：Ctrl+Z → 撤销

```
Ctrl+Z
  → CommandManager.undo()
    → AddGraphCmd.undo()
      ├─ graphics.setDeleted(true)       ← 标记为已删除
      ├─ graphics.removeFromParent()     ← 从场景树移除
      ├─ selectedElements.clear()        ← 取消选中
      └─ render()                        ← 矩形从屏幕上消失
```

---

### 第 6 步：Ctrl+Shift+Z → 重做

```
Ctrl+Shift+Z
  → CommandManager.redo()
    → AddGraphCmd.redo()
      ├─ graphics.setDeleted(false)      ← 取消删除标记
      ├─ parent.insertChild(graphics)    ← 重新挂回场景树
      ├─ selectedElements.setItems()     ← 重新选中
      └─ render()                        ← 矩形重新出现在屏幕上
```

---

## 五、耦合点

| 耦合系统 | 触发时机 | 代码线索 | 为什么需要 |
|---------|---------|---------|-----------|
| ToolManager | 全程 | `setActiveTool` | 统一管理工具生命周期，避免事件冲突 |
| CommandManager | 松手后 | `pushCommand(AddGraphCmd)` | 命令模式比快照省内存 |
| SceneGraph | 首次拖拽 | `addItems` | 拖拽中加入才有实时预览 |
| SelectedElements | 创建后 | `setItems` | 自动选中，用户可立即调属性 |
| SnapHelper + RefLine | 拖拽中 | `getSnapPtBySetting` | 网格吸附 + 参考线视觉反馈 |
| HostEventManager | 拖拽中 | `isShiftPressing` / `isAltPressing` | 修饰键全局管理，避免状态不一致 |
| Frame 容器 | 画在 Frame 内 | `getDeepFrameAtPoint` | 矩形成为 Frame 子元素，移动 Frame 时跟着走 |
| Setting | 创建时 | `firstFill` / `drawGraphDefaultWidth` | 默认值集中管理，可自定义 |

---

## 六、架构设计决策（知其所以然）

### 为什么 DrawRectTool 只有 14 行有效代码？
> 矩形、椭圆、星形、Frame 的拖拽流程完全一样，只有"创建什么对象"不同。**模板方法模式**：基类实现完整拖拽逻辑，子类只重写 `createGraphics`。不这么做 → 四个工具各抄一遍 onStart/onDrag/onEnd，改一个 bug 要改四处。

### 为什么拖拽中就加入场景，不等松手？
> 拖拽过程中用户需要**实时预览**。等松手再加入 → 拖拽时画布是空的。所以首次拖拽时就 addItems + insertChild，后续只 updateGraphics 更新属性。

### 为什么用命令模式做撤销，而不是存快照？
> 快照要存整个场景的完整状态，100 个图形改 1 个就要复制 100 个。命令只记"新增了哪个图形"，undo 就 `setDeleted(true)` + `removeFromParent`。**内存开销差一个数量级**。

### 为什么 pushCommand 时不执行 redo？
> 矩形在拖拽中已经在场景里了。松手时只压栈记录，再执行 redo 等于重复添加。所以 `pushCommand` **只压栈 + 清 redoStack，不调 redo()**。

### 为什么修饰键由 HostEventManager 统一管理？
> 每个工具自己监听 keydown → (1) 多个监听器需精确管理，容易泄漏 (2) 切工具时状态不一致。统一维护布尔状态，工具随时读取，**简单可靠**。

---

## 七、同类工具一览（共用 DrawGraphicsTool 基类）

以下工具全部继承 `DrawGraphicsTool`，拖拽逻辑、Shift/Alt 约束、吸附、命令入栈**完全复用**，只重写 `createGraphics` 一个方法。

| 工具 | 文件 | 快捷键 | createGraphics 返回 | 和矩形的区别 |
|------|------|:------:|---------------------|-------------|
| 矩形 | `tool_draw_rect.ts` | R | `SuikaRect` | — |
| 椭圆 | `tool_draw_ellipse.ts` | O | `SuikaEllipse` | Shift 约束为正圆而非正方形 |
| 直线 | `tool_draw_line.ts` | L | `SuikaLine` | 只有起点和终点，没有填充只有描边；Shift 约束为 0°/45°/90° 角度锁定 |
| 正多边形 | `tool_draw_regular_polygon.ts` | — | `SuikaRegularPolygon` | 多一个 `sides` 属性（边数），绘制时按边数生成顶点 |
| 星形 | `tool_draw_star.ts` | — | `SuikaStar` | 多 `points`（角数）和 `innerRatio`（内圆比例）两个属性 |
| 图片 | `tool_draw_img.ts` | — | `SuikaRect`（fill=Image） | 没有独立图形类，本质是带 `PaintType.Image` 填充的矩形；多了 `enableActive()` 弹文件选择器上传图片 |

**面试话术**：

> "这些绘制工具用**模板方法模式**——基类 `DrawGraphicsTool` 封装了通用的拖拽生命周期（mousedown → mousemove → mouseup）、坐标计算、Shift 等比约束、Alt 中心缩放、吸附对齐、命令入栈。子类只需重写 `createGraphics` 返回不同的图形对象。要新增一种图形，只需要写一个几十行的子类，零拖拽逻辑。"
