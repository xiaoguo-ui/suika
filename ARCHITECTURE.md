# Suika 编辑器 — 项目架构文档

> 基于 Canvas 2D 的矢量图形编辑器，对标 Figma，支持多人实时协同。

---

## 一、项目总览

```
suika/
├── apps/                        # 应用层
│   ├── suika/                   # 单机版编辑器（主应用）
│   ├── suika-multiplayer/       # 多人协同版编辑器
│   └── docs/                    # 文档站（VitePress）
├── packages/                    # 公共库层
│   ├── core/                    # 编辑器内核
│   ├── geo/                     # 几何计算库
│   ├── common/                  # 通用工具库
│   ├── components/              # React UI 组件库
│   └── icons/                   # 图标组件库
├── scripts/                     # 构建脚本（esbuild watch）
├── nginx/                       # 部署配置
└── .github/workflows/           # CI/CD
```

**包管理**：pnpm workspace monorepo  
**语言**：TypeScript（strict 模式）  
**Node 要求**：>= 18.12.0

---

## 二、包依赖关系

```
┌─────────────────────────────────────────────────────────┐
│                      Applications                       │
│                                                         │
│   ┌──────────────┐         ┌────────────────────────┐   │
│   │ apps/suika   │         │ apps/suika-multiplayer  │   │
│   │  (单机版)     │         │  (多人协同版)            │   │
│   └──────┬───────┘         └───────────┬────────────┘   │
│          │                             │                │
│          │    ┌─────────────────────┐  │                │
│          │    │  Yjs + Hocuspocus   │──┘                │
│          │    └─────────────────────┘                   │
└──────────┼──────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│                      Packages                            │
│                                                          │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐   │
│   │  @suika/core │  │ @suika/      │  │ @suika/icons │   │
│   │  (编辑器内核) │  │ components   │  │ (图标组件)    │   │
│   └──────┬───────┘  │ (UI 组件库)  │  └──────┬───────┘   │
│          │          └──────┬───────┘         │           │
│          │                 │                 │           │
│          ▼                 ▼                 │           │
│   ┌─────────────┐  ┌──────────────┐         │           │
│   │  @suika/geo  │  │ @suika/common│◄────────┘           │
│   │ (几何计算)   │  │ (通用工具)   │                      │
│   └──────┬───────┘  └──────────────┘                     │
│          │                 ▲                             │
│          └─────────────────┘                             │
└──────────────────────────────────────────────────────────┘
```

**依赖方向**：`apps → core / components / icons` → `geo / common`

---

## 三、编辑器内核架构（@suika/core）

### 3.1 核心类：SuikaEditor

`SuikaEditor` 是编辑器的中心聚合类，负责装配所有子系统：

```
                        ┌─────────────────────┐
                        │    SuikaEditor      │
                        │  (中心聚合 / 入口)   │
                        └─────────┬───────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
    ┌─────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
    │  文档与渲染  │         │  交互与工具  │         │  辅助系统    │
    └─────┬──────┘         └──────┬──────┘         └──────┬──────┘
          │                       │                       │
  ┌───────┼────────┐    ┌─────────┼─────────┐    ┌────────┼────────┐
  │       │        │    │         │         │    │        │        │
  ▼       ▼        ▼    ▼         ▼         ▼    ▼        ▼        ▼
 Doc   Scene   Viewport Tool   Command  Cursor  Ruler  RefLine Clipboard
       Graph   Manager  Mgr    Manager   Mgr           (参考线)
```

### 3.2 子系统职责清单

