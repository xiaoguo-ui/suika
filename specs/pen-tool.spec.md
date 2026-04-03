# 钢笔工具 Spec

> **一句话说清**：钢笔工具通过逐次点击在画布上添加锚点（anchor），拖拽锚点时拉出贝塞尔控制手柄（in/out），多个锚点连成路径（`SuikaPath`）。路径编辑进入专属模式（`PathEditor`），只允许钢笔工具和路径选择工具，Esc/Enter 退出。每次添加锚点都通过 `batchCommand` 标记为一组，撤销时整条路径一步撤回。

---

## 一、功能概述

用户用钢笔工具在画布上逐点绘制贝塞尔曲线路径，支持直线段和曲线段混合，支持闭合路径。绘制完成后可用路径选择工具编辑锚点和控制手柄。

**涉及文件**：

| 文件 | 职责 |
|------|------|
| `tools/tool_draw_path.ts` | `DrawPathTool`：钢笔工具主逻辑，点击添加锚点、拖拽拉手柄 |
| `path_editor/path_editor.ts` | `PathEditor`：路径编辑模式管理（激活/退出、快捷键绑定） |
| `path_editor/selected_control.ts` | `SelectedControl`：路径控制点的选中管理 + 控制手柄绘制 |
| `graphics/path/path.ts` | `SuikaPath`：路径图形类，pathData 数据结构、`_realDraw` 渲染 |
| `tools/tool_path_select/tool_path_select.ts` | `PathSelectTool`：路径选择工具（移动锚点/框选锚点） |
| `tools/tool_path_select/tool_path_select_move.ts` | 子策略：拖拽移动锚点/控制手柄 |
| `tools/tool_path_select/tool_path_select_selection.ts` | 子策略：框选锚点 |

---

## 二、用户操作流程

| 步骤 | 用户做了什么 | 系统响应 |
|:----:|-------------|---------|
| 1 | 按 P 键或点工具栏 | 切换到钢笔工具，光标变为钢笔 |
| 2 | 在画布上点击第一个点 | 创建 `SuikaPath`，添加第一个锚点，进入路径编辑模式 |
| 3 | 点击第二个点 | 添加第二个锚点，两点之间出现直线段 |
| 4 | 点击第三个点并拖拽 | 添加第三个锚点，拖拽拉出贝塞尔控制手柄，线段变曲线 |
| 5 | 按住 Alt 拖拽 | 只调整 out 手柄，in 手柄不跟随（打断对称） |
| 6 | 光标靠近第一个锚点 | 光标变为"闭合"图标（pen-close） |
| 7 | 点击第一个锚点 | 路径闭合（closed=true） |
| 8 | 按 Esc 或 Enter | 退出路径编辑模式，回到选择工具 |
| 9 | 双击已有路径 | 重新进入路径编辑模式 |

---

## 三、业务规则

### 规则1：路径数据结构是 pathData: IPathItem[]，每个 pathItem 包含 segs 数组和 closed 标志
- **代码线索**：`IPathItem`、`ISegment`、`{ point, in, out }`、`closed`
- **预期位置**：`path.ts:29-31`（PathAttrs 定义）、`tool_draw_path.ts:83-94`（初始 pathData）
- **验证方法**：画一条路径，检查 attrs.pathData 的结构
- **验证结果**：✅ 已找到
- **代码位置**：`path.ts:29`（`pathData: IPathItem[]`）、`tool_draw_path.ts:83`（初始结构）
- **为什么这么设计**：每个 segment 有三个点——`point`（锚点位置）、`in`（入方向控制手柄，相对于 point 的偏移量）、`out`（出方向控制手柄，相对于 point 的偏移量）。in/out 用偏移量而不是绝对坐标，是因为移动锚点时控制手柄要跟着动——如果用绝对坐标，移动锚点还要同时更新 in 和 out 的坐标。用偏移量只需要改 point，in/out 自动跟着。`pathData` 是数组，支持一个 SuikaPath 包含多条子路径（比如字母 "i" 有两笔）。

