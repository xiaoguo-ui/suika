# 渲染系统 Spec

> **一句话说清**：`editor.render()` 通过 `rafThrottle` 节流后触发 `SceneGraph.render()`，先清屏设视口变换，然后从根节点 `SuikaCanvas` 递归调用每个图形的 `draw` 方法（Canvas 2D API），最后在屏幕空间叠加绘制 UI 层（网格、选中框、控制手柄、参考线、标尺）。

---

## 一、功能概述

用户在画布上的任何操作（画图、移动、缩放、旋转、选中、缩放视口等）最终都会触发一次完整的画面重绘。渲染系统负责将场景树中所有图形正确地画到屏幕上。

**涉及文件**：

| 文件 | 职责 |
|------|------|
| `editor.ts` | 创建 Canvas 元素和 2D 上下文，`render()` 入口 |
| `scene/scene_graph.ts` | 渲染编排：清屏 → 视口变换 → 图形绘制 → UI 叠加层 |
| `graphics/graphics/graphics.ts` | 基类：`draw` 递归子节点、`fillImage` 图片填充、`drawOutline` 选中轮廓 |
| `graphics/rect.ts` | 矩形：`_realDraw` 用 `ctx.rect/roundRect` |
| `graphics/ellipse.ts` | 椭圆：`draw` 用 `ctx.ellipse` |
| `graphics/line.ts` | 线段：`draw` 用 `ctx.moveTo/lineTo` |
| `graphics/frame/frame.ts` | Frame/Group：`_realDraw` 画自身 + `clip` 裁剪 + `super.draw` 递归子元素 |
| `graphics/path/path.ts` | 路径：`_realDraw` 用 `moveTo/lineTo/bezierCurveTo` |
| `graphics/utils.ts` | `drawLayer` 离屏合成（24 行） |
| `utils/raf_throttle.ts` | `rafThrottle` 节流函数（24 行） |
| `grid.ts` | 像素网格绘制 |
| `viewport_manager.ts` | 视口坐标管理（scrollX/scrollY） |
| `zoom_manager.ts` | 缩放管理（zoom 值、缩放限制） |

---

## 二、用户操作流程

| 步骤 | 用户做了什么 | 系统响应 |
|:----:|-------------|---------|
| 1 | 画了一个矩形 / 移动了图形 / 缩放了视口 | 触发 `editor.render()` |
| 2 | （自动） | `SceneGraph.render` 被 RAF 节流，合并到下一帧 |
| 3 | （自动） | 清空画布、设置视口变换 |
| 4 | （自动） | 递归绘制场景树中所有图形 |
| 5 | （自动） | 叠加绘制 UI 层（网格、选中框、手柄、参考线、标尺） |
| 6 | 用户看到更新后的画面 | 一帧完成 |

---

## 三、业务规则

### 规则1：所有渲染通过 rafThrottle 节流，一帧最多画一次
- **代码线索**：`rafThrottle`、`requestAnimationFrame`
- **预期位置**：`SceneGraph.render` 的定义处
- **验证方法**：快速连续移动多个图形，观察是否有丢帧/卡顿而不是重复渲染
- **验证结果**：✅ 已找到
- **代码位置**：`scene/scene_graph.ts:61`（`render = rafThrottle(...)`）、`utils/raf_throttle.ts:4`（实现）
- **为什么这么设计**：一次拖拽中 `pointermove` 事件每秒可能触发 60-120 次，每次都调 `editor.render()`。如果不节流，同一帧内可能重复清屏、重绘 3-4 次，全是浪费——因为浏览器一帧只刷新一次屏幕（60fps = 16.6ms）。`rafThrottle` 用 `requestAnimationFrame` 把多次 render 调用合并成一次，保证每帧只画一次。如果用普通的 `setTimeout` 节流，时间间隔和屏幕刷新率不一定对齐，会出现画面撕裂或跳帧。