| 子系统 | 类名 | 职责 |
|--------|------|------|
| **文档** | `SuikaDocument` | 管理图形对象的树状结构，图形 ID 索引 |
| **场景图** | `SceneGraph` | 渲染循环：清屏 → 背景 → 网格 → 图形绘制 → 选区 → 手柄 |
| **视口** | `ViewportManager` | 管理画布可视区域的偏移和尺寸 |
| **缩放** | `ZoomManager` | 缩放级别管理、缩放适配 (zoomToFit) |
| **工具** | `ToolManager` | 注册/切换/分发工具的指针事件 |
| **命令** | `CommandManager` | 撤销/重做栈，支持批量命令 (batch) |
| **光标** | `CursorManager` | 光标样式管理 |
| **标尺** | `Ruler` | 画布标尺渲染 |
| **参考线** | `RefLine` | 吸附参考线 |
| **剪贴板** | `ClipboardManager` | 复制/粘贴 |
| **快捷键** | `KeyBindingManager` | 键盘快捷键绑定 |
| **事件** | `HostEventManager` / `MouseEventManager` | DOM 事件监听与分发 |
| **选中** | `SelectedElements` / `SelectedBox` | 选中元素管理与选框 |
| **控制柄** | `ControlHandleManager` | 缩放/旋转控制柄 |
| **路径编辑** | `PathEditor` | 贝塞尔路径节点编辑 |
| **文本编辑** | `TextEditor` | 文本图形的编辑模式 |
| **图片** | `ImgManager` | 图片资源管理 |
| **拖拽画布** | `CanvasDragger` | 空格 + 拖拽移动画布 |
| **性能监控** | `PerfMonitor` | FPS / 帧耗时监控 (stats.js) |
| **设置** | `Setting` | 用户偏好（网格、吸附等） |

---

## 四、图形体系

### 4.1 图形类继承结构

```
SuikaGraphics (基类：变换、绘制、命中检测)
├── SuikaRect          (矩形，支持圆角)
├── SuikaEllipse       (椭圆)
├── SuikaLine          (线段)
├── SuikaText          (文本)
├── SuikaPath          (贝塞尔路径)
├── SuikaRegularPolygon(正多边形)
├── SuikaStar          (星形)
├── SuikaFrame         (画框/容器，可嵌套)
├── SuikaCanvas        (画布根节点)
└── SuikaDocument      (文档根节点)
```

### 4.2 图形创建机制

场景图通过 `graphCtorMap`（GraphicsType → 构造函数映射表）实现图形的反序列化与动态创建，便于 JSON 导入导出和扩展新图形类型。

---

## 五、工具系统

### 5.1 工具列表

```
ToolManager (注册 / 切换 / 事件分发)
│
├── SelectTool              选择工具（子工具：框选、移动、缩放、旋转）
├── DrawRectTool            绘制矩形
├── DrawEllipseTool         绘制椭圆
├── DrawLineTool            绘制线段
├── DrawFrameTool           绘制画框
├── DrawTextTool            绘制文本
├── DrawImgTool             插入图片
├── DrawPathTool            钢笔工具（贝塞尔路径）
├── DrawRegularPolygonTool  绘制正多边形
├── DrawStarTool            绘制星形
├── PencilTool              铅笔自由绘制
├── DragCanvasTool          拖拽画布
└── PathSelectTool          路径编辑选择（子工具：框选、移动）
```

### 5.2 工具接口

所有工具实现 `ITool` 接口，包含 `onStart`、`onDrag`、`onEnd`、`onActive`、`onInactive` 等生命周期方法。`DrawGraphicsTool` 提供绘制类工具的通用基类（吸附、命令提交等）。

---

## 六、命令系统（撤销/重做）

### 6.1 命令模式

```
ICommand 接口
├── desc: string       命令描述
├── redo(): void       执行/重做
└── undo(): void       撤销

CommandManager
├── undoStack: ICommand[]    撤销栈
├── redoStack: ICommand[]    重做栈
├── undo()                   撤销
├── redo()                   重做
├── pushCommand(cmd)         压入新命令
├── batchCommandStart()      开始批量命令
├── batchCommandEnd()        结束批量命令
└── clearRecords()           清空历史
```

### 6.2 具体命令

| 命令类 | 职责 |
|--------|------|
| `AddGraphCmd` | 添加图形到场景 |
| `SetElementsAttrs` | 设置元素属性（位置、颜色、大小等） |
| `UpdateGraphicsAttrsCmd` | 更新图形属性 |
| `ReparentGraphsCmd` | 改变图形父级（编组/解组） |
| `MacroCmd` | 组合多个子命令为一个原子操作 |

---

## 七、几何计算库（@suika/geo）

