# 选择工具 Spec

> **一句话说清**：选择工具通过策略模式，根据鼠标按下的位置（控制手柄/选中框/图形/空白）分派给四个子策略（旋转/缩放/移动/框选），每个子策略独立处理拖拽逻辑，结束后统一用 UpdateGraphicsAttrsCmd 入撤销栈。

---

## 一、功能概述

用户在画布上点选、框选、拖拽移动、缩放、旋转图形。

**涉及文件**：

| 文件 | 职责 |
|------|------|
| `tools/tool_select/tool_select.ts` | 主控：决定用哪个子策略 |
| `tools/tool_select/tool_select_move.ts` | 子策略：拖拽移动图形 |
| `tools/tool_select/tool_select_selection.ts` | 子策略：框选（拉选区矩形） |
| `tools/tool_select/tool_select_resize.ts` | 子策略：缩放/调整大小 |
| `tools/tool_select/tool_select_rotation.ts` | 子策略：旋转 |
| `tools/tool_select/utils.ts` | 工具函数：hitTest、框选判定 |
| `commands/update_graphics_attrs_cmd.ts` | 撤销重做命令（移动/缩放/旋转共用） |

---

## 二、用户操作流程

| 步骤 | 用户做了什么 | 系统响应 |
|:----:|-------------|---------|
| 1 | 按 V 键或点工具栏 | 切换到选择工具 |
| 2 | 点击某个图形 | 选中该图形，显示选中框和控制手柄 |
| 3 | 在空白处拖拽 | 拉出选区矩形，选中框内所有图形 |
| 4 | 拖拽已选中的图形 | 移动图形（支持吸附对齐） |
| 5 | 拖拽控制手柄（角/边） | 缩放图形 |
| 6 | 拖拽旋转手柄 | 旋转图形 |
| 7 | Shift + 点击 | 追加选中或取消选中 |
| 8 | 松开鼠标 | 操作完成，记入撤销栈 |

---

## 三、业务规则

### 规则1：按下时根据命中位置选择策略
- **代码线索**：`getHandleInfoByPoint` → `selectedBox.hitTest` → `getTopHitElement`
- **预期位置**：`SelectTool.onStart` 方法内，按优先级依次判定
- **验证方法**：分别点控制手柄、选中框内、某个图形、空白处，观察光标和行为是否不同
- **验证结果**：✅ 已找到
- **代码位置**：`tool_select/tool_select.ts` onStart 方法
- **为什么这么设计**：一次 pointerdown 只能做一件事（移动/缩放/旋转/框选）。如果不用策略模式，四种操作的 onDrag 逻辑全写在一个方法里，会变成几百行的 if-else 分支地狱，改一个操作容易影响另一个。用策略模式后每个操作独立成类，互不干扰，加新操作（比如倾斜变换）只需加一个策略类，不碰现有代码。判定顺序也很讲究——手柄优先于选中框优先于图形优先于空白，因为手柄在视觉上"浮"在选中框上面，用户点到手柄的意图一定是缩放/旋转而不是移动。

### 规则2：点选从后往前遍历找最顶层图形
- **代码线索**：`getHitGraphics`（子节点倒序遍历 `i = length - 1 → 0`）
- **预期位置**：`SuikaCanvas.getHitGraphics` 方法内
- **验证方法**：两个图形重叠，点击重叠区域，看是否选中上面那个
- **验证结果**：✅ 已找到
- **代码位置**：`graphics/canvas.ts` getHitGraphics 方法
- **为什么这么设计**：场景树中后添加的子节点渲染在上面（z-order）。如果从前往后遍历，第一个命中的可能是被压在底下的图形，用户点的明明是上面那个却选了下面那个，违反直觉。从后往前遍历保证最顶层的图形优先命中。另外 hitTest 带了容差（`selectionHitPadding / zoom`），这样即使图形描边很细，也不需要精确点到像素上才能选中。