### 规则2：渲染分两个坐标空间——场景空间和屏幕空间
- **代码线索**：`ctx.scale(dpr * zoom)`、`ctx.translate(dx, dy)`、`ctx.setTransform(1,0,0,1,0,0)`
- **预期位置**：`SceneGraph.render` 方法内，图形绘制前后
- **验证方法**：缩放和平移画布，观察图形跟着动但 UI（标尺、手柄）大小不变
- **验证结果**：✅ 已找到
- **代码位置**：`scene_graph.ts:85-90`（场景空间变换）、`scene_graph.ts:104`（切回屏幕空间）
- **为什么这么设计**：图形需要跟着视口的缩放和平移动（场景空间），但 UI 元素（选中框线宽、控制手柄大小、标尺刻度）必须保持固定的屏幕像素大小，不能跟着缩放。所以渲染分两步：先在场景空间画图形（`ctx.scale(dpr * zoom)` + `ctx.translate(-viewport.x, -viewport.y)`），画完后 `ctx.setTransform(1,0,0,1,0,0)` 重置到屏幕空间再画 UI。如果不分开，放大到 800% 时选中框会粗成一坨，缩小到 10% 时手柄小到看不见。

### 规则3：每个图形在本地坐标系下绘制，用 transform 矩阵定位
- **代码线索**：`ctx.transform(...this.attrs.transform)`、`ctx.save()` / `ctx.restore()`
- **预期位置**：每个图形类的 `draw` 或 `_realDraw` 方法开头
- **验证方法**：旋转一个矩形 45 度，观察它是否正确旋转而不是变形
- **验证结果**：✅ 已找到
- **代码位置**：`rect.ts:76`（`ctx.transform(...transform)`）、`ellipse.ts:60`、`line.ts:39`
- **为什么这么设计**：每个图形的 `draw` 方法都是从 (0,0) 开始画，画 `width × height` 大小的形状。位置、旋转、缩放全部编码在 transform 矩阵里，通过 `ctx.transform()` 应用。这样做的好处是：(1) 绘制代码极简——矩形永远是 `ctx.rect(0, 0, width, height)`，不需要算旋转后的四个顶点；(2) hitTest 也可以用 `matrix.applyInverse(point)` 把点击位置反转到本地坐标系，简化碰撞检测；(3) 嵌套容器（Frame 套 Frame）时矩阵自动累乘，不需要手动算绝对坐标。用 `ctx.save()/restore()` 确保一个图形的变换不污染下一个。

### 规则4：场景树递归绘制，后绘制的在上面
- **代码线索**：基类 `draw` 方法中 `for (const child of this.children) { child.draw(drawInfo) }`
- **预期位置**：`graphics.ts:479-490`（基类 draw）、`frame.ts:207-231`（Frame 重写 draw）
- **验证方法**：创建两个重叠的矩形，后创建的显示在上面；在图层面板调整顺序后渲染顺序跟着变
- **验证结果**：✅ 已找到
- **代码位置**：`graphics.ts:486`（遍历 children）、`scene_graph.ts:98`（从根节点 `canvasGraphics.draw` 开始）
- **为什么这么设计**：Canvas 2D 没有 z-index 概念，后画的像素覆盖先画的。所以场景树的 children 数组顺序就是渲染顺序——索引小的先画（在底层），索引大的后画（在顶层）。图层面板的拖拽排序实际上就是在调整 children 数组的位置。这比维护一个独立的 z-order 系统简单得多——不需要排序，不需要额外的数据结构，数组顺序即渲染顺序。