```
@suika/geo
├── geo_point.ts           点运算
├── geo_rect.ts            矩形运算
├── geo_box.ts             包围盒
├── geo_line.ts            线段运算
├── geo_circle.ts          圆运算
├── geo_ellipse.ts         椭圆运算
├── geo_polygon.ts         多边形运算
├── geo_bezier.ts          贝塞尔曲线
├── geo_bezier_class.ts    贝塞尔曲线类
├── geo_path.ts            路径运算
├── geo_path_class.ts      路径类
├── geo_matrix.ts          矩阵运算（2D 仿射变换）
├── geo_matrix_class.ts    矩阵类
├── geo_star.ts            星形几何
├── geo_text.ts            文本布局
├── geo_angle.ts           角度工具
├── geo_resize_line.ts     线拖拽缩放
├── geo_resize_rect.ts     矩形拖拽缩放
└── transform.ts           坐标变换工具
```

---

## 八、应用层架构（apps/suika）

### 8.1 页面结构

```
┌─────────────────────────────────────────────────────┐
│                    Header                           │
│  ┌────────┐  ┌──────────────────────┐  ┌────────┐  │
│  │  Menu   │  │     Toolbar          │  │ Locale │  │
│  └────────┘  └──────────────────────┘  └────────┘  │
├──────────┬──────────────────────────┬───────────────┤
│          │                          │               │
│  Layer   │                          │   Info        │
│  Panel   │     Canvas (编辑器)      │   Panel       │
│          │                          │               │
│  ┌─────┐ │                          │  ┌─────────┐  │
│  │Layer│ │                          │  │Align     │  │
│  │Tree │ │                          │  │Card      │  │
│  │     │ │                          │  ├─────────┤  │
│  │     │ │                          │  │Fill      │  │
│  │     │ │                          │  │Card      │  │
│  │     │ │                          │  ├─────────┤  │
│  │     │ │                          │  │Stroke    │  │
│  │     │ │                          │  │Card      │  │
│  └─────┘ │                          │  └─────────┘  │
│          │                          │               │
├──────────┴──────────────────────────┴───────────────┤
│              ZoomActions  |  ContextMenu             │
└─────────────────────────────────────────────────────┘
```

### 8.2 组件结构

```
App.tsx (react-intl 国际化包裹)
└── Editor.tsx (创建 SuikaEditor 实例，布局所有面板)
    ├── Header/
    │   ├── Toolbar (工具切换按钮)
    │   └── Menu (文件/编辑菜单)
    ├── LayerPanel/
    │   └── LayerTree → LayerItem (图层树)
    ├── InfoPanel/
    │   ├── ElementsInfoCard (位置/大小)
    │   ├── AlignCard (对齐/分布)
    │   ├── FillCard (填充色)
    │   ├── StrokeCard (描边)
    │   └── LayerInfoCard (图层属性)
    ├── ContextMenu/ (右键菜单)
    ├── ZoomActions/ (缩放控件)
    ├── ColorPicker/ (颜色选择器)
    │   ├── SolidPicker
    │   ├── PaintPicker
    │   └── ImagePicker
    └── input/ (自定义输入组件)
        ├── NumberInput
        ├── PercentInput
        ├── ColorHexInput
        └── CustomRuleInput
```

---

## 九、多人协同架构（apps/suika-multiplayer）

### 9.1 协同技术方案