### 规则2：点击添加直线段，拖拽拉出贝塞尔曲线控制手柄
- **代码线索**：`onStart` 添加 seg（`in/out` 为 `{0,0}`）、`onDrag` 设置 `out` 和 `in`
- **预期位置**：`tool_draw_path.ts:76-189`（onStart）、`tool_draw_path.ts:191-220`（onDrag）
- **验证方法**：点击不拖拽 = 直线段；点击并拖拽 = 曲线段
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_path.ts:169`（addSeg，in/out 为 0）、`tool_draw_path.ts:205`（onDrag 设置 out）
- **为什么这么设计**：点击时 `in={0,0}, out={0,0}`，控制手柄与锚点重合，两个锚点之间没有曲率 → 直线段。拖拽时 `out={dx,dy}`，控制手柄离开锚点，贝塞尔曲线有了曲率 → 曲线段。默认 `in = -out`（镜像对称），保证曲线在锚点处光滑过渡。这和 Figma/Illustrator 的行为一致——点击画折线，拖拽画曲线。

### 规则3：Alt 键打断控制手柄的对称关系
- **代码线索**：`isAltPressing`、`inAndOut.in = { x: -dx, y: -dy }`（不按 Alt 时）
- **预期位置**：`tool_draw_path.ts:209`
- **验证方法**：拖拽时按住 Alt，观察只有 out 手柄在动，in 手柄不跟
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_path.ts:209`
- **为什么这么设计**：默认行为是 `in = -out`（镜像对称），保证曲线在锚点处光滑。但有时用户需要在锚点处做尖角（cusp），比如心形的底部。按住 Alt 时只设置 `out`，不修改 `in`，两个控制手柄可以不对称，曲线在锚点处形成尖角。另外第一个锚点（`lastSegIdx === 0`）也不设置 in，因为第一个点前面没有线段，in 没有意义。

### 规则4：光标靠近起点锚点时提示闭合，点击后路径闭合
- **代码线索**：`checkCursorPtInStartAnchor`、`setCursor('pen-close')`、`setPathItemClosed(true)`
- **预期位置**：`tool_draw_path.ts:275-294`（检测）、`tool_draw_path.ts:164`（闭合）
- **验证方法**：画 3 个点后把光标移到第一个点附近，光标变成闭合图标，点击后路径闭合
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_path.ts:275`（checkCursorPtInStartAnchor）、`tool_draw_path.ts:164`（setPathItemClosed）
- **为什么这么设计**：闭合判定用 `distance(光标, 起点锚点) <= 5px/zoom`，5px 是屏幕像素（除以 zoom 转成场景坐标），保证任何缩放级别下都容易点到。闭合时不是添加新锚点，而是设置 `closed=true`，渲染时 `_realDraw` 会在最后一个锚点和第一个锚点之间画一条闭合线段（`ctx.closePath()`）。如果用额外锚点去和起点重合，位置可能有微小误差，产生缝隙。

### 规则5：路径编辑模式（PathEditor）限制只允许钢笔和路径选择工具
- **代码线索**：`pathEditor.active(path)`、`setEnableHotKeyTools([PathSelectTool, DrawPathTool])`
- **预期位置**：`path_editor.ts:43-68`（active 方法）
- **验证方法**：进入路径编辑模式后按 R（矩形工具），观察是否无反应
- **验证结果**：✅ 已找到
- **代码位置**：`path_editor.ts:56`（setEnableHotKeyTools）
- **为什么这么设计**：路径编辑是一个"子模式"——进入后画布上只应该操作路径的锚点和手柄，不应该切换到矩形工具去画别的。`setEnableHotKeyTools` 临时限制可用工具为钢笔（P）和路径选择（V），其他快捷键被屏蔽。同时隐藏普通的选中轮廓和变换手柄（`showSelectedGraphsOutline=false`、`enableTransformControl=false`），只显示路径控制点。退出时恢复所有设置。这个模式切换和 Figma 的"双击进入路径编辑"行为一致。

### 规则6：路径渲染用 moveTo + lineTo/bezierCurveTo 拼接
- **代码线索**：`_realDraw` 中 `ctx.moveTo`、`ctx.lineTo`、`ctx.bezierCurveTo`
- **预期位置**：`path.ts:230-263`
- **验证方法**：画一条混合直线段和曲线段的路径，观察渲染是否正确
- **验证结果**：✅ 已找到
- **代码位置**：`path.ts:235`（moveTo）、`path.ts:249`（lineTo）、`path.ts:251`（bezierCurveTo）
- **为什么这么设计**：遍历 pathData 的每个 pathItem，先 `moveTo` 到第一个锚点，然后对每对相邻锚点判断：如果前一个锚点的 `out` 和后一个锚点的 `in` 都是 `{0,0}`（和锚点重合），用 `lineTo` 画直线；否则用 `bezierCurveTo` 画三次贝塞尔曲线。`getHandleOut(prevSeg)` 和 `getHandleIn(currSeg)` 把相对偏移量加上锚点坐标得到控制点的绝对坐标。如果 `closed=true`，最后一个锚点要和第一个锚点之间也画一段，然后 `ctx.closePath()`。

### 规则7：每次添加锚点用 batchCommand 标记，撤销时整条路径一步撤回
- **代码线索**：`batchCommandStart`、`batchCommandEnd`、`AddGraphCmd` + `SetGraphsAttrsCmd`
- **预期位置**：`tool_draw_path.ts:123`（batchStart）、`tool_draw_path.ts:246`（batchEnd）
- **验证方法**：画一条 5 个点的路径，Ctrl+Z 一步全部撤销（不是一个点一个点撤）
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_path.ts:123`（batchCommandStart）、`tool_draw_path.ts:233`（pushCommand）
- **为什么这么设计**：画路径时每点一个锚点就 `pushCommand` 一条 `SetGraphsAttrsCmd`（更新 pathData）。如果不用 batch，用户画了 10 个锚点要按 10 次 Ctrl+Z 才能撤完。`batchCommandStart` 在首次点击时调用，把后续所有 `pushCommand` 标记为 `isBatched=true`。撤销时 `CommandManager.undo()` 自动把连续的 batched 命令一起弹出一起撤销（参见撤销重做 spec 规则9）。`onEnd`（闭合或松手后）调 `batchCommandEnd`。