### 规则5：半透明图形用离屏 Canvas 合成，避免透明度叠加
- **代码线索**：`drawLayer`、`opacity !== 1`、`document.createElement('canvas')`
- **预期位置**：`rect.ts:132-137`（判断 opacity）、`utils.ts:1-24`（drawLayer 实现）
- **验证方法**：画一个有填充和描边的矩形，把透明度调到 50%，观察填充和描边是否均匀半透明（而不是描边更深）
- **验证结果**：✅ 已找到
- **代码位置**：`graphics/utils.ts:2`（drawLayer 函数）、`rect.ts:132`、`ellipse.ts:107`
- **为什么这么设计**：如果直接在主 Canvas 上设 `globalAlpha = 0.5` 画填充再画描边，描边和填充的重叠区域会叠加成 75% 不透明（0.5 + 0.5×0.5），视觉上描边比填充更深，不对。`drawLayer` 的做法是：创建一个临时 Canvas，在上面以 100% 不透明画完填充和描边，然后把这个临时 Canvas 整体以 50% 透明度 `drawImage` 回主 Canvas。这样填充和描边作为一个整体统一应用透明度，视觉效果正确。代价是每个半透明图形都要创建一个临时 Canvas，但半透明图形通常不多，性能可接受。

### 规则6：Frame 非 Group 时会 clip 裁剪子元素
- **代码线索**：`ctx.clip()`、`this.isGroup()`、`super.draw(drawInfo)`
- **预期位置**：`frame.ts:207-231`（Frame 的 draw 方法）
- **验证方法**：创建一个 Frame，把子元素拖出 Frame 边界，观察超出部分是否被裁剪
- **验证结果**：✅ 已找到
- **代码位置**：`frame.ts:216-230`
- **为什么这么设计**：Frame 和 Group 都用 `SuikaFrame` 类，通过 `resizeToFit` 区分：Group (`resizeToFit=true`) 自动调整自身大小包裹所有子元素，所以不需要裁剪；Frame (`resizeToFit=false`) 有固定尺寸，子元素超出边界应该被隐藏（和 Figma 行为一致）。实现上，Frame 先 `_realDraw` 画自身背景/边框（建路径 `ctx.rect`），然后 `ctx.clip()` 将后续绘制限制在这个矩形内，再 `super.draw()` 递归画子元素。Group 则跳过 `_realDraw` 和 `clip`，直接递归画子元素。

### 规则7：不可见、已删除或透明度为零的图形跳过绘制
- **代码线索**：`if (!this.isVisible() || opacity === 0) return`
- **预期位置**：每个图形类 `draw` 方法的第一行
- **验证方法**：隐藏一个图形（图层面板点眼睛图标），观察它是否不再显示
- **验证结果**：✅ 已找到
- **代码位置**：`rect.ts:147`、`ellipse.ts:53`、`line.ts:35`、`frame.ts:209`
- **为什么这么设计**：这是渲染的基本优化——不画用户看不到的东西。`isVisible()` 检查 `attrs.visible`（图层面板的显隐），`opacity === 0` 检查完全透明（画了也白画）。注意这里没有做视口裁剪（判断图形是否在当前可见区域内），因为 Canvas 2D 本身会跳过画布外的绘制命令，浏览器底层已经帮你做了这个优化。如果用 WebGL 就需要手动做视锥剔除。

### 规则8：DPR 适配保证高清屏不模糊
- **代码线索**：`getDevicePixelRatio()`、`ctx.scale(dpr * zoom, dpr * zoom)`、`canvas.width = width * dpr`
- **预期位置**：`scene_graph.ts:85-89`（渲染时 scale）、`viewport_manager.ts:35-36`（设置 canvas 物理尺寸）
- **验证方法**：在 Retina 屏（DPR=2）上看图形边缘是否清晰，不糊
- **验证结果**：✅ 已找到
- **代码位置**：`scene_graph.ts:85`（`const dpr = getDevicePixelRatio()`）、`scene_graph.ts:89`（`ctx.scale(dpr * zoom, ...)`）、`viewport_manager.ts:35`（`canvas.width = width * dpr`）
- **为什么这么设计**：Retina 屏的一个 CSS 像素对应 2×2 个物理像素。如果 canvas 的物理尺寸（`canvas.width`）等于 CSS 尺寸，浏览器会把 1 个像素拉伸成 4 个，图形边缘就模糊了。解决方法是：canvas 物理尺寸设为 CSS 尺寸 × DPR（`canvas.width = width * dpr`），CSS 尺寸不变（`canvas.style.width = width + 'px'`），然后绘制时 `ctx.scale(dpr, dpr)` 放大坐标系。这样每个 CSS 像素有 DPR² 个物理像素用来画，线条和文字就清晰了。

