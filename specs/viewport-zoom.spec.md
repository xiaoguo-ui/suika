# 视口与缩放导航 Spec

> **一句话说清**：画布是无限大的场景空间，用户通过视口（Viewport）看到其中一部分。`ViewportManager` 管理视口位置（scrollX/scrollY），`ZoomManager` 管理缩放级别（zoom）。坐标转换公式只有两行：`场景坐标 = scroll + 视口坐标 / zoom`（视口→场景），`视口坐标 = (场景坐标 - scroll) × zoom`（场景→视口）。缩放时以光标为中心不偏移，靠 `adjustScroll` 反算新的 scroll 值。

---

## 一、功能概述

用户通过滚轮缩放、空格+拖拽平移、中键拖拽平移来导航画布。所有图形存在场景坐标系（无限大），用户屏幕只显示视口范围内的部分。缩放/平移改变的不是图形坐标，而是"视口在场景中的位置和缩放比例"。

**涉及文件**：

| 文件 | 职责 |
|------|------|
| `viewport_manager.ts` | `ViewportManager`：管理视口位置（scrollX/Y）和画布尺寸（width/height） |
| `zoom_manager.ts` | `ZoomManager`：管理缩放级别 + 缩放算法（以光标为中心）+ zoomToFit |
| `canvas_dragger.ts` | `CanvasDragger`：空格/中键拖拽平移画布 |
| `tools/tool_drag_canvas.ts` | `DragCanvasTool`：手型工具（H 键），委托给 CanvasDragger |
| `host_event_manager.ts` | 滚轮事件分发：Ctrl+滚轮=缩放，普通滚轮=平移 |
| `common.ts` | `viewportCoordsToSceneUtil` / `sceneCoordsToViewportUtil`：坐标转换公式 |

---

## 二、用户操作流程

| 步骤 | 用户做了什么 | 系统响应 |
|:----:|-------------|---------|
| 1 | Ctrl + 滚轮上 | 以光标位置为中心放大 |
| 2 | Ctrl + 滚轮下 | 以光标位置为中心缩小 |
| 3 | 普通滚轮上下 | 垂直平移画布 |
| 4 | 普通滚轮左右（触控板） | 水平平移画布 |
| 5 | 按住空格 + 鼠标拖拽 | 平移画布（光标变手型） |
| 6 | 鼠标中键拖拽 | 平移画布（同上） |
| 7 | 按 H 键 | 切换到手型工具，拖拽即平移 |
| 8 | Ctrl+0 | 缩放至适应全部内容（zoomToFit） |
| 9 | Ctrl+1 | 重置到 100% 并居中原点 |

---

## 三、业务规则

### 规则1：坐标转换公式——整个系统的基石
- **代码线索**：`viewportCoordsToSceneUtil`、`sceneCoordsToViewportUtil`
- **预期位置**：`common.ts:51-84`
- **验证方法**：在画布上放一个矩形，缩放/平移后检查 `toScenePt` 和 `toViewportPt` 返回值
- **验证结果**：✅ 已找到
- **代码位置**：`common.ts:51`（视口→场景）、`common.ts:74`（场景→视口）
- **为什么这么设计**：

  ```
  视口→场景：sceneX = scrollX + viewportX / zoom
  场景→视口：viewportX = (sceneX - scrollX) × zoom
  ```

  只有两个变量：`scroll`（视口左上角在场景中的位置）和 `zoom`（缩放比例）。所有坐标转换都基于这两个值。`scroll` 类似"相机位置"，`zoom` 类似"相机焦距"。视口坐标除以 zoom 得到场景单位的偏移量，加上 scroll（相机位置）就是场景坐标。反过来减 scroll 乘 zoom 就回到视口坐标。整个系统中所有 `toScenePt`、`toViewportPt`、`getSceneCursorXY` 都调这两个函数。