```
┌─────────────┐         WebSocket          ┌──────────────────┐
│  Client A   │◄──────────────────────────►│  Hocuspocus      │
│  (Browser)  │                            │  Server           │
├─────────────┤         WebSocket          │  (WebSocket 服务)  │
│  Client B   │◄──────────────────────────►│                   │
│  (Browser)  │                            └──────────────────┘
└─────────────┘

每个 Client 内部：

┌──────────────────────────────────────────────────┐
│                  React App                       │
│  ┌────────────────┐    ┌──────────────────────┐  │
│  │  SuikaEditor   │    │  MultiCursorsView    │  │
│  │  (编辑器实例)   │    │  (远端光标渲染)       │  │
│  └────────┬───────┘    └──────────────────────┘  │
│           │                       ▲              │
│           ▼                       │              │
│  ┌────────────────────────────────┴───────────┐  │
│  │            SuikaBinding (双向同步桥)        │  │
│  │                                            │  │
│  │  本地编辑 ──► sceneChange ──► Y.Map 更新   │  │
│  │  远端同步 ◄── Y.Map observe ◄── 远端修改   │  │
│  │  光标同步 ◄►  Awareness Protocol           │  │
│  └────────────────────────────────────────────┘  │
│           │                                      │
│           ▼                                      │
│  ┌────────────────────────────────────────────┐  │
│  │          HocuspocusProvider                │  │
│  │  ┌──────────┐    ┌───────────────────┐     │  │
│  │  │  Y.Doc   │    │  Awareness        │     │  │
│  │  │  (CRDT)  │    │  (用户状态/光标)   │     │  │
│  │  └──────────┘    └───────────────────┘     │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 9.2 协同数据流

1. **本地编辑** → `SuikaEditor` 触发 `sceneChange` 事件
2. **SuikaBinding** 监听变更 → 写入 `Y.Doc` 的 `nodes` Map
3. **Yjs CRDT** 自动通过 WebSocket 同步到其他客户端
4. **远端客户端** 的 `Y.Map.observe` 回调触发 → 调用 `editor.applyChanges()` 更新本地场景
5. **光标同步** 通过 Yjs Awareness Protocol 实现

---

## 十、数据流总览

```
用户操作 (鼠标/键盘)
    │
    ▼
MouseEventManager / KeyBindingManager
    │
    ▼
ToolManager → 当前激活工具 (如 SelectTool / DrawRectTool)
    │
    ├──► CommandManager.pushCommand(cmd)    ← 产生可撤销的命令
    │        │
    │        ├── undoStack.push(cmd)
    │        └── cmd.redo()                 ← 执行命令
    │               │
    │               ▼
    │        SuikaDocument (更新图形树)
    │               │
    │               ▼
    │        SceneGraph.render()            ← 重新渲染
    │               │
    │               ├── 清屏
    │               ├── 绘制背景 / 网格
    │               ├── 遍历图形树，逐一绘制
    │               ├── 绘制选区 / 控制柄
    │               └── 绘制标尺 / 参考线
    │
    └──► 多人协同时：sceneChange → SuikaBinding → Y.Doc → 远端同步
```

---

## 十一、工程化体系

| 工程化能力 | 工具 / 方案 |
|-----------|------------|
| 包管理 | pnpm workspace |
| 构建（库） | esbuild watch + tsc |
| 构建（应用） | Vite 5 |
| 类型检查 | TypeScript strict |
| 代码规范 | ESLint + Prettier + simple-import-sort |
| Git 规范 | Husky + lint-staged + commitlint (conventional commits) |
| 组件开发 | Storybook 7 |
| 单元测试 | Jest + ts-jest（geo 包） |
| CI/CD | GitHub Actions（PR 检查 + 主分支部署） |
| 文档 | VitePress |
| 部署 | SFTP + Nginx |

---

## 十二、设计模式与 Spec 索引

项目中运用了 7 种核心设计模式，每种都有对应的 Spec 文档深入讲解：

| 设计模式 | 应用场景 | Spec 文档 |
|---------|---------|----------|
| **模板方法** | `DrawGraphicsTool` 基类，子类只重写 `createGraphics` | `specs/rect-draw.spec.md` |
| **策略模式** | `SelectTool` 委托 Move/Resize/Rotate/Selection 策略 | `specs/select-tool.spec.md` |
| **命令模式** | `CommandManager` + `ICommand` + `Transaction` | `specs/undo-redo.spec.md` |
| **场景树** | Document → Canvas → Graphics 递归渲染 | `specs/rendering.spec.md` |
| **树形数据 + 分数索引** | `parentIndex` + `fractional-indexing` 排序 | `specs/layer-system.spec.md` |
| **编辑模式** | `PathEditor` 隔离路径编辑 / `TextEditor` 隔离文本编辑 | `specs/pen-tool.spec.md`、`specs/text-tool.spec.md` |
| **相机模型** | `scroll + zoom` 两参数坐标系 | `specs/viewport-zoom.spec.md` |

---

## 十三、面试导航图

```
面试官问"整体架构"
  → 用本文档的【二、包依赖关系】+【三、编辑器内核架构】回答