### 规则9：UI 叠加层在屏幕空间按固定顺序绘制
- **代码线索**：`drawGraphsOutline`、`grid.draw`、`selectedBox.draw`、`controlHandleManager.draw`、`refLine.drawRefLine`、`ruler.draw`
- **预期位置**：`SceneGraph.render` 方法的后半段（`ctx.setTransform` 重置之后）
- **验证方法**：同时看到选中框、参考线、标尺，它们互不遮挡且大小不随缩放变化
- **验证结果**：✅ 已找到
- **代码位置**：`scene_graph.ts:102-207`
- **为什么这么设计**：UI 叠加层的绘制顺序决定了谁盖住谁：像素网格（最底）→ hover 轮廓 → 选中轮廓 → 选中框 → Frame 标题 → 控制手柄 → 文本编辑范围 → 框选矩形 → 参考线 → 标尺（最顶）。这个顺序是精心设计的——标尺在最顶层因为它是固定的 UI，不应该被任何东西遮挡；控制手柄要在选中框之上，否则用户点不到手柄；参考线要在控制手柄之上，因为对齐时需要清晰可见。每个 UI 元素都在屏幕空间绘制（`ctx.scale(dpr, dpr)`，不含 zoom），所以缩放画布时它们大小不变。

### 规则10：图片填充用 cover 模式缩放，支持圆角裁剪
- **代码线索**：`fillImage`、`calcCoverScale`、`drawRoundRectPath`、`ctx.clip()`
- **预期位置**：`graphics.ts:512-568`（fillImage 方法）
- **验证方法**：给一个矩形设置图片填充，调整矩形宽高，观察图片是否始终填满（不留白边）
- **验证结果**：✅ 已找到
- **代码位置**：`graphics.ts:512`（fillImage 定义）、`graphics.ts:542`（calcCoverScale）
- **为什么这么设计**：图片填充用 CSS 的 `background-size: cover` 逻辑——取宽高中缩放比例较大的那个，保证图片完全覆盖图形区域，多出来的裁掉。如果用 `contain`（取较小的），图形内会有空白区域。`calcCoverScale` 就是在做这个计算。圆角裁剪通过 `drawRoundRectPath` 建一个圆角矩形路径然后 `ctx.clip()`，后续的 `drawImage` 就只画在圆角区域内。这和 CSS 的 `border-radius` + `overflow: hidden` 是同一个效果。

---

## 四、核心代码路径（完整调用链）

### 第 1 步：触发渲染

```
用户操作（画图/移动/缩放/...）
  → editor.render()                           ← 仅 3 行，委托给 sceneGraph
    → SceneGraph.render()                      ← rafThrottle 包装，合并到下一帧
```

---

### 第 2 步：清屏 + 视口变换（场景空间）

```
SceneGraph.render()
  │
  │  清屏
  ├─ ctx.setTransform(1,0,0,1,0,0)            ← 重置任何之前的变换
  ├─ ctx.clearRect(0,0, canvas.width, height)  ← 整块擦除
  ├─ ctx.fillStyle = canvasBgColor → fillRect  ← 画背景色
  │
  │  建立场景坐标系
  ├─ dpr = getDevicePixelRatio()               ← 高清屏适配
  ├─ dx = -viewport.x, dy = -viewport.y        ← 视口平移量
  ├─ ctx.scale(dpr * zoom, dpr * zoom)         ← [规则8] DPR × 缩放
  └─ ctx.translate(dx, dy)                     ← 视口平移
```

---

### 第 3 步：递归绘制场景树（核心）

