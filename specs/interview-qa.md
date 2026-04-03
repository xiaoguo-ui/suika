# 面试 Q&A 速查

> 按面试被问到的概率排序，每个问题标注：回答要点、对应 spec、可能的追问及应对。

---

## 一、项目整体（必问）

### Q1：介绍一下你这个项目
**回答要点**（控制在 2 分钟内）：
1. 一句话定位："基于 Canvas 2D 的矢量图形编辑器，对标 Figma"
2. 技术选型："Monorepo + TypeScript，核心是 `@suika/core` 包，不依赖渲染框架"
3. 核心架构："中心是 SuikaEditor 聚合类，下挂文档系统、工具系统、命令系统"
4. 挑一个亮点展开（看面试官反应选）
5. 加分项："支持多人协同，用 Yjs CRDT"

**对应文档**：`ARCHITECTURE.md` 第二~三节

**追问**：为什么选 Canvas 2D 而不是 SVG 或 WebGL？
> SVG 在元素多时 DOM 节点爆炸，性能差；WebGL 开发成本高且 2D 图形编辑不需要 3D 能力。Canvas 2D 是中间路线——性能够用（几千个图形无压力）、API 简单、调试方便。Figma 用的是 WebGL + WASM，但那是因为他们要处理几十万个节点的超大文件。

---

### Q2：项目的技术难点是什么？
**推荐回答**（挑 2-3 个）：
1. **坐标系统**：场景坐标 ↔ 视口坐标 ↔ 本地坐标三层转换，缩放/旋转时矩阵运算容易出错
2. **撤销重做**：不是简单的状态快照，而是命令模式 + 软删除 + 批量命令，要保证任何操作序列都能正确撤销
3. **路径编辑**：贝塞尔曲线的控制手柄对称/打断、闭合检测、实时预览，交互状态非常多

**对应文档**：`viewport-zoom.spec.md`、`undo-redo.spec.md`、`pen-tool.spec.md`

**追问**：你是怎么解决的？
> 直接切到对应 spec 的"架构设计决策"章节讲。

---

### Q3：项目用了哪些设计模式？
**回答**：

| 模式 | 用在哪 | 一句话解释 |
|------|-------|-----------|
| 模板方法 | 绘制工具基类 | 基类封装拖拽流程，子类只重写 `createGraphics` |
| 策略模式 | 选择工具 | 点到不同目标（空白/图形/手柄）委托给不同策略类 |
| 命令模式 | 撤销重做 | 每个操作封装成 Command 对象，压入 undo/redo 栈 |
| 观察者模式 | 事件系统 | `EventEmitter` 贯穿全项目，zoomChange、sceneChange 等 |

**对应文档**：`ARCHITECTURE.md` 第十二节

**追问**：为什么选择策略模式而不是状态机？
> 选择工具的四种行为（移动/缩放/旋转/框选）是互斥的，每次 mousedown 时根据命中结果选一个，后续 drag/end 全部委托。状态机适合有复杂状态转移的场景（如 TCP 连接），选择工具的状态转移太简单（mousedown 选策略 → drag → mouseup 结束），用策略模式更直接。

---

## 二、渲染相关（高频）

### Q4：你的画布渲染流程是怎样的？
**回答要点**：
1. `SceneGraph.render()` 每帧执行
2. 清屏 → `ctx.scale(dpr)` → `ctx.scale(zoom)` → `ctx.translate(-scrollX, -scrollY)`
3. 递归遍历场景树绘制图形（后面的画在上面）
4. 绘制 UI 叠加层（选中框、控制柄、标尺、参考线）
5. `rafThrottle` 保证一帧只渲染一次

**对应文档**：`rendering.spec.md` 第四节

**追问**：图形很多时怎么优化？
> 当前方案是全量重绘（Canvas 2D 每帧清屏重画）。优化方向：(1) 脏矩形渲染——只重画变化区域；(2) 分层 Canvas——静态图形一层、动态交互一层；(3) 视口裁剪——不在视口内的图形跳过绘制。当前项目几千个图形没有性能问题，还没做这些优化。

---

