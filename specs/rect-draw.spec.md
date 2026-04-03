# 矩形绘制 产品需求文档

## 一、功能概述
用户通过拖拽（或单击）在画布上画出矩形

## 二、用户操作流程
1. 用户按 R 键或点工具栏 → 系统切换到矩形绘制模式
2. 用户按下鼠标 → 系统记录起点坐标（经过吸附处理）
3. 用户拖拽鼠标 → 系统实时预览矩形（灰色填充，跟随鼠标变化）
4. 用户松开鼠标 → 系统将矩形固定，操作记入撤销栈
5. （若只点击未拖拽 → 在点击位置生成一个 100×100 的默认矩形）

## 三、业务规则

### 规则1：拖拽方向不影响结果
- **代码线索**：`normalizeRect`
- **预期位置**：在 `createGraphics` 和 `updateGraphics` 计算宽高时
- **验证方法**：从右下往左上拖拽，看是否正常画出矩形
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_rect.ts:29`（createGraphics 内）、`tool_draw_graphics.ts:184`（updateGraphics 内）
- **为什么这么设计**：用户拖拽方向是随意的，可能从左上到右下，也可能反过来。反向拖时 width/height 会算出负值。如果不做 normalize，Canvas API 画不出负宽高的矩形，用户会看到画不出东西。所以在创建和更新两个入口都做一次标准化，把负值转成正值并调整 x/y 起点，让用户无论怎么拖都能画出矩形。

### 规则2：按住 Shift 画正方形
- **代码线索**：`adjustSizeWhenShiftPressing`
- **预期位置**：在 `updateRect` 计算宽高之后
- **验证方法**：按住 Shift 拖拽，看矩形是否始终为正方形
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_graphics.ts:171`（方法定义）、`tool_draw_graphics.ts:268`（调用处）
- **为什么这么设计**：取 `Math.max(abs(width), abs(height))` 而不是取平均值或最小值，是因为用户拖得越远意味着想要越大的图形。如果取最小值，用户横向拖了 200px 纵向只拖了 10px，结果只有 10×10 的正方形，会觉得"画不动"。取最大值保证了用户拖的距离不白费。另外这个方法定义在基类 `DrawGraphicsTool` 上，是一个 `protected` 可重写方法——线段工具就重写了它，改成了角度吸附（`adjustSizeToKeepPolarSnap`），说明这个设计有意预留了扩展点。

### 规则3：按住 Alt 从中心画
- **代码线索**：`isAltPressing`、`isStartPtAsCenter`
- **预期位置**：在 `updateRect` 计算 x/y 坐标时
- **验证方法**：按住 Alt 拖拽，看矩形是否以起点为中心向四周扩展
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_graphics.ts:249`（读取 Alt 状态）、`tool_draw_graphics.ts:271`（中心扩展逻辑入口）
- **为什么这么设计**：默认行为是起点作为矩形的角，但有时候用户心里想的是"我要在这个位置放一个矩形"，这时候起点应该是中心。这是 Figma、Sketch 等设计工具的通用交互规范。代码里先判断 Shift（正方形），再判断 Alt（中心），顺序很重要——先约束形状，再决定位置，保证两个修饰键可以同时生效（Shift+Alt = 从中心画正方形）。

### 规则4：单击生成默认大小矩形
- **代码线索**：`drawGraphDefaultWidth`、`drawGraphDefaultHeight`
- **预期位置**：鼠标松开时（`onEnd` 方法内），判断未发生拖拽
- **验证方法**：选矩形工具后只点一下不拖，看是否出现 100×100 矩形
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_graphics.ts:328-329`（读取默认宽高）、`setting.ts:91-92`（默认值定义为 100）
- **为什么这么设计**：如果不做这个兜底，用户点一下没反应，会以为工具坏了。Figma 也有这个行为。默认值 100×100 放在 `Setting` 里而不是硬编码，是为了让用户或主题可以自定义。矩形中心对齐到光标位置，而不是左上角对齐，是因为用户期望矩形出现在"我点的地方"。