```
canvasGraphics.draw({ ctx, imgManager, smooth })
  │
  │  基类 SuikaGraphics.draw（容器节点走这里）
  ├─ if (!this.isVisible()) return              ← [规则7] 不可见则跳过
  ├─ ctx.save()
  ├─ ctx.transform(...this.attrs.transform)     ← [规则3] 应用本地变换矩阵
  ├─ for (child of this.children)               ← [规则4] 按数组顺序递归
  │     child.draw(drawInfo)
  │       │
  │       │  如果 child 是 SuikaRect：
  │       ├─ opacity = this.getOpacity()
  │       ├─ if (!isVisible || opacity===0) return   ← [规则7]
  │       ├─ _realDraw({ ctx, opacity })
  │       │    ├─ ctx.save()
  │       │    ├─ ctx.transform(...transform)         ← [规则3]
  │       │    ├─ ctx.beginPath()
  │       │    ├─ cornerRadius ? ctx.roundRect() : ctx.rect()
  │       │    ├─ for (paint of fill)
  │       │    │    ├─ Solid → ctx.fillStyle + ctx.fill()
  │       │    │    └─ Image → fillImage()            ← [规则10]
  │       │    ├─ for (paint of stroke)
  │       │    │    └─ Solid → ctx.strokeStyle + ctx.stroke()
  │       │    ├─ opacity !== 1 ? drawLayer()         ← [规则5] 离屏合成
  │       │    └─ ctx.restore()
  │       │
  │       │  如果 child 是 SuikaFrame（非 Group）：
  │       ├─ _realDraw()                              ← 画自身背景/边框
  │       ├─ ctx.clip()                               ← [规则6] 裁剪区域
  │       ├─ super.draw() → 递归画子元素（被裁剪）
  │       └─ ctx.restore()
  │       │
  │       │  如果 child 是 SuikaFrame（Group）：
  │       ├─ （跳过 _realDraw 和 clip）
  │       └─ super.draw() → 递归画子元素（不裁剪）
  │       │
  │       │  如果 child 是 SuikaEllipse：
  │       └─ ctx.ellipse(cx, cy, rx, ry, 0, 0, 2π) + fill/stroke
  │
  └─ ctx.restore()
```

---

### 第 4 步：切换到屏幕空间，绘制 UI 叠加层

```
SceneGraph.render()（续）
  │
  │  重置到屏幕空间
  ├─ ctx.setTransform(1,0,0,1,0,0)
  ├─ ctx.scale(dpr, dpr)                       ← 只有 DPR，不含 zoom
  │
  │  [规则9] 按固定顺序绘制 UI 叠加层：
  ├─ ① 像素网格（zoom >= minPixelGridZoom 时才画）
  │     → Grid.draw()
  │
  ├─ ② hover 轮廓（鼠标悬停在未选中图形上时）
  │     → drawGraphsOutline([hlItem], hoverStrokeWidth, hoverStroke)
  │       → 重新建立场景空间 ctx.scale(dpr*zoom) + translate
  │       → graphics.drawOutline(ctx, stroke, strokeWidth / zoom)
  │                                             ← 线宽除以 zoom，屏幕上大小恒定
  │
  ├─ ③ 选中轮廓（已选中图形的蓝色边框）
  │     → drawGraphsOutline(selectedItems, ...)
  │     → selectedBox.draw()
  │
  ├─ ④ 路径编辑轮廓（钢笔工具激活时）
  │     → drawGraphsOutline([path], ...)
  │
  ├─ ⑤ Frame 标题文字
  │     → frame.drawText(ctx, x, y)
  │
  ├─ ⑥ 控制手柄（缩放/旋转手柄）
  │     → controlHandleManager.draw()
  │
  ├─ ⑦ 文本编辑光标/选区
  │     → textEditor.drawRange()
  │
  ├─ ⑧ 框选矩形（蓝色半透明选区框）
  │     → if (this.selection) ctx.fillRect/strokeRect
  │
  ├─ ⑨ 参考线（吸附对齐线）
  │     → refLine.drawRefLine(ctx)
  │
  └─ ⑩ 标尺（最顶层）
      → ruler.draw()

  → eventEmitter.emit('render')                ← 通知外部渲染完成
```