### Q5：DPR（设备像素比）怎么处理的？
**回答**：Canvas 有两个尺寸——`canvas.width`（物理像素）和 `style.width`（CSS 像素）。在 2x Retina 屏上，CSS 800px 对应物理 1600px。设置 `canvas.width = cssWidth * dpr`，然后 `ctx.scale(dpr, dpr)`，所有绘制代码用 CSS 像素，底层实际渲染到 2 倍分辨率。不做这个的话文字和线条会模糊。

**对应文档**：`rendering.spec.md` 规则2、`viewport-zoom.spec.md` 规则10

---

### Q6：缩放怎么实现的？以什么为中心？
**回答**：以鼠标光标位置为中心。算法：(1) 用旧 zoom 把光标视口坐标转成场景坐标；(2) 设置新 zoom；(3) 反算新的 scroll 值让这个场景点在视口中位置不变。数学本质：光标是缩放的不动点。

**对应文档**：`viewport-zoom.spec.md` 规则2

**追问**：坐标转换公式是什么？
> `场景 = scroll + 视口 / zoom`，`视口 = (场景 - scroll) × zoom`。只有 scroll 和 zoom 两个参数。

---

## 三、撤销重做（高频）

### Q7：撤销重做怎么实现的？
**回答要点**：
1. 命令模式：每个操作封装成 `ICommand`（有 `redo()` 和 `undo()` 方法）
2. 双栈：`undoStack` 和 `redoStack`
3. "先做再记"：操作在拖拽中已经实时生效了，`pushCommand` 只是记录
4. 软删除：`setDeleted(true/false)` 切换，不真正销毁对象

**对应文档**：`undo-redo.spec.md`

**追问**：如果操作历史太多内存爆了怎么办？
> 设置 `maxUndoSize` 上限，超过时从栈底移除最早的命令。被移除的命令如果持有已删除图形的引用，可以真正释放这些图形（因为不可能再被 undo 恢复了）。当前项目没做这个限制，因为每个 Command 只存属性差异（不是全量快照），内存占用很小。

**追问**：为什么不用快照（Snapshot）模式？
> 快照要存整个场景完整状态，100 个图形改 1 个就要复制 100 个。命令只记"改了什么"，内存开销差一个数量级。

---

### Q8：批量操作怎么撤销？（比如画路径时添加了 10 个锚点）
**回答**：`batchCommandStart/End` 把连续的 `pushCommand` 标记为 `isBatched=true`。撤销时 `CommandManager.undo()` 自动把连续的 batched 命令一起弹出一起撤销，一步撤回整条路径。

**对应文档**：`undo-redo.spec.md` 规则9、`pen-tool.spec.md` 规则7

---

## 四、工具系统（中频）

### Q9：怎么实现工具切换的？加一个新工具需要改几个文件？
**回答**：`ToolManager` 维护一个工具注册表（`Map<type, ToolConstructor>`）。所有工具实现 `ITool` 接口。加一个新工具只需要：(1) 写一个新类实现 `ITool`；(2) 在 `ToolManager` 中注册。如果继承 `DrawGraphicsTool`（如矩形、椭圆），只需要重写 `createGraphics` 一个方法，几十行代码。

**对应文档**：`rect-draw.spec.md`

**追问**：工具之间怎么不互相干扰？
> 每次切换工具时调 `prevTool.onInactive()` → `newTool.onActive()`，上一个工具清理自己的状态。`ToolManager` 只把事件分发给当前激活的工具，其他工具收不到事件。

---

### Q10：选择工具怎么知道用户想做什么（移动 vs 缩放 vs 旋转）？
**回答**：`onStart` 时做三层命中检测：(1) 先检查是否点到了控制柄（缩放/旋转手柄）；(2) 再检查是否点到了图形（移动）；(3) 都没有就是框选。根据命中结果选择对应的策略类（`SelectMoveTool` / `SelectResizeTool` / `SelectRotationTool` / `DrawSelectionTool`），后续的 `onDrag/onEnd` 全部委托给这个策略。

**对应文档**：`select-tool.spec.md` 第四节

---

## 五、图层系统（中频）

### Q11：图形的层级顺序怎么管理的？
**回答**：场景树（Document → Canvas → 图形节点），每个节点有 `parentIndex: { guid, position }`。`position` 用 `fractional-indexing` 字符串键排序，插入新元素只需要在两个键之间生成一个中间键，O(1) 不影响其他节点。渲染时按 position 排序递归绘制，后画的在上面。