### 规则3：Shift 点击追加/取消选中
- **代码线索**：`toggleItems`、`graphShouldRemovedFromSelectedIfNotMoved`
- **预期位置**：`SelectTool.onStart`（追加标记）和 `SelectMoveTool.onEnd`（延迟取消）
- **验证方法**：选中 A，Shift 点 B → 两个都选中；Shift 再点 A → A 取消选中
- **验证结果**：✅ 已找到
- **代码位置**：`tool_select/tool_select.ts` onStart + `tool_select_move.ts` onEnd
- **为什么这么设计**：取消选中延迟到 onEnd（未拖拽时），是因为 Shift+点击已选图形有两种意图：(1) 取消选中它；(2) 准备 Shift+拖拽移动多个图形。如果按下时立刻取消，用户想拖拽三个图形却发现只拖了两个。所以用 `graphShouldRemovedFromSelectedIfNotMoved` 标记"等一等"，松手时确认没拖拽才真正 toggleItems 取消。这个细节 Figma 也是同样处理的。

### 规则4：移动时 Shift 约束为水平/垂直
- **代码线索**：`isShiftPressing` + 比较 `dx`/`dy` 绝对值
- **预期位置**：`SelectMoveTool.move()` 方法内
- **验证方法**：选中图形，按住 Shift 拖拽，观察是否只能水平或垂直移动
- **验证结果**：✅ 已找到
- **代码位置**：`tool_select_move.ts` move 方法
- **为什么这么设计**：设计工具中移动图形最常见的需求是水平或垂直对齐。如果没有 Shift 约束，用户想水平移动但手抖了一下就歪了，需要撤销重来。Shift 约束通过比较 dx/dy 的绝对值，自动锁定主方向、归零次方向，用户不需要手动对齐。这是 Figma/Sketch/Illustrator 的通用交互规范。

### 规则5：缩放时 Shift 等比、Alt 从中心
- **代码线索**：`keepRatio: isShift`、`scaleFromCenter: isAlt`
- **预期位置**：`SelectResizeTool.updateGraphics` 调用 `resizeRect` 时传入参数
- **验证方法**：拖角手柄，按住 Shift 观察是否等比缩放，按住 Alt 观察是否从中心缩放
- **验证结果**：✅ 已找到
- **代码位置**：`tool_select_resize.ts` updateGraphics 方法
- **为什么这么设计**：Shift 等比缩放防止图形变形（比如圆变成椭圆）。Alt 从中心缩放让图形保持视觉位置不动（否则只有被拖的角在动，对角固定，图形会"飘走"）。这两个修饰键和矩形绘制时的含义对称——Shift 始终约束形状，Alt 始终改变参考点——用户学一次就全会了，不需要每个工具单独记。

### 规则6：旋转时 Shift 步进角度
- **代码线索**：`getClosestTimesVal`、`lockRotation`
- **预期位置**：`SelectRotationTool.onDrag` 计算旋转角度时
- **验证方法**：拖旋转手柄，按住 Shift，观察是否以 15 度为步进
- **验证结果**：✅ 已找到
- **代码位置**：`tool_select_rotation.ts` onDrag 方法
- **为什么这么设计**：自由旋转时很难精确到 0/45/90/180 这些常用角度，差 1-2 度肉眼看不出但导出时会有问题。15 度步进覆盖了所有常用角度（0/15/30/45/60/75/90/...），用 `getClosestTimesVal` 自动吸附到最近的 15 度倍数。不按 Shift 时仍然可以自由旋转任意角度，两种需求互不影响。

### 规则7：Group 内点选升级到选中整个 Group
- **代码线索**：`parentIdSet` 过滤
- **预期位置**：`SuikaFrame.getHitGraphics` 内判断父节点是否已在选中集
- **验证方法**：创建 Group，点击 Group 内的子元素，观察是否选中整个 Group
- **验证结果**：✅ 已找到
- **代码位置**：`graphics/frame/frame.ts` getHitGraphics 方法
- **为什么这么设计**：Group 的意义是"这些元素是一个整体"。如果点子元素直接选中子元素，用户移动时只移了一部分，Group 就散了。所以默认行为是"升级"到选中整个 Group。想编辑 Group 内部时，双击进入 Group，这时候 parentIdSet 里有了这个 Group 的 id，子元素才不会再升级。这和 Figma 的双击进入 Group 编辑模式是同一个逻辑。

### 规则8：框选 + Shift 保留原有选中
- **代码线索**：`startSelectedGraphs` + `toggleItems`
- **预期位置**：`DrawSelection.onStart`（记录初始选中）和 `updateSelectionAndSelectSet`（合并）
- **验证方法**：先选中 A，再 Shift + 框选 B 和 C，观察 A 是否仍然选中
- **验证结果**：✅ 已找到
- **代码位置**：`tool_select_selection.ts`
- **为什么这么设计**：实际设计场景中，用户经常需要选中散落在画布各处的图形。如果每次框选都清空之前的选中，用户就只能一次框完所有想选的，做不到"先框左边几个，再框右边几个"。Shift+框选保留原有选中，用 `startSelectedGraphs` 记住框选前的状态，新框中的用 `toggleItems` 追加（已选的则取消），逻辑和 Shift+点击保持一致。