---

## 五、耦合点

| 耦合系统 | 触发时机 | 为什么需要 |
|---------|---------|-----------|
| ViewportManager | 每帧开头 | 提供 scrollX/scrollY，决定场景的哪一块映射到屏幕 |
| ZoomManager | 每帧开头 | 提供 zoom 值，决定场景的缩放比例 |
| ImgManager | 图片填充时 | 异步加载图片资源，`getImg(src)` 返回已加载的图片对象 |
| SelectedElements | UI 叠加层 | 提供选中列表，画选中轮廓和控制手柄 |
| SelectedBox | UI 叠加层 | 计算选中图形的包围盒，画选中框 |
| ControlHandleManager | UI 叠加层 | 画缩放/旋转手柄 |
| RefLine | UI 叠加层 | 画吸附参考线 |
| Setting | 全程 | 提供所有可配置值（背景色、线宽、颜色、是否启用网格/标尺等） |

---

## 六、架构设计决策（知其所以然）

### 为什么用 Canvas 2D 而不是 WebGL？
> Canvas 2D 的 API 简单直观（`ctx.rect`、`ctx.fill`），学习成本低，浏览器原生支持。对于一个 2D 矢量图形编辑器，Canvas 2D 的性能完全够用（几百个图形不会卡）。WebGL 的优势在于大量粒子、3D、GPU 着色器场景，但代价是代码复杂度爆炸（要写 shader、管理 buffer）。Figma 用的是 WebGL + WASM 的自研渲染引擎，因为它需要处理上万个图形和复杂的混合模式，但 suika 是轻量级编辑器，Canvas 2D 是性价比最高的选择。

### 为什么每帧全量重绘而不是脏区域重绘？
> Canvas 2D 不支持真正的脏区域重绘——`clearRect` 一个区域后，被清掉的区域里所有重叠的图形都要重画，追踪"哪些图形和脏区域重叠"的成本可能比全量重绘还高。而且 rafThrottle 已经保证了每帧只画一次，配合浏览器原生的 Canvas 优化（画布外的绘制命令自动跳过），性能瓶颈通常不在绘制而在 JS 计算（布局、hitTest）。除非场景有上万个图形，否则全量重绘是最简单、最不容易出 bug 的方案。

### 为什么图形绘制用本地坐标 + transform 而不是直接用世界坐标？
> 本地坐标系让每个图形的绘制代码完全独立——矩形永远画 `(0,0,w,h)`，不需要知道自己在画布上的绝对位置、旋转角度。变换矩阵自动处理位置和旋转。嵌套容器（Frame 套 Frame）时，`ctx.transform` 的矩阵会自动累乘，子元素不需要手动计算绝对坐标。如果用世界坐标，每次父容器移动时要递归更新所有子元素的绝对坐标，复杂且容易出错。

### 为什么 drawLayer 每次都创建新的 Canvas 而不是复用？
> `drawLayer` 每次调用都 `document.createElement('canvas')` 创建一个临时 Canvas。理论上可以用对象池复用，但半透明图形通常很少（大部分图形是 100% 不透明的），创建开销微乎其微。复用池需要管理尺寸适配（不同图形大小不同）和清理状态（`clearRect` + `resetTransform`），代码复杂度增加但收益不大。这是典型的"先写对，性能不够再优化"的工程决策。

### 为什么 UI 叠加层的轮廓线宽要除以 zoom？
> `drawGraphsOutline` 中 `strokeWidth /= zoom`，是为了让选中框和 hover 轮廓在屏幕上始终保持 1-2 px 的视觉宽度。如果不除以 zoom，放大到 800% 时线宽也被放大 8 倍，变成又粗又丑的蓝色条带。这种"屏幕空间恒定线宽"的技巧在所有设计工具中都在用。