**对应文档**：`layer-system.spec.md` 规则2、3

**追问**：为什么不用数组索引？
> 数组索引在中间插入时所有后续元素要 +1，O(n)。fractional-indexing 的字符串键在任意两个键之间都能生成新键，且不会冲突——这对协同编辑很重要。

---

### Q12：分组怎么实现的？分组后元素位置为什么不变？
**回答**：创建 `SuikaFrame`（`resizeToFit=true`）作为 Group，子元素挂到 Group 下。关键是坐标转换——子元素的世界坐标（`worldTransform`）不变，但 `transform`（本地坐标）要乘以 Group 的逆矩阵（`groupInvertTf`），这样子元素在屏幕上的位置不动。解组是反操作——先记住世界坐标，改回原父容器后用 `setWorldTransform` 恢复。

**对应文档**：`layer-system.spec.md` 规则5、6

---

## 六、路径与文本（中频）

### Q13：钢笔工具怎么画曲线的？
**回答**：点击添加锚点（`in/out={0,0}` → 直线段），拖拽时拉出控制手柄（`out` 跟随鼠标，默认 `in=-out` 对称 → 曲线段）。Alt 键打断对称关系做尖角。渲染时 `_realDraw` 遍历 pathData，相邻锚点的 out 和 in 都是 0 用 `lineTo`，否则用 `bezierCurveTo`。

**对应文档**：`pen-tool.spec.md` 规则2、3

---

### Q14：文本编辑怎么在 Canvas 上实现的？
**回答**：Canvas 没有原生文本输入能力，所以用一个隐藏的 `<input>` 元素（`opacity:0`）做输入代理。用户的键盘输入先到 input，通过 `input` 事件拿到字符，拼接到 `SuikaText.content` 里，然后 `ctx.fillText` 渲染到 Canvas 上。IME 中文输入通过 `isComposing` 标志区分中间态和最终态。光标定位用二分查找字形位置数组。

**对应文档**：`text-tool.spec.md` 规则2、3、5

**追问**：为什么不用 contenteditable？
> `contenteditable` 是 DOM 元素，无法和 Canvas 渲染对齐——文字会出现在 Canvas 上方而不是画布坐标系里。缩放/旋转时 DOM 元素无法跟着 Canvas 的 transform 变换。隐藏 input 只负责接收输入，实际渲染完全在 Canvas 里。

---

## 七、性能优化（中频）

### Q15：你做了哪些性能优化？
**回答**（三层分类）：
1. **渲染层**：`rafThrottle` 合并重绘 + 离屏 Canvas 处理透明度 + DPR 适配
2. **数据层**：全局 Map O(1) 查找 + fractional-indexing O(1) 插入 + 字形缓存
3. **事件层**：sceneChange 100ms 节流 + 空操作跳过

**对应文档**：`ARCHITECTURE.md` 第十四节

**追问**：如果图形有几万个怎么办？
> (1) 视口裁剪——不在视口内的图形跳过绘制（用 R-Tree 空间索引加速查询）；(2) 分层渲染——静态图形缓存到一个 Canvas，只重绘变化的层；(3) 图形合并——远距离缩放时把小图形合并成色块。这些是下一步优化方向，当前几千个图形够用。

---

## 八、协同编辑（加分项）

### Q16：多人协同怎么实现的？
**回答**：用 Yjs（CRDT 库）+ Hocuspocus（WebSocket 服务）。编辑器触发 `sceneChange` 事件时，`SuikaBinding` 把增量变更写入 `Y.Doc` 的 `nodes` Map，Yjs 自动通过 WebSocket 同步到其他客户端。远端的 `Y.Map.observe` 回调触发后调用 `editor.applyChanges()` 更新本地场景。光标同步用 Yjs 的 Awareness Protocol。

**对应文档**：`ARCHITECTURE.md` 第九节

**追问**：CRDT 和 OT 有什么区别？
> OT（Operational Transform）需要中心服务器排序操作，实现复杂。CRDT（Conflict-free Replicated Data Type）每个客户端独立合并，不需要中心排序，天然支持离线编辑。Yjs 的 CRDT 保证最终一致性——即使网络延迟导致操作顺序不同，最终所有客户端的状态一定相同。