### 规则5：新矩形自动带灰色填充
- **代码线索**：`firstFill`、`setting.get('firstFill')`
- **预期位置**：`createGraphics` 创建 SuikaRect 实例时传入的属性
- **验证方法**：新建矩形后查看属性面板，填充应为灰色 (217,217,217)，无描边
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_rect.ts:35`（传入 fill）、`setting.ts:21-23`（默认值 r:217, g:217, b:217）
- **为什么这么设计**：新建矩形必须有可见的填充，否则用户画完看不到东西。选灰色而不是黑色或彩色，是因为灰色在任何背景上都有辨识度，且是中性色不会影响设计判断。不设描边是因为大多数设计场景中描边是可选的，默认加上反而要让用户多一步去删。用 `cloneDeep` 复制 fill 是为了防止多个矩形共享同一个颜色对象，改一个全变了。

### 规则6：自动命名不冲突
- **代码线索**：`getNoConflictObjectName`、`GraphicsObjectSuffix.Rect`
- **预期位置**：`createGraphics` 里给 objectName 赋值时
- **验证方法**：连续画三个矩形，看图层面板名称是否为 Rectangle 1、2、3
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_rect.ts:32`（调用处）、`utils/common.ts:3`（函数定义）
- **为什么这么设计**：图层面板需要每个图形有可辨识的名称。如果都叫"Rectangle"，用户在 30 个图层里找不到想要的那个。传入 `parent` 而不是全局查重，是因为只需要保证同一层级内不冲突——不同 Frame 里可以有同名元素，这和文件系统里不同文件夹可以有同名文件是一个道理。

### 规则7：宽高为零时自动撑开
- **代码线索**：`solveWidthOrHeightIsZero`
- **预期位置**：`updateRect` 中，宽或高算出来为 0 时
- **验证方法**：水平拖一条线（高度为0），看是否自动有高度
- **验证结果**：✅ 已找到
- **代码位置**：`tool_draw_graphics.ts:229`（调用处）、`tool_draw_graphics.ts:303`（方法定义）
- **为什么这么设计**：宽或高为 0 的矩形在屏幕上不可见，用户会以为没画上。用网格步长（`gridSnapX/Y`）撑开而不是用固定值（如 1px），是因为如果开了网格吸附，最小有意义的尺寸就是一个网格单元。这个方法同样是 `protected` 可重写的——线段工具重写了它，因为线段高度就应该是 0，不需要撑开。

## 四、耦合点

| 耦合系统 | 触发时机 | 代码线索 | 代码位置 | 为什么需要这个耦合 |
|---------|---------|---------|---------|------------------|
| 工具管理 (ToolManager) | 激活工具、分发事件 | `setActiveTool('drawRect')` | `tool_manager.ts:271` | 统一管理所有工具的生命周期和事件分发，避免每个工具自己绑事件导致冲突 |
| 撤销重做 (CommandManager) | 鼠标松开后 | `pushCommand(new AddGraphCmd(...))` | `tool_draw_graphics.ts:363-364` | 用命令模式而非快照，因为快照要存整个场景，命令只记"新增了哪个图形"，undo 就删掉它，内存开销小得多 |
| 场景树 (SceneGraph) | 拖拽中首次创建时 | `sceneGraph.addItems([graphics])` | `tool_draw_graphics.ts:292` | 拖拽中就加入场景而非松手再加，是为了让用户实时看到矩形预览。如果等松手，拖拽过程中画布是空的 |
| 选中管理 (SelectedElements) | 矩形创建后 | `selectedElements.setItems([graphics])` | `tool_draw_graphics.ts:298` | 创建后自动选中，让用户可以立即调整属性（颜色、大小等），不需要再点一下去选 |
| 父容器插入 | 矩形创建后 | `parent.insertChild(graphics)` | `tool_draw_graphics.ts:293` | 图形必须挂到树上才能参与渲染和序列化，脱离父节点的图形等于不存在 |
| 吸附对齐 (SnapHelper) | 起点记录 & 拖拽中 | `SnapHelper.getSnapPtBySetting` | `tool_draw_graphics.ts:123, 141` | 对齐到网格或其他图形边缘，让设计更精确。起点和拖拽点都要吸附，保证起点和终点都落在整数网格上 |
| 参考线 (RefLine) | 拖拽中 | `refLine.cacheGraphicsRefLines`、`getGraphicsSnapOffset` | `tool_draw_graphics.ts:64, 149` | 视觉反馈——绿色参考线告诉用户"你对齐到了哪个边"，没有这条线用户不知道吸附生效了 |
| 修饰键 (HostEventManager) | 拖拽过程中 | `shiftToggle`、`isAltPressing`、`onSpaceToggle` | `tool_draw_graphics.ts:57, 249, 98` | 修饰键状态由全局管理而非工具自己监听，因为多个工具都需要 Shift/Alt，统一管理避免重复代码和状态不一致 |
| Frame 容器 | 在 Frame 内画时 | `getDeepFrameAtPoint` | `tool_draw_graphics.ts:280, 332` | 在 Frame 内画时矩形要成为 Frame 的子元素，这样移动 Frame 时矩形跟着走，符合用户对"容器"的直觉 |
| 设置 (Setting) | 创建时 | `firstFill`、`drawGraphDefaultWidth`、`keepToolSelectedAfterUse` | `tool_draw_graphics.ts:375` | 默认值集中在 Setting 里而非硬编码在工具里，这样用户可以自定义默认颜色和行为，也方便主题切换 |