面试官问"某个具体功能怎么实现的"
  → 找对应 Spec 的【核心代码路径】章节

面试官问"为什么这么设计"
  → 找对应 Spec 的【架构设计决策（知其所以然）】章节

面试官问"用了什么设计模式"
  → 用上面【十二、设计模式索引】表格回答，展开讲 1-2 个
```

**推荐讲述顺序**（2-3 分钟介绍完项目）：

1. **一句话定位**："这是一个基于 Canvas 2D 的矢量图形编辑器，对标 Figma"
2. **技术选型**："Monorepo + TypeScript，核心是 `@suika/core` 包，不依赖任何渲染框架"
3. **核心架构**："中心是 `SuikaEditor` 聚合类，下面挂文档系统、工具系统、命令系统三大块"
4. **挑一个亮点展开**（根据面试官反应选）：
   - 工具系统 → 模板方法 + 策略模式
   - 撤销重做 → 命令模式 + Transaction
   - 渲染管线 → 场景树递归 + DPR + 视口变换
5. **加分项**："还支持多人协同，用 Yjs CRDT 通过 WebSocket 同步"

---

## 十四、性能优化速查（面试用）

面试官问"你做了哪些性能优化"时，按以下分类回答：

### 渲染层
- **`rafThrottle`**：多次 `render()` 调用合并到一个 `requestAnimationFrame`，避免一帧内重复渲染
- **Off-screen Canvas**：半透明图形先画到离屏 Canvas，再整体贴到主 Canvas，避免 alpha 叠加失真
- **DPR 适配**：`canvas.width = cssWidth × devicePixelRatio`，Retina 屏不模糊，普通屏不浪费像素
- **脏区跳过**：`isVisible() === false` 或 `opacity === 0` 的图形直接跳过绘制

### 数据层
- **全局 Map O(1) 查找**：`GraphicsStoreManager` 用 `Map<id, graphics>` 存所有图形，按 id 查找 O(1)
- **fractional-indexing O(1) 插入**：排序键是字符串，插入新元素只需生成一个中间键，不移动其他元素
- **字形缓存**：`SuikaText._glyphs` 缓存字形测量结果，content/fontSize 不变时不重算
- **二分查找**：文本光标定位 O(log n)、缩放级别查找 O(log n)

### 事件层
- **sceneChange 100ms 节流**：图形属性变更只收集到 Set，100ms 后合并成一次事件通知外部（协同/图层面板）
- **空操作跳过**：对齐前 `isAlreadyAligned` 检查、已在顶层再置顶直接 return，不生成空命令
- **zoomStep 对数映射**：`log(|deltaY|)` 让触控板慢划有响应、快划不过冲

### 面试话术
> "性能优化分三层：渲染层用 `rafThrottle` 合并重绘 + 离屏 Canvas 处理透明度；数据层用全局 Map 做 O(1) 查找 + fractional-indexing 做 O(1) 插入；事件层用节流合并高频变更通知。核心思路是**减少不必要的计算和渲染**。"

---

## 十五、技术亮点总结

1. **分层架构**：`geo → common → core → components → apps`，关注点分离清晰
2. **命令模式**：完整的撤销/重做系统，支持批量命令和宏命令
3. **工具系统**：策略模式实现工具切换，每个工具独立管理自己的交互逻辑
4. **场景图**：树状图形管理 + 类型映射表，支持序列化/反序列化
5. **坐标变换**：视口坐标 ↔ 场景坐标的双向转换，支持无限画布
6. **CRDT 协同**：Yjs 实现无冲突数据同步，与编辑器内核解耦
7. **几何引擎**：独立的几何计算库，包含贝塞尔曲线、矩阵变换、命中检测等
8. **性能优化**：Canvas 2D 直接渲染、rafThrottle 帧节流、PerfMonitor 监控