### 规则8：退出路径编辑模式时自动删除空路径
- **代码线索**：`removePathIfEmpty`、`pathData.every(item => item.segs.length <= 1)`
- **预期位置**：`path_editor.ts:98-109`
- **验证方法**：进入钢笔模式只点一个点就按 Esc，观察路径是否被自动删除
- **验证结果**：✅ 已找到
- **代码位置**：`path_editor.ts:98`（removePathIfEmpty）
- **为什么这么设计**：只有一个锚点的路径没有可见的线段（需要至少两个锚点才能成线），留着它只会在图层面板出现一个看不见的空对象。所以退出编辑模式时检查每条子路径是否 `segs.length <= 1`，如果全部子路径都只有 0-1 个锚点，直接调 `removeGraphicsAndRecord` 删除。注意 undo 触发的退出（`source === 'undo'`）不做这个检查，因为 undo 会自己恢复正确状态。

### 规则9：路径选择工具（PathSelectTool）复用策略模式
- **代码线索**：`PathSelectMoveTool`、`DrawPathSelectionTool`、`currStrategy`
- **预期位置**：`tool_path_select.ts:10-98`
- **验证方法**：路径编辑模式下按 V，可以点选锚点拖拽移动，也可以框选多个锚点
- **验证结果**：✅ 已找到
- **代码位置**：`tool_path_select.ts:17-19`（两个策略）、`tool_path_select.ts:34-42`（策略选择）
- **为什么这么设计**：和选择工具的策略模式完全相同——`onStart` 时判断点到了控制手柄（移动策略）还是空白处（框选策略），然后委托给对应策略处理 `onDrag/onEnd`。复用同一个架构模式，代码结构一致，学过选择工具的策略模式后看这里没有学习成本。

### 规则10：鼠标移动时实时预览下一段曲线
- **代码线索**：`updateControlHandlesWithPreviewHandles`、`path-preview-curve`、`path-preview-anchor`
- **预期位置**：`tool_draw_path.ts:315-414`
- **验证方法**：添加一个锚点后移动鼠标，观察从上一个锚点到光标位置是否有一条浅蓝色预览线
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_path.ts:315`（updateControlHandlesWithPreviewHandles）
- **为什么这么设计**：如果不画预览线，用户不知道下一个锚点放在哪里会是什么形状，只能"盲放"然后调整。预览线用一条临时的 `SuikaPath`（蓝色描边）从上一个锚点的 out 手柄连到当前光标位置画贝塞尔曲线，光标位置还画一个白色圆点（`SuikaEllipse`）作为预览锚点。这些预览图形不是真正的图形节点，而是 `ControlHandle`，只在控制手柄层绘制，不进入场景树。鼠标每移动一帧就重新计算一次，实现实时预览。

---

## 四、核心代码路径（完整调用链）

### 第 1 步：按 P → 激活钢笔工具

```
用户按 P
  → ToolManager.setActiveTool('drawPath')
    → new DrawPathTool(editor)
    → drawPathTool.onActive()
      ├─ 如果 pathEditor 已激活（从路径选择切回来）
      │    → 继承当前正在编辑的 path
      └─ updateControlHandlesWithPreviewHandles()  ← 画预览锚点