## 五、核心代码路径

| 步骤 | 文件 | 行号 | 说明 |
|-----|------|------|------|
| 入口：激活工具 | `tools/tool_manager.ts` | 271 | `setActiveTool('drawRect')` 实例化 DrawRectTool |
| 鼠标按下 | `tools/tool_draw_graphics.ts` | 122 | `onStart` 记录吸附后的起点 |
| 拖拽：创建矩形 | `tools/tool_draw_rect.ts` | 28-42 | `createGraphics` → `new SuikaRect(...)` |
| 拖拽：加入场景 | `tools/tool_draw_graphics.ts` | 292-298 | `addItems` + `insertChild` + `setItems` 选中 |
| 拖拽：更新大小 | `tools/tool_draw_graphics.ts` | 183-197 | `updateGraphics` 用 `normalizeRect` 标准化后更新属性 |
| 拖拽：Shift/Alt | `tools/tool_draw_graphics.ts` | 249-275 | 读取修饰键状态，调整宽高和起点 |
| 鼠标松开 | `tools/tool_draw_graphics.ts` | 316, 363 | `onEnd` → `pushCommand(AddGraphCmd)` 入撤销栈 |
| 单击兜底 | `tools/tool_draw_graphics.ts` | 326-358 | 未拖拽时用默认宽高创建矩形 |
| 收尾 | `tools/tool_draw_graphics.ts` | 369-378 | `afterEnd` 清参考线，可选切回 select 工具 |
| 渲染 | `graphics/rect.ts` | 90, 203-206 | `draw` → `_realDraw` 用 Canvas API 填充描边 |
| 撤销 | `commands/add_graphs.ts` | 22-25 | `undo`: `setDeleted(true)` + `removeFromParent` |
| 重做 | `commands/add_graphs.ts` | 11-21 | `redo`: `setDeleted(false)` + `insertChild` |

## 六、架构设计决策（知其所以然）

### 为什么 DrawRectTool 只有 14 行有效代码？
矩形、椭圆、星形、Frame 的拖拽流程完全一样（按下→拖拽→松开），只有"创建什么图形对象"不同。所以用了**模板方法模式**：基类 `DrawGraphicsTool` 实现完整的拖拽逻辑，子类只重写 `createGraphics` 返回不同的图形实例。如果不这么做，四个工具里要各抄一遍 onStart/onDrag/onEnd，改一个 bug 要改四个地方。

### 为什么拖拽中就加入场景，不等松手？
拖拽过程中用户需要看到矩形的实时预览。如果等松手再加入场景，拖拽时画布是空的，用户不知道自己在画什么。所以首次拖拽时就 `addItems` + `insertChild` 把矩形加进去，后续拖拽只是 `updateGraphics` 更新属性。

### 为什么用命令模式做撤销，而不是存快照？
快照方式要存整个场景的完整状态，100 个图形改 1 个就要复制 100 个的数据。命令模式只记录"做了什么"——`AddGraphCmd` 只记住新增的那一个矩形，`undo` 就是 `setDeleted(true)` + `removeFromParent`，`redo` 反过来。内存开销和快照方式差了一个数量级。

### 为什么 pushCommand 时不执行 redo？
普通命令模式是"入栈时执行一次 redo"。但这里矩形在拖拽过程中已经加到场景里了，松手时只需要入栈记录，不需要再执行。如果再 redo 一次，等于重复添加。所以 `pushCommand` 只压栈 + 清空 redoStack，不调用 `redo()`。

### 为什么修饰键状态由 HostEventManager 统一管理？
如果每个工具自己 `addEventListener('keydown')` 监听 Shift/Alt，会出现两个问题：(1) 多个工具注册多个监听器，需要精确管理绑定和解绑，容易泄漏；(2) 工具切换时状态可能不一致（比如按着 Shift 切了工具，新工具不知道 Shift 是按着的）。统一由 HostEventManager 维护布尔状态，工具随时读取，简单可靠。

## 七、一句话说清
矩形工具监听拖拽事件，用起点和终点算出宽高，创建 SuikaRect 加入场景树，松手后压入撤销栈；Shift 画正方形、Alt 从中心画、单击出默认尺寸。