### 规则2：缩放以光标位置为中心，不以画布中心
- **代码线索**：`adjustScroll(prevZoom, center)`、`center = point`（来自鼠标位置）
- **预期位置**：`zoom_manager.ts:194-218`
- **验证方法**：把光标放在画布左上角缩放，内容应该"定住"左上角；放在右下角缩放，"定住"右下角
- **验证结果**：✅ 已找到
- **代码位置**：`zoom_manager.ts:194`（adjustScroll）
- **为什么这么设计**：如果总是以画布中心缩放，用户盯着左上角某个细节缩放时，内容会跑到屏幕外去，需要反复平移。以光标为中心缩放意味着"你盯着哪里，哪里就不动"。算法：
  1. 用 `prevZoom` 把光标视口坐标转成场景坐标（`sceneX = scrollX + centerX / prevZoom`）
  2. 用新 zoom 反算新的 scroll（`newScrollX = sceneX - centerX / newZoom`）
  3. 效果：场景中光标指向的那个点，在视口中的位置不变

  如果不传 center（比如键盘快捷键缩放），默认取画布中心 `getCanvasCenter()`。

### 规则3：缩放有上下限（zoomMin / zoomMax）
- **代码线索**：`zoomMax`、`zoomMin`、`Math.min`、`Math.max`
- **预期位置**：`zoom_manager.ts:24-36`（setZoom）、`zoom_manager.ts:67-70`（zoomIn）、`zoom_manager.ts:93-96`（zoomOut）
- **验证方法**：疯狂滚轮缩放，观察是否有极限值
- **验证结果**：✅ 已找到
- **代码位置**：`zoom_manager.ts:28`（zoomMax 限制）、`zoom_manager.ts:33`（zoomMin 限制）
- **为什么这么设计**：没有上限的话缩放到 10000% 会导致坐标溢出、线条消失、渲染崩溃。没有下限的话缩到 0.001% 画布就是一个像素点看不到。`setZoom` 在最底层做 clamp，所有调用方（`zoomIn/zoomOut/zoomToFit`）不需要各自做边界检查。

### 规则4：滚轮缩放步长和 deltaY 成对数关系
- **代码线索**：`deltaYToZoomStep`、`Math.log(Math.abs(deltaY))`
- **预期位置**：`zoom_manager.ts:103-105`
- **验证方法**：快速滚轮 vs 慢速滚轮，观察缩放幅度不同
- **验证结果**：✅ 已找到
- **代码位置**：`zoom_manager.ts:103`（deltaYToZoomStep）
- **为什么这么设计**：触控板的 deltaY 范围非常大（轻划 1-5，快划可能 100+）。如果线性映射，轻划几乎无反应，快划跳太多。用 `log(|deltaY|)` 做对数映射，让小 deltaY 也有足够响应，大 deltaY 不会过冲。系数 `0.12937973` 和 `0.33227472` 是拟合调参出来的，下限 `Math.max(0.05, ...)` 保证最小步长。

### 规则5：级别缩放用二分查找最近的预设缩放级别
- **代码线索**：`isLevelZoom`、`getNearestVals(levels, prevZoom)`
- **预期位置**：`zoom_manager.ts:59-63`（zoomIn）、`zoom_manager.ts:85-89`（zoomOut）、`zoom_manager.ts:233-251`（getNearestVals）
- **验证方法**：用 Ctrl+= / Ctrl+- 快捷键缩放，观察是否跳到 25%、50%、100%、200% 等整数级别
- **验证结果**：✅ 已找到
- **代码位置**：`zoom_manager.ts:233`（getNearestVals 二分查找）
- **为什么这么设计**：连续缩放（滚轮）用乘法步进 `zoom * (1 + step)`，平滑但停不到整数。级别缩放用预设数组 `[0.25, 0.5, 1, 2, 4, ...]`，从当前 zoom 找左右最近值——zoomIn 取右邻居，zoomOut 取左邻居。二分查找 O(log n) 高效。两种模式共存满足不同场景。