---

## 九、架构设计（深度追问）

### Q17：如果让你重新设计，你会改什么？
**参考回答**（展示反思能力）：
1. **渲染分层**：当前全量重绘，应该分静态层和交互层，减少不必要的重绘
2. **状态管理**：当前图形属性分散在各个对象上，如果要做协同编辑的冲突解决，可能需要一个更集中的状态管理（类似 Redux 的 store）
3. **文本系统**：当前只支持单行，如果要做多行/富文本，需要从头设计段落排版引擎

---

### Q18：这个项目的扩展性怎么样？
**回答**：
- **加新图形类型**：继承 `SuikaGraphics`，实现 `_realDraw` 和 `hitTest`，在 `graphCtorMap` 注册
- **加新工具**：继承 `DrawGraphicsTool`（绘制类）或直接实现 `ITool`（特殊交互），在 `ToolManager` 注册
- **加新命令**：实现 `ICommand` 接口（`redo/undo`），通过 `pushCommand` 入栈
- **加新属性面板**：监听 `selectedElements.change` 事件，读写图形 attrs

> "每个扩展点都是接口/基类 + 注册表的模式，符合开闭原则——对扩展开放、对修改关闭。"

---

### Q19：你觉得这个项目最大的技术挑战是什么？
**推荐回答**（选一个你最熟悉的展开）：

**选项 A：坐标系统**
> "三层坐标系（本地/世界/视口）之间的转换。每个图形有自己的 transform 矩阵，父子节点要连乘，缩放/旋转时鼠标坐标要通过逆矩阵转回本地坐标做 hitTest。调试时经常因为忘了某一层转换导致图形'跳'到错误位置。"

**选项 B：撤销重做的一致性**
> "任何操作序列都必须能正确撤销和重做。比如：画矩形 → 分组 → 移动 → 撤销移动 → 撤销分组 → 撤销画矩形。每一步的 undo 都要正确恢复状态，包括 parentIndex、transform、deleted 等多个属性。用 Transaction 统一录制变更前后的属性快照解决了这个问题。"

---

## 十、代码实现（随机追问）

### Q20：hitTest（点击检测）怎么做的？
**回答**：把鼠标世界坐标乘以图形 transform 的逆矩阵，转成图形本地坐标，然后判断是否在图形的局部包围盒内（矩形判断 `0 ≤ x ≤ width`，椭圆判断点是否在椭圆方程内）。遍历场景树从后往前（z-order 高的先检测），第一个命中的就是用户想点的。

---

### Q21：Shift 键怎么约束正方形/正圆的？
**回答**：拖拽时检测 `isShiftPressing`，如果按住 Shift，取 `width` 和 `height` 的较大值，把两者都设为这个值 → 正方形/正圆。这个逻辑在 `DrawGraphicsTool` 基类里（`adjustSizeByShift`），所有绘制工具自动继承。

---

### Q22：怎么实现的吸附/对齐参考线？
**回答**：`RefLine` 缓存所有图形的 bbox 的边（上/下/左/右/中心），当拖拽图形时，把当前图形的边和所有缓存边比较，找到差值小于阈值（如 3px/zoom）的边，自动吸附并画出蓝色参考线。

---

### Q23：图片怎么渲染到 Canvas 上的？
**回答**：图片本质是一个 `fill` 类型为 `PaintType.Image` 的矩形。上传时 `FileReader.readAsDataURL` 转 Base64，注册到 `ImgManager`（`Map<url, HTMLImageElement>`）缓存。渲染时基类的 `fillImage` 方法用 `ctx.drawImage` 绘制，自动裁剪到图形包围盒范围。

---

## 使用建议

1. **面试前 30 分钟**：快速过一遍本文档的粗体"回答要点"
2. **面试中**：面试官问到某个方向，脑中定位到对应 Q 编号，按要点回答
3. **被追问时**：如果追问的内容你不确定，说"这部分我的实现方案是...，如果要进一步优化可以考虑..."，展示思考过程比背答案重要
4. **主动引导**：回答完一个问题后可以说"这个和 XX 系统有关联，要不要我展开讲讲？"——把面试官引导到你准备充分的领域