```

---

### 第 2 步：点击第一个点 → 创建路径

```
用户点击画布
  → DrawPathTool.onStart()
    │
    │  首次点击：创建新路径
    ├─ pathData = [{ segs: [{ point:{0,0}, in:{0,0}, out:{0,0} }], closed:false }]
    ├─ path = new SuikaPath({ pathData, stroke: 黑色, strokeWidth: 1 })
    ├─ sceneGraph.addItems([path])           ← 注册到全局 Map
    ├─ canvas.insertChild(path)              ← 挂到场景树
    │
    │  [规则7] 开始批量命令
    ├─ commandManager.batchCommandStart()
    ├─ commandManager.pushCommand(
    │     new AddGraphCmd('Add Path', editor, [path]),
    │     { beforeRedo: → pathEditor.active(path),
    │       beforeUndo: → pathEditor.inactive('undo') }
    │   )
    │
    │  进入路径编辑模式
    ├─ pathEditor.active(path)
    │     ├─ showSelectedGraphsOutline = false   ← [规则5] 隐藏普通选中框
    │     ├─ enableTransformControl = false       ← 隐藏缩放/旋转手柄
    │     ├─ setEnableHotKeyTools([PathSelect, DrawPath])  ← 限制可用工具
    │     └─ bindHotkeys()                        ← Esc 退出、Enter 结束
    │
    └─ selectedControl.setItems([{ type:'anchor', pathIdx:0, segIdx:0 }])
```

---

### 第 3 步：点击后续点 → 添加锚点

```
用户点击第二个/第三个/.../第 N 个位置
  → DrawPathTool.onStart()
    │
    │  检测是否靠近起点 [规则4]
    ├─ snapPoint = checkCursorPtInStartAnchor()
    │   └─ distance(光标, 起点) <= 5px/zoom ?
    │
    │  如果不靠近起点：
    ├─ prevAttrs = cloneDeep(path.pathData)    ← 记录变更前属性
    ├─ path.addSeg(pathIdx, {
    │     point: 当前点坐标,
    │     in: {0,0},                            ← [规则2] 初始为直线
    │     out: {0,0},
    │   })
    │
    │  如果靠近起点 → 闭合 [规则4]：
    ├─ path.setPathItemClosed(pathIdx, true)
    └─ path.setSeg(pathIdx, 0, { in: {0,0} })  ← 重设起点的 in
```

---

### 第 4 步：拖拽 → 拉出控制手柄

```
用户按住鼠标拖拽
  → DrawPathTool.onDrag()
    │
    ├─ dx = 当前x - 起点x,  dy = 当前y - 起点y
    │
    │  设置控制手柄 [规则2]
    ├─ out = { x: dx, y: dy }                  ← 出方向手柄跟随鼠标
    │
    │  [规则3] Alt 键判定
    ├─ if (!isAltPressing && lastSegIdx !== 0)
    │     in = { x: -dx, y: -dy }              ← 默认对称
    │   else
    │     （不设 in，打断对称）
    │
    ├─ path.setSeg(pathIdx, segIdx, { out, in })
    │     → 内部把世界坐标转成路径本地坐标
    │     → updateAttrs({ pathData })
    │     → recomputeAttrs()                    ← 重算包围盒
    │
    ├─ pathEditor.drawControlHandles()          ← 重绘锚点和手柄
    └─ editor.render()
```

---

### 第 5 步：松手 → 命令入栈

```
用户松开鼠标
  → DrawPathTool.onEnd()
    │
    │  [规则4] 如果闭合了：清空选中
    ├─ if (closed) selectedControl.clear()
    │
    │  入栈命令 [规则7]
    ├─ commandManager.pushCommand(
    │     new SetGraphsAttrsCmd('Update Path Data',
    │       [path],
    │       [{ transform, pathData }],           ← 新值
    │       [prevAttrs]                          ← 旧值
    │     )
    │   )                                        ← isBatched=true（批量中）
    │
    └─ commandManager.batchCommandEnd()