### 规则6：CanvasDragger 三种触发方式——空格、中键、H 工具
- **代码线索**：`spaceToggle`、`wheelBtnToggle`、`DragCanvasTool.onActive() → canvasDragger.active()`
- **预期位置**：`canvas_dragger.ts:34-50`（空格/中键监听）、`tool_drag_canvas.ts:16-23`（H 工具）
- **验证方法**：分别用空格+拖拽、中键拖拽、H 键拖拽，效果相同
- **验证结果**：✅ 已找到
- **代码位置**：`canvas_dragger.ts:34`（spaceToggle）、`canvas_dragger.ts:43`（wheelBtnToggle）、`tool_drag_canvas.ts:17`（H 工具）
- **为什么这么设计**：三种触发方式最终都委托给同一个 `CanvasDragger` 的 `active/inactive`，避免重复实现拖拽逻辑。空格和中键是"临时切换"（松开即恢复），H 工具是"持久切换"（需要手动切其他工具）。`DragCanvasTool` 激活时调 `disableDragBySpace()` 防止空格和 H 工具冲突。

### 规则7：拖拽平移的位移要除以 zoom
- **代码线索**：`viewportX = startViewportPos.x - dx / zoom`
- **预期位置**：`canvas_dragger.ts:129-142`（onDrag）
- **验证方法**：在 200% 缩放下拖拽画布，观察平移速度和 100% 时一致（视觉上移动相同距离）
- **验证结果**：✅ 已找到
- **代码位置**：`canvas_dragger.ts:138`
- **为什么这么设计**：鼠标拖拽的 `dx/dy` 是视口像素。视口中移动 100px，在 200% 缩放下对应场景中只移动 50 个场景单位（100 / 2）。如果不除以 zoom，缩放越大平移越快，手感不一致。同理普通滚轮平移也做了 `deltaX / zoom`、`deltaY / zoom`（`host_event_manager.ts:131-133`）。

### 规则8：普通滚轮平移 vs Ctrl+滚轮缩放的分流
- **代码线索**：`event.ctrlKey || event.metaKey`、`viewportManager.translate` vs `zoomManager.zoomIn/Out`
- **预期位置**：`host_event_manager.ts:103-136`
- **验证方法**：滚轮上下 = 画布上下移动；Ctrl + 滚轮 = 缩放
- **验证结果**：✅ 已找到
- **代码位置**：`host_event_manager.ts:104`（Ctrl 判断分流）
- **为什么这么设计**：和 Figma/Google Maps/浏览器 一致的交互惯例。Ctrl+滚轮是"缩放"，普通滚轮是"滚动"。Mac 触控板双指捏合时浏览器自动加 `ctrlKey=true`，所以 pinch-to-zoom 也自然走缩放分支。`invertZoomDirection` 设置支持反转方向（某些用户习惯相反）。

### 规则9：zoomToFit 按视口宽高比和内容宽高比取较小缩放
- **代码线索**：`zoomRectToFit`、`viewportRatio > bboxRatio ? vh / rect.height : vw / rect.width`
- **预期位置**：`zoom_manager.ts:120-150`
- **验证方法**：按 Ctrl+0，观察所有内容刚好填满画布（留 padding）
- **验证结果**：✅ 已找到
- **代码位置**：`zoom_manager.ts:139`（比例计算）
- **为什么这么设计**：经典的"contain"适应算法。如果视口比内容更宽（viewportRatio > bboxRatio），则高度是瓶颈，用高度算 zoom；反之用宽度算 zoom。保证内容完全可见且不裁切。padding 和 rulerWidth 从可用空间中扣除，避免内容被标尺遮挡。`zoomToSelection` 对选中元素做同样的适应。

### 规则10：ViewportManager 设置尺寸时同步更新 Canvas DOM 和 DPR
- **代码线索**：`canvasElement.width = width * dpr`、`canvasElement.style.width = width + 'px'`
- **预期位置**：`viewport_manager.ts:24-46`
- **验证方法**：浏览器窗口 resize 后画布不模糊
- **验证结果**：✅ 已找到
- **代码位置**：`viewport_manager.ts:35`（物理像素）、`viewport_manager.ts:36`（CSS 像素）
- **为什么这么设计**：`canvasElement.width` 是物理像素（实际渲染分辨率），`style.width` 是 CSS 像素（布局尺寸）。在 2x Retina 屏上，CSS 宽度 800px 对应物理 1600px。不乘 dpr 的话 Canvas 只有 800 物理像素渲染在 1600 物理像素的区域，文字和线条会模糊。这和渲染系统 spec 里的 DPR 适配是同一个机制。