### 规则9：移动/缩放过程中隐藏选中框
- **代码线索**：`showBoxAndHandleWhenSelected = false`
- **预期位置**：`SelectMoveTool.onDrag` / `SelectResizeTool.onDrag` 开始时
- **验证方法**：拖拽移动图形时，观察选中框和手柄是否消失
- **验证结果**：✅ 已找到
- **代码位置**：`tool_select_move.ts` onDrag
- **为什么这么设计**：拖拽过程中每帧都在重绘，选中框和手柄如果跟着重绘会产生闪烁，尤其在移动吸附时选中框位置抖动更明显。而且选中框会遮挡图形本身，影响用户判断对齐位置。所以拖拽开始时 `showBoxAndHandleWhenSelected = false`，只画图形本身和参考线，松手后在 `afterEnd` 里恢复 `true`，选中框和手柄重新出现。

### 规则10：移动/缩放/旋转共用一个 Command
- **代码线索**：`UpdateGraphicsAttrsCmd`
- **预期位置**：各子策略的 `onEnd` 方法内，或 `Transaction.commit` 内
- **验证方法**：分别做移动、缩放、旋转，然后 Ctrl+Z 撤销，观察是否都能正确恢复
- **验证结果**：✅ 已找到
- **代码位置**：`commands/update_graphics_attrs_cmd.ts`
- **为什么这么设计**：移动改的是 transform 里的平移分量，缩放改的是 width/height 和 transform，旋转改的是 transform 里的旋转分量。三者本质都是"修改了图形属性"，区别只是改了哪几个字段。如果分成三个 Command 类，每个类的 undo/redo 逻辑几乎一样（恢复旧属性/应用新属性），纯粹是代码重复。用同一个 `UpdateGraphicsAttrsCmd`，通过 `originAttrsMap` 和 `updatedAttrsMap` 记录变更前后的属性快照，一个类搞定所有属性变更类的撤销重做。

---

## 四、核心代码路径（完整调用链）

### 第 1 步：按 V → 激活选择工具

```
用户按 V
  → KeyBindingManager 捕获快捷键
    → ToolManager.setActiveTool('select')
      → new SelectTool(editor)
      → 旧工具.onInactive()
      → 新工具.onActive()
```

---

### 第 2 步：按下鼠标 → 决定用哪个策略

```
canvas pointerdown
  → ToolManager.handleDown
    → SelectTool.onStart(e)
      │
      │  ① 先问：点到了控制手柄吗？
      ├─ controlHandleManager.getHandleInfoByPoint(point)
      │   ├─ 命中旋转手柄 → currStrategy = SelectRotationTool
      │   └─ 命中缩放手柄 → currStrategy = SelectResizeTool
      │
      │  ② 再问：点在选中框内吗？
      ├─ selectedBox.hitTest(point)
      │   └─ 是 → currStrategy = SelectMoveTool（整体拖拽移动）
      │
      │  ③ 再问：点到了某个图形吗？
      ├─ getTopHitElement(editor, point)
      │   ├─ 命中 + 无 Shift → setItems([element])，选中它
      │   ├─ 命中 + 有 Shift → toggleItems([element])，追加/标记延迟取消
      │   └─ currStrategy = SelectMoveTool
      │
      │  ④ 都没命中：空白区域
      └─ currStrategy = DrawSelection（开始框选）
          └─ 无 Shift → 清空选中

      → currStrategy.onActive()
      → currStrategy.onStart(e)
```

---

### 第 3 步（场景A）：拖拽移动图形