```

---

### 第 6 步：按 Esc → 退出路径编辑

```
用户按 Esc
  → PathEditor.inactive()
    │
    │  [规则8] 检查空路径
    ├─ removePathIfEmpty()
    │     → pathData.every(item => segs.length <= 1) ?
    │       → removeGraphicsAndRecord(editor, [path])
    │
    │  恢复编辑器状态
    ├─ showSelectedGraphsOutline = true
    ├─ highlightLayersOnHover = true
    ├─ enableTransformControl = true
    ├─ unbindHotkeys()
    ├─ setEnableHotKeyTools(prevToolKeys)       ← 恢复所有工具
    ├─ setActiveTool('select')                  ← 回到选择工具
    └─ controlHandleManager.clearCustomHandles()
```

---

### 第 7 步：路径渲染

```
editor.render()
  → SceneGraph.render()
    → SuikaPath.draw(drawInfo)
      → _realDraw()
        │  [规则6] 遍历 pathData
        ├─ for (pathItem of pathData)
        │     ctx.moveTo(first.point.x, first.point.y)
        │     for (i = 1 → segs.length)
        │       ├─ handle1 = getHandleOut(prevSeg)   ← point + out
        │       ├─ handle2 = getHandleIn(currSeg)    ← point + in
        │       ├─ 都是 {0,0} → ctx.lineTo()         ← 直线段
        │       └─ 否则 → ctx.bezierCurveTo(h1, h2, point)  ← 曲线段
        │     if (closed) ctx.closePath()
        │
        ├─ fill → ctx.fill()
        └─ stroke → ctx.stroke()
```

---

## 五、耦合点

| 耦合系统 | 触发时机 | 为什么需要 |
|---------|---------|-----------|
| PathEditor | 首次点击 / Esc / Enter | 管理路径编辑模式的进入和退出 |
| ControlHandleManager | 每帧 | 绘制锚点、控制手柄、预览线 |
| CommandManager | 每次添加锚点 | batchCommand 标记 + SetGraphsAttrsCmd 入栈 |
| ToolManager | 模式切换 | setEnableHotKeyTools 限制可用工具 |
| SelectedControl | 锚点选中 | 管理哪些锚点/手柄被选中，决定绘制样式 |
| HostEventManager | 拖拽中 | Alt 键检测（打断对称） |

---

## 六、架构设计决策（知其所以然）

### 为什么 in/out 用相对偏移量而不是绝对坐标？
> 如果用绝对坐标，移动锚点时 in 和 out 的绝对位置要一起更新（三个坐标同时改）。用偏移量后只需要改 point，in/out 是"相对于 point 的偏移"，自动跟着动。序列化时数据也更紧凑，因为偏移量通常接近 0（直线段时就是 0），压缩率更高。

### 为什么钢笔工具不继承 DrawGraphicsTool？
> 矩形、椭圆等工具是"拖拽一次完成"——按下 → 拖拽 → 松手 = 一个图形。钢笔工具是"多次点击逐步构建"——每次点击添加一个锚点，路径是逐步生长的。生命周期完全不同，强行继承只会增加 if-else 分支。所以 `DrawPathTool` 直接实现 `ITool` 接口，独立处理自己的逻辑。

### 为什么路径编辑是一个独立模式（PathEditor）？
> 路径编辑和正常编辑的交互完全不同——正常模式下点击选中图形、拖拽移动图形；路径编辑模式下点击选中锚点、拖拽移动锚点。如果不做模式隔离，用户在路径编辑时按 R 画了个矩形，路径编辑的锚点还在，两种交互混在一起很混乱。`PathEditor` 通过限制可用工具 + 隐藏普通 UI 实现干净的模式切换。

### 为什么预览线用 ControlHandle 而不是真正的图形节点？
> 预览线只是视觉提示，不应该出现在场景树、图层面板或序列化数据中。`ControlHandle` 是 UI 叠加层的一部分（和选中框、缩放手柄同级），每帧重新生成，不进入 `doc.graphicsStoreManager`。如果用真正的图形节点，还需要每帧添加/删除/管理它的生命周期，复杂且容易产生残留。

### 为什么 setSeg 要把世界坐标转成路径本地坐标？
> 用户拖拽时的光标位置是世界坐标（场景坐标系），但 pathData 里的 point 和 in/out 是相对于路径自身 transform 的本地坐标。如果不做转换，路径旋转后新添加的锚点会出现在错误的位置。`setSeg` 内部用 `matrix.invert().apply(point)` 把世界坐标转到本地坐标，保证不管路径怎么旋转、缩放、平移，锚点都出现在用户点击的位置。