---

## 四、核心代码路径（完整调用链）

### 第 1 步：Ctrl + 滚轮 → 缩放

```
用户 Ctrl + 滚轮
  → HostEventManager.bindWheelEvent() → onWheel(event)
    │
    │  [规则8] 分流：ctrlKey || metaKey → 缩放
    ├─ point = editor.getCursorXY(event)      ← 鼠标在视口中的坐标
    ├─ isZoomOut = deltaY > 0                 ← 下滚=缩小
    │   └─ invertZoomDirection ? 取反
    │
    ├─ if (isZoomOut)
    │     editor.zoomManager.zoomOut({ center: point, deltaY })
    │   else
    │     editor.zoomManager.zoomIn({ center: point, deltaY })
    │
    └─ editor.render()
```

---

### 第 2 步：zoomIn 内部

```
ZoomManager.zoomIn({ center, deltaY })
  │
  │  [规则4] 计算缩放步长
  ├─ zoomStep = deltaYToZoomStep(deltaY)
  │     = max(0.05, 0.129 × log(|deltaY|) - 0.332)
  │
  │  [规则3] 计算新 zoom 并 clamp
  ├─ zoom = min(prevZoom × (1 + zoomStep), zoomMax)
  ├─ setZoom(zoom)                            ← clamp(zoomMin, zoomMax)
  │
  │  [规则2] 以光标为中心调整 scroll
  └─ adjustScroll(prevZoom, center)
       ├─ sceneX = scrollX + centerX / prevZoom     ← 光标指向的场景坐标
       ├─ newScrollX = sceneX - centerX / newZoom    ← 保持场景点在视口中不动
       └─ viewportManager.setViewport({ x: newScrollX, y: newScrollY })
```

---

### 第 3 步：普通滚轮 → 平移

```
用户普通滚轮（不按 Ctrl）
  → onWheel(event)
    │
    │  [规则8] 分流：无 ctrlKey → 平移
    │  [规则7] 位移除以 zoom
    ├─ viewportManager.translate(deltaX / zoom, deltaY / zoom)
    │     ├─ scrollX += dx
    │     ├─ scrollY += dy
    │     └─ emit('xOrYChange')               ← 通知标尺等 UI 更新
    │
    └─ editor.render()
```

---

### 第 4 步：空格 + 拖拽 → 画布平移

```
用户按住空格
  → HostEventManager.emit('spaceToggle', true)
    → CanvasDragger.handleSpaceToggle(true)
      → canvasDragger.active()
        ├─ _active = true
        ├─ setCursor('grab')                   ← 光标变手型
        └─ bindEventWhenActive()               ← 监听 start/drag/end

用户按住鼠标拖拽
  → CanvasDragger.onStart(event)
    ├─ setCursor('grabbing')                   ← 光标变抓取
    ├─ startVwPos = 当前视口坐标
    └─ startViewportPos = viewportManager.getViewport()

  → CanvasDragger.onDrag(event)
    │  [规则7] 计算视口位移
    ├─ dx = vwPos.x - startVwPos.x
    ├─ dy = vwPos.y - startVwPos.y
    ├─ viewportX = startViewportPos.x - dx / zoom
    ├─ viewportY = startViewportPos.y - dy / zoom
    ├─ viewportManager.setViewport({ x: viewportX, y: viewportY })
    └─ editor.render()

用户松开空格
  → HostEventManager.emit('spaceToggle', false)
    → CanvasDragger.inactive()
      ├─ 如果正在拖拽 → 延迟到 pointerUp 后再 inactive
      └─ 如果已松手 → unbindEvent + 恢复工具光标
```

---

### 第 5 步：zoomToFit（Ctrl+0）