```
window pointermove
  → SelectMoveTool.onDrag(e)
    │
    │  准备
    ├─ Transaction.recordOld()                    ← 记录移动前的 transform
    ├─ 隐藏选中框和手柄（防闪烁）
    │
    │  计算位移
    ├─ dx = 当前x - 起点x, dy = 当前y - 起点y
    ├─ [规则4] Shift 按了？→ 约束为纯水平或纯垂直
    ├─ snapToGrid → 对齐到网格
    ├─ RefLine.getGraphicsSnapOffset → 吸附到其他图形
    │
    │  应用移动
    ├─ 对每个选中图形 setWorldTransform(原始矩阵 + dx, dy)
    ├─ 若跨 Frame → insertChild 换父容器
    └─ editor.render()

window pointerup
  → SelectMoveTool.onEnd(e)
    ├─ 有移动 → transaction.commit('Update Graphics Attributes')
    │            → pushCommand(UpdateGraphicsAttrsCmd)
    └─ 无移动 + 无 Shift + 空白 → selectedElements.clear()
```

---

### 第 3 步（场景B）：框选

```
window pointermove
  → DrawSelection.onDrag(e)
    ├─ getRectByTwoPoint(起点, 当前点) → 选区矩形
    ├─ sceneGraph.setSelection(rect)             ← 画半透明蓝色选区框
    └─ getElementsInSelection(editor)
        → DFS 遍历场景树
          → child.intersectWithChildrenBox(box)  ← 判断图形是否与选区相交
        → [规则8] Shift → toggleItems 与原有选中合并
        → 无 Shift → setItems(框内图形)

window pointerup
  → DrawSelection.afterEnd()
    → sceneGraph.selection = null                ← 清除选区框
```

---

### 第 3 步（场景C）：缩放

```
window pointermove
  → SelectResizeTool.onDrag(e)
    ├─ 禁用撤销/删除（防中间态入栈）
    ├─ 吸附：SnapHelper + RefLine
    ├─ [规则5] resizeRect(keepRatio: Shift, scaleFromCenter: Alt)
    │   ├─ 单对象 → 直接算新 transform + width/height
    │   └─ 多对象 → 对整体包围盒缩放，再分配到每个图形
    └─ editor.render()

window pointerup
  → SelectResizeTool.onEnd(e)
    → pushCommand(new UpdateGraphicsAttrsCmd(...))
    → 恢复撤销/删除
```

---

### 第 3 步（场景D）：旋转

```
window pointermove
  → SelectRotationTool.onDrag(e)
    ├─ 算鼠标相对选中盒中心的角度差 dRotation
    ├─ [规则6] Shift 按了？→ 步进到最近的 15 度倍数
    ├─ 对每个选中图形施加旋转 dRotate
    └─ editor.render()

window pointerup
  → SelectRotationTool.onEnd(e)
    → transaction.commit('Rotate Elements')
      → pushCommand(UpdateGraphicsAttrsCmd)
```

---

### 第 4 步：Ctrl+Z → 撤销

```
Ctrl+Z
  → CommandManager.undo()
    → UpdateGraphicsAttrsCmd.undo()
      → 对每个图形 updateAttrs(originAttrs)    ← 恢复移动/缩放/旋转前的属性
      → 若父容器变了 → removeFromParent + insertAtParent
      → render()
```

---

## 五、耦合点

| 耦合系统 | 触发时机 | 为什么需要 |
|---------|---------|-----------|
| SelectedElements | 全程 | 管理当前选中列表，提供 setItems/toggleItems/clear/getBoundingRect |
| SelectedBox | onStart 判定 | 点是否在选中框内决定"整体拖动" vs "框选" |
| ControlHandleManager | onStart 判定 | 点是否在手柄上决定"缩放" vs "旋转" |
| SceneGraph | 框选 + 渲染 | 存储选区矩形、触发整树渲染、绘制选中轮廓 |
| Transaction | 移动/旋转 | 批量记录属性变更，commit 时生成一条 Command |
| CommandManager | onEnd | 压入 UpdateGraphicsAttrsCmd，统一撤销重做 |
| RefLine + SnapHelper | 移动/缩放中 | 对齐吸附 + 参考线视觉反馈 |
| HostEventManager | 拖拽中 | Shift/Alt 修饰键状态 |

---

## 六、架构设计决策（知其所以然）

### 为什么用策略模式而不是状态枚举？
> 四种操作（移动/框选/缩放/旋转）各自的 onStart/onDrag/onEnd 逻辑完全不同。如果用 if-else 写在一个类里，onDrag 会变成几百行的分支地狱。策略模式让每个操作独立成类，互不干扰，加新操作只需加一个策略类。

### 为什么移动/缩放/旋转共用一个 Command？
> 三者本质都是"修改了图形的 transform 属性"。用同一个 `UpdateGraphicsAttrsCmd`，undo 就是恢复旧属性，redo 就是应用新属性。不需要三个 Command 类，减少代码量，撤销栈也更统一。