```
用户按 Ctrl+0
  → ZoomManager.zoomToFit()
    │
    │  获取所有内容的包围盒
    ├─ canvasBbox = editor.getCanvasBbox()
    │     └─ 空 → reset()（回到 100% 居中原点）
    │
    │  [规则9] 适应缩放
    ├─ zoomRectToFit(rect)
    │     ├─ padding = zoomToFixPadding
    │     ├─ rulerWidth = enableRuler ? rulerWidth : 0
    │     │
    │     │  contain 算法
    │     ├─ viewportRatio = vw / vh
    │     ├─ bboxRatio = rect.width / rect.height
    │     ├─ newZoom = viewportRatio > bboxRatio
    │     │     ? vh / rect.height           ← 高度瓶颈
    │     │     : vw / rect.width            ← 宽度瓶颈
    │     │
    │     │  居中内容
    │     ├─ newViewportX = rect.x - (vw/newZoom - rect.width) / 2
    │     ├─ newViewportY = rect.y - (vh/newZoom - rect.height) / 2
    │     │
    │     ├─ setZoom(newZoom)
    │     └─ viewportManager.setViewport({ x, y })
    │
    └─ editor.render()
```

---

### 第 6 步：渲染时坐标转换

```
SceneGraph.render()
  → ctx.scale(dpr, dpr)                      ← DPR 适配
  → ctx.scale(zoom, zoom)                    ← 缩放
  → ctx.translate(-scrollX, -scrollY)        ← 平移到视口位置
  → 遍历场景树绘制图形                         ← 图形用场景坐标

工具中获取场景坐标
  → editor.getSceneCursorXY(event)
    → editor.getCursorXY(event)               ← 浏览器坐标 → 视口坐标
    → editor.toScenePt(x, y)                  ← [规则1] 视口 → 场景
```

---

## 五、耦合点

| 耦合系统 | 触发时机 | 为什么需要 |
|---------|---------|-----------|
| SceneGraph | 每帧 render | `ctx.scale(zoom)` + `ctx.translate(-scroll)` 做视口变换 |
| HostEventManager | 滚轮事件 | 分流到 zoomIn/Out 或 translate |
| ToolManager | 所有工具 | `getSceneCursorXY` 把鼠标位置转成场景坐标 |
| Ruler / Grid | scroll/zoom 变化 | 标尺刻度和网格步长跟着 zoom 调整 |
| CanvasDragger | 空格/中键/H工具 | 平移画布 |
| Setting | 全局配置 | zoomMin/Max、zoomStep、zoomLevels、invertZoomDirection |

---

## 六、架构设计决策（知其所以然）

### 为什么视口用 scroll + zoom 而不是 transform 矩阵？
> transform 矩阵（3x3）可以表达更多变换（旋转、倾斜），但画布导航只需要平移和缩放两个自由度。用 `scrollX/Y` + `zoom` 三个标量值比矩阵更直观，转换公式更简单（`x/zoom + scroll` 而不是矩阵乘法），debug 时一眼能看出"当前在哪、放大多少"。如果以后需要画布旋转（如 Procreate），才有必要改用矩阵。

### 为什么 adjustScroll 要用 prevZoom 反算场景坐标？
> 缩放改变的是 zoom，但 scroll 没变。如果不调整 scroll，光标指向的场景位置在新 zoom 下会偏移——因为 `sceneX = scroll + vwX / zoom`，zoom 变了 sceneX 就变了。`adjustScroll` 先用旧 zoom 算出"光标指向哪个场景点"，再用新 zoom 反算出"让这个场景点在视口中不动"需要什么 scroll 值。数学上等价于：**光标是缩放的不动点**。

### 为什么 CanvasDragger 不是一个 Tool？
> 拖拽画布是一个"穿越工具"的行为——用户在画矩形时按空格也能平移。如果做成 Tool，就需要切换工具 → 平移 → 切回原工具，而且 ToolManager 的工具栈不支持"临时中断"。`CanvasDragger` 独立于工具系统，空格按下即激活，松开即恢复，不影响当前工具状态。`DragCanvasTool`（H 键）是特例——它是一个"持久平移"工具，内部也只是委托给 `CanvasDragger`。

### 为什么 zoomChange 用 `Promise.resolve().then()` 异步通知？
> `setZoom` 可能在一次操作中被连续调用多次（比如 zoomToFit 内部先 setZoom 再 setViewport），如果同步触发事件，监听者（如 UI 组件）会在中间状态被通知，导致闪烁或多余渲染。用微任务延迟到当前调用栈执行完毕后再通知，确保 zoom 和 scroll 都已就绪。