### 为什么 Shift 取消选中要延迟到 onEnd？
> 用户 Shift+点击一个已选中的图形，可能是想取消选中，也可能是想 Shift+拖拽移动多个图形。如果按下时立刻取消，后续拖拽就少了一个图形。所以先标记 `graphShouldRemovedFromSelectedIfNotMoved`，只有松手时确认"没有拖拽"才真正取消。

### 为什么 hitTest 从后往前遍历子节点？
> 场景树中后添加的子节点渲染在上面（z-order）。用户点击时期望选中视觉上最顶层的图形，所以 hitTest 从后往前遍历，第一个命中的就是最上面的。

### 为什么缩放过程中要禁用撤销？
> 缩放拖拽过程中每帧都在更新属性，如果不禁用，用户在拖拽中按 Ctrl+Z 会撤销到中间态（比如缩放到一半的大小），产生混乱。只在松手时才入栈一个完整的缩放操作。

---

## 七、控制柄系统（ControlHandleManager）

控制柄是选中图形后出现在周围的那些小方块（缩放手柄）和圆角图标（旋转手柄），是选择工具的 UI 层。

**核心文件**：`control_handle_manager/control_handle_manager.ts`（359 行）

### 控制柄的 12 种类型

| 类型 | 位置 | 功能 |
|------|------|------|
| `nw` / `ne` / `se` / `sw` | 四角 | 等比缩放 |
| `n` / `e` / `s` / `w` | 四边中点 | 单向缩放（宽或高） |
| `nwRotation` / `neRotation` / `seRotation` / `swRotation` | 四角外侧 | 旋转 |

### 控制柄的工作流程

```
选中图形后
  → ControlHandleManager.draw(selectedBoxRect)
    │
    │  1. 计算位置
    ├─ updateTransformHandles(rect)
    │     ├─ rectToVertices(rect)           ← 四角坐标
    │     ├─ rectToMidPoints(rect)          ← 四边中点坐标
    │     └─ offset 后计算旋转手柄坐标        ← 角外偏移 handleSize/2
    │
    │  2. 小尺寸优化
    ├─ checkEnableRender(rect)
    │     └─ 视口中宽高 < minSize → 不渲染手柄
    │
    │  3. 渲染
    └─ for each handle:
          ├─ toViewportPt(cx, cy)            ← 场景坐标 → 视口坐标
          ├─ graphics.setRotate(angle)       ← 手柄跟随选中框旋转
          └─ graphics.draw({ ctx })          ← 画到 Canvas 上
```

### 命中检测（点到了哪个手柄）

```
用户按下鼠标
  → SelectTool.onStart()
    → controlHandleManager.getHandleInfoByPoint(hitPoint)
      ├─ 倒序遍历所有 handle（顶层优先）
      ├─ handle.hitTest(viewportPt, padding)
      └─ 返回 { handleName: 'se', cursor: 'nwse-resize' }

  → 根据 handleName 判断策略：
    ├─ nw/ne/se/sw/n/e/s/w → SelectResizeTool（缩放策略）
    └─ nwRotation/...       → SelectRotationTool（旋转策略）
```

### 自定义控制柄（customHandles）

单选某些特殊图形时会出现额外的控制柄，比如：
- **圆角矩形**：四角内侧出现圆形拖拽点，拖拽改变圆角半径
- **正多边形**：边数调节手柄
- **星形**：内圆比例调节手柄

这些通过 `graphics.getControlHandles(zoom)` 返回，由 `onHoverItemChange` 在 hover 或选中时设置。它们也走同一套 `draw` 和 `getHandleInfoByPoint` 逻辑，没有额外代码路径。

### 为什么控制柄在视口坐标系绘制？
> 控制柄的视觉大小应该不受缩放影响——不管画布放大到 500% 还是缩小到 10%，手柄在屏幕上始终是 8px 的小方块。如果在场景坐标系绘制，放大时手柄会变巨大，缩小时变成一个像素点不到。所以 `draw` 时先把 `(cx, cy)` 从场景坐标转到视口坐标（`toViewportPt`），然后以固定像素尺寸绘制。同理 `n/e/s/w` 边中手柄的宽度也是 `rect.width * zoom - handleSize`（视口像素），保证和选中框边缘精确对齐。
