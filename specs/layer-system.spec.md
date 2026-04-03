# 图层系统（场景树） Spec

> **一句话说清**：所有图形以树形结构组织——`SuikaDocument` → `SuikaCanvas` → 各图形节点（可嵌套 `SuikaFrame`/Group）。每个节点通过 `parentIndex: { guid, position }` 记录父子关系和排序，`position` 使用 fractional-indexing 生成字符串排序键，插入/重排不需要移动其他节点的索引。`GraphicsStoreManager` 用全局 `Map<id, graphics>` 存储所有节点，支持 O(1) 查找。

---

## 一、功能概述

图层系统管理画布上所有图形的组织结构：谁是谁的子元素、谁在谁上面、分组/解组、图层重排序。图层面板是它的 UI 表现。

**涉及文件**：

| 文件 | 职责 |
|------|------|
| `graphics/document.ts` | `SuikaDocument`：根节点，全局图形存储，变更追踪（sceneChange 事件） |
| `graphics/canvas.ts` | `SuikaCanvas`：画布节点，所有用户图形的直接/间接父容器 |
| `graphics/frame/frame.ts` | `SuikaFrame`：Frame（固定尺寸裁剪）和 Group（自适应尺寸） |
| `graphics/graphics/graphics.ts` | 基类：children 管理、insertChild、removeChild、排序、父子查询 |
| `graphics/graphics_manger.ts` | `GraphicsStoreManager`：全局 `Map<id, graphics>` 存储 |
| `selected_elements.ts` | `SelectedElements`：选中管理、toggleItems、selectAll |
| `service/arrange_and_record.ts` | 图层重排序（置顶/置底/上移/下移） |
| `service/group_and_record.ts` | 分组操作 |
| `service/ungroup_and_record.ts` | 解组操作 |
| `service/remove_service.ts` | 删除操作（含清理空 Group） |
| `scene/scene_graph.ts` | `toObjects()`：导出树结构给图层面板 |

---

## 二、用户操作流程

| 步骤 | 用户做了什么 | 系统响应 |
|:----:|-------------|---------|
| 1 | 画三个矩形 | 三个节点挂到 Canvas 下，图层面板显示 3 项 |
| 2 | 在图层面板拖拽排序 | 修改 parentIndex.position，渲染顺序变化 |
| 3 | 选中两个矩形，Ctrl+G | 创建 Group，两个矩形变成 Group 的子节点 |
| 4 | 选中 Group，Ctrl+Backspace | 解组：Group 删除，子元素提升到原来的层级 |
| 5 | 点图层面板的眼睛图标 | `visible = false`，图形隐藏，draw 时跳过 |
| 6 | 按 ] / [ 键 | 图形在同级内上移/下移一层 |
| 7 | 删除一个图形 | 软删除 + 如果父 Group 变空则连带删除 |

---

## 三、业务规则

### 规则1：场景树结构是 Document → Canvas → 图形节点（可嵌套 Frame/Group）
- **代码线索**：`SuikaDocument`、`SuikaCanvas`、`SuikaFrame`、`isContainer = true`
- **预期位置**：各类的定义处
- **验证方法**：在图层面板展开查看树形嵌套，最外层是 Canvas，里面可以有 Frame
- **验证结果**：✅ 已找到
- **代码位置**：`document.ts:25`（SuikaDocument）、`canvas.ts:13`（SuikaCanvas）、`frame.ts:25`（SuikaFrame）
- **为什么这么设计**：Document 是全局根节点，负责存储和变更追踪，本身不参与渲染。Canvas 是渲染根节点，`getWorldTransform()` 返回单位矩阵（它就是世界坐标原点）。这两层分离让"数据管理"和"渲染入口"职责清晰。用户创建的图形都挂在 Canvas 下（直接子节点或通过 Frame/Group 间接挂载）。只有 `isContainer = true` 的节点（Canvas、Frame）才有 children 数组，普通图形（Rect、Ellipse）不能有子节点——这防止了用户把矩形拖进椭圆这种无意义操作。

### 规则2：父子关系通过 parentIndex: { guid, position } 记录
- **代码线索**：`parentIndex`、`guid`、`position`
- **预期位置**：`graphics.ts` 中 `insertChild`、`getParent`
- **验证方法**：检查任何图形的 attrs.parentIndex，guid 是父节点 id，position 是排序键
- **验证结果**：✅ 已找到
- **代码位置**：`graphics.ts:866`（insertChild 设置 parentIndex）、`graphics.ts:928`（getParent 通过 guid 查找）
- **为什么这么设计**：把父子关系存在子节点的属性里（而不是父节点维护 childrenIds 数组），有两个好处：(1) 子节点可以独立序列化/反序列化——只要知道自己的 parentIndex，加载时就能自动挂到正确的父节点下；(2) 移动图形到另一个 Frame 只需改一个属性（parentIndex.guid），不需要同时修改旧父节点和新父节点的 children 数组。`getParent()` 通过 `doc.getGraphicsById(guid)` 在全局 Map 中 O(1) 查找父节点。

### 规则3：排序用 fractional-indexing 字符串键，插入不需要移动其他节点
- **代码线索**：`generateKeyBetween`、`generateNKeysBetween`、`position`、`sortChildren`
- **预期位置**：`graphics.ts:877-879`（insertChild 生成 sortKey）、`arrange_and_record.ts`（重排序）
- **验证方法**：连续画 5 个图形，检查它们的 position 值是否是递增的字符串
- **验证结果**：✅ 已找到
- **代码位置**：`graphics.ts:879`（`generateKeyBetween(maxSortIdx, null)`）、`arrange_and_record.ts:82`（`generateNKeysBetween`）
- **为什么这么设计**：传统做法是用整数索引（0,1,2,3），但插入到中间时所有后续元素都要 +1，批量操作代价是 O(n)。fractional-indexing 用字符串键（如 "a0", "a1", "a0V"），在任意两个键之间都能生成新键，不需要修改已有节点的 position。这对协同编辑特别重要——两个用户同时插入图形不会冲突。`sortChildren()` 按 position 字符串排序，排序结果就是渲染顺序（前面先画在底层，后面后画在顶层）。

### 规则4：GraphicsStoreManager 是全局扁平 Map，O(1) 通过 id 查找任何图形
- **代码线索**：`graphicsStore = new Map<string, SuikaGraphics>()`、`get(id)`
- **预期位置**：`graphics_manger.ts:10-31`
- **验证方法**：任何地方调 `doc.getGraphicsById(id)` 都能找到图形（包括被软删除的）
- **验证结果**：✅ 已找到
- **代码位置**：`graphics_manger.ts:10`（GraphicsStoreManager 类）
- **为什么这么设计**：场景树是逻辑结构（父子关系），但很多操作需要"通过 id 直接找到图形"——比如 undo/redo 时根据 originAttrsMap 的 id 恢复属性、图层面板点击时根据 id 选中图形。如果每次都遍历树查找，性能是 O(n)。全局 Map 让所有查找都是 O(1)。额外维护了 `canvasStore` 和 `frameStore` 两个子 Map，分别用于快速获取画布节点和所有 Frame（渲染时需要画 Frame 标题，遍历 frameStore 比遍历全树快）。

### 规则5：分组（Ctrl+G）创建 Group，子元素坐标转换到 Group 本地坐标系
- **代码线索**：`groupAndRecord`、`SuikaFrame({ resizeToFit: true })`、`multiplyMatrix(groupInvertTf, ...)`
- **预期位置**：`service/group_and_record.ts:14-91`
- **验证方法**：选中两个矩形 → Ctrl+G → 图层面板出现 Group，矩形变成子节点，位置不变
- **验证结果**：✅ 已找到
- **代码位置**：`group_and_record.ts:45`（创建 SuikaFrame）、`group_and_record.ts:76`（坐标转换）
- **为什么这么设计**：Group 的世界坐标由其 transform 决定。子元素之前在 Canvas 下有自己的世界坐标，移到 Group 下后，需要把世界坐标转换成相对于 Group 的本地坐标（`multiplyMatrix(groupInvertTf, child.getWorldTransform())`），这样子元素在屏幕上的位置不变。如果不做坐标转换，分组后所有元素会跳到 Group 原点附近。Group 用 `resizeToFit=true` 标记，意味着自动调整尺寸包裹所有子元素（和 Frame 的固定尺寸不同）。分组排序键取最后一个元素的 sortIndex，保证 Group 在原来的层级位置。

### 规则6：解组（Ctrl+Backspace）删除 Group，子元素坐标转换回父级坐标系
- **代码线索**：`ungroupAndRecord`、`flatFrame`、`child.setWorldTransform(worldTf)`
- **预期位置**：`service/ungroup_and_record.ts:13-114`
- **验证方法**：选中 Group → Ctrl+Backspace → 子元素回到上一级，位置不变
- **验证结果**：✅ 已找到
- **代码位置**：`ungroup_and_record.ts:62`（flatFrame 调用）、`ungroup_and_record.ts:106`（`setWorldTransform` 恢复位置）
- **为什么这么设计**：解组是分组的逆操作。先记住每个子元素的世界坐标（`getWorldTransform()`），然后把它们的 parentIndex 改回原来的父容器，最后用 `setWorldTransform` 恢复世界坐标。这样子元素在屏幕上的位置不变。Group 本身被软删除（`setDeleted(true)`）。新的排序键用 `generateNKeysBetween(left, right, n)` 在 Group 原来的位置之间生成，保证子元素在图层面板中出现在 Group 原来的位置。

### 规则7：图层重排序用 ] [ 键，修改 position 而不移动数组元素
- **代码线索**：`arrangeAndRecord`、`ArrangeType.Front/Back/Forward/Backward`、`generateKeyBetween`
- **预期位置**：`service/arrange_and_record.ts:9-285`
- **验证方法**：选中底层图形按 ]，观察它跑到上一层；按 Shift+] 置顶
- **验证结果**：✅ 已找到
- **代码位置**：`arrange_and_record.ts:59`（front）、`arrange_and_record.ts:163`（forward）
- **为什么这么设计**：四种重排操作的核心都是给被移动元素生成新的 position 值：置顶（Front）在最大 position 之后生成；置底（Back）在最小 position 之前生成；上移一层（Forward）在上方邻居和再上方邻居之间生成；下移一层同理。用 `generateKeyBetween` 生成中间键，不需要修改其他节点的 position。所有重排都通过 Transaction 记录，支持 undo。如果选中元素已经在目标位置（比如已经是最顶层了还按置顶），直接跳过不生成命令。

### 规则8：删除图形时如果父 Group 变空则连带删除
- **代码线索**：`removeGraphicsAndRecord`、`parent.isEmpty()` → `parent.setDeleted(true)`
- **预期位置**：`service/remove_service.ts:10-54`
- **验证方法**：Group 里只有一个矩形，删除矩形后 Group 也消失
- **验证结果**：✅ 已找到
- **代码位置**：`remove_service.ts:24-31`
- **为什么这么设计**：空 Group 没有可见内容也没有固定尺寸（`resizeToFit=true` 的 Group 尺寸由子元素决定），留着它只会让图层面板出现一个空壳，用户点不到也选不到，造成困惑。Figma 也是这样处理的——删除 Group 的最后一个子元素时 Group 自动消失。注意 Frame（`resizeToFit=false`）不受此规则影响，因为 Frame 有固定尺寸，即使没有子元素也是一个有意义的容器。

### 规则9：toObjects() 导出简化树结构给图层面板
- **代码线索**：`toObject()`、`toObjects()`、`{ type, id, name, visible, lock, children }`
- **预期位置**：`graphics.ts:603-612`（toObject）、`scene_graph.ts:243-249`（toObjects）
- **验证方法**：图层面板显示的树形结构和 toObjects() 的返回值一致
- **验证结果**：✅ 已找到
- **代码位置**：`graphics.ts:603`（toObject 定义）、`scene_graph.ts:243`（toObjects）
- **为什么这么设计**：图层面板不需要图形的全部属性（transform、fill、stroke 等），只需要名称、可见性、锁定状态和子节点列表。`toObject()` 返回一个简化的 `IObject`，递归 `children.map(item => item.toObject())` 生成完整树。这样图层面板 React 组件只订阅这个轻量数据，不需要持有完整的 SuikaGraphics 对象，减少不必要的重渲染。

### 规则10：Document 通过 sceneChange 事件通知外部数据变更
- **代码线索**：`collectUpdatedGraphics`、`collectDeletedGraphics`、`flushChanges`、`emitSceneChangeThrottle`
- **预期位置**：`document.ts:88-139`
- **验证方法**：任何图形属性变更后，sceneChange 事件被触发（节流 100ms）
- **验证结果**：✅ 已找到
- **代码位置**：`document.ts:100`（collectUpdatedGraphics）、`document.ts:132`（throttle 触发）
- **为什么这么设计**：外部系统（如协同编辑、自动保存、图层面板刷新）需要知道"哪些图形变了"。如果每次 `updateAttrs` 都立刻触发事件，一次拖拽移动 10 个图形每帧更新 10 次就会触发 600 次事件/秒。`collectUpdatedGraphics` 只是把变更的 id 存入 Set，`emitSceneChangeThrottle` 用 100ms 节流把多次变更合并成一次事件，包含 `added`（新增）、`deleted`（删除）、`update`（属性变更）三种变更信息，外部系统只处理增量数据而不需要全量刷新。

---

## 四、核心代码路径（完整调用链）

### 第 1 步：画一个矩形 → 挂到场景树

```
DrawRectTool.createGraphics()
  → new SuikaRect({ ... }, { doc })
    → 基类构造函数：attrs.id = genUuid()
    → doc（SuikaDocument）还没有记录这个图形

updateRect() 内首次拖拽时：
  → sceneGraph.addItems([graphics])
    → doc.addGraphics(graphics)
      → graphicsStoreManager.add(graphics)        ← 存入全局 Map<id, graphics>
      → changes.added.set(id, attrs)              ← 记录"新增"变更
      → emitSceneChangeThrottle()                 ← 100ms 后通知外部

  → parent.insertChild(graphics)                   ← 挂到 Canvas 或 Frame 下
    → [规则3] generateKeyBetween(maxSortIdx, null) ← 生成排序键（排在最后）
    → graphics.updateAttrs({ parentIndex: { guid: parent.id, position } })
    → this.children.push(graphics)
    → this.sortChildren()                          ← 按 position 排序
```

---

### 第 2 步：图层面板显示树结构

```
图层面板组件 mount / sceneChange 事件触发
  → sceneGraph.toObjects()
    → canvasGraphics.toObject()
      → {
          type, id, name: objectName,
          visible: isVisible(), lock: isLock(),
          children: this.children.map(child => child.toObject())  ← 递归
        }
    → 返回 Canvas 下所有子节点的简化树
  → React 渲染图层列表
```

---

### 第 3 步：选中两个矩形 → Ctrl+G 分组

```
用户按 Ctrl+G
  → groupAndRecord(selectedItems, editor)
    │
    │  准备
    ├─ graphicsArr = sortGraphics(selectedItems)   ← 按层级排序
    ├─ 计算所有选中图形的包围盒 boundRect
    │
    │  创建 Group
    ├─ group = new SuikaFrame({
    │     objectName: 'Group 1',
    │     resizeToFit: true,                       ← [规则1] 标记为 Group
    │     width: boundRect.width,
    │     height: boundRect.height,
    │   })
    ├─ parentOfGroup.insertChild(group, groupSortIndex)  ← 插到最后一个元素的位置
    │
    │  [规则5] 子元素坐标转换
    ├─ for (graphics of graphicsArr)
    │     transaction.recordOld(id, { parentIndex, transform })
    │     graphics.updateAttrs({
    │       transform: multiplyMatrix(groupInvertTf, worldTf)  ← 世界 → 本地
    │     })
    │     group.insertChild(graphics)              ← 改 parentIndex.guid
    │     transaction.update(id, { parentIndex, transform })
    │
    │  提交命令
    ├─ transaction.commit('group')
    ├─ sceneGraph.addItems([group])                ← 存入全局 Map
    └─ selectedElements.setItems([group])           ← 选中 Group
```

---

### 第 4 步：选中 Group → Ctrl+Backspace 解组

```
用户按 Ctrl+Backspace
  → ungroupAndRecord(selectedItems, editor)
    │
    │  [规则6] 解开每个选中的 Frame/Group
    ├─ for (child of frame.getChildren())
    │     worldTf = child.getWorldTransform()       ← 记住世界坐标
    │     transaction.recordOld(id, { parentIndex, transform })
    │     child.updateAttrs({ parentIndex: { guid: 原父容器id, position: 新排序键 } })
    │     child.insertAtParent(position)             ← 挂回原来的层级
    │     child.setWorldTransform(worldTf)           ← 恢复世界坐标（位置不变）
    │     transaction.update(id, { parentIndex, transform })
    │
    │  删除空壳 Group
    ├─ frame.removeFromParent()
    ├─ frame.setDeleted(true)
    ├─ transaction.remove(frame.id)
    │
    │  提交
    ├─ transaction.commit('ungroup')
    └─ selectedElements.setItems(所有释放出来的子元素)
```

---

### 第 5 步：按 ] 键 → 上移一层

```
用户按 ]
  → arrangeAndRecord(editor, ArrangeType.Forward)
    │
    │  [规则7] 对每个父容器内的选中元素处理
    ├─ children = parent.getChildren()             ← 已按 position 排序
    ├─ 找到最后一个未选中的元素位置（index）
    │
    │  交换位置
    ├─ for (i = index → 0)
    │     if (child 是选中的)
    │       newPosition = generateKeyBetween(
    │         children[i+1].position,              ← 上方邻居
    │         children[i+2]?.position ?? null       ← 再上方（可能没有）
    │       )
    │       swap(children, i, i+1)                 ← 数组内交换
    │       transaction.recordOld / update
    │
    │  提交
    ├─ parent.sortChildren()
    └─ transaction.commit('Arrange Forward')
```

---

## 五、耦合点

| 耦合系统 | 触发时机 | 为什么需要 |
|---------|---------|-----------|
| SceneGraph | 添加图形 / 导出树 | `addItems` 注册到全局 Map、`toObjects` 导出给图层面板 |
| 渲染系统 | 每帧 | 递归 `draw` 遍历场景树，children 顺序即渲染顺序 |
| 选择工具 | hitTest | `getHitGraphics` 倒序遍历 children 找最顶层命中 |
| 撤销重做 | 分组/解组/排序 | 所有操作通过 Transaction + UpdateGraphicsAttrsCmd 入栈 |
| SelectedElements | 全程 | 管理选中状态、提供 selectAll（选同级所有）、toggleItems |
| 协同编辑/自动保存 | sceneChange | Document 节流通知外部增量变更 |

---

## 六、架构设计决策（知其所以然）

### 为什么用 fractional-indexing 而不是整数索引排序？
> 整数索引（0,1,2,3）在中间插入时需要把后面的元素全部 +1，复杂度 O(n)。fractional-indexing 的字符串键（如 "a0", "a0V", "a1"）可以在任意两个键之间生成新键，不影响其他元素。这在协同编辑场景下尤为重要——两个用户同时在不同位置插入图形不会冲突，因为各自生成的 position 不会覆盖对方的。这个库（`fractional-indexing`）是 Figma 工程师写的。

### 为什么 parentIndex 存在子节点上而不是父节点维护 childrenIds？
> 子节点自描述（"我属于谁，我排第几"）让序列化和反序列化更简单——每个图形独立导出为一条数据，加载时按 parentIndex.guid 自动挂到正确的父节点下。如果用父节点维护 childrenIds，移动一个图形到另一个 Frame 需要同时修改旧父节点和新父节点的 childrenIds，Transaction 需要记录两个节点的变更，出错概率翻倍。

### 为什么 children 是运行时数组而不是持久化的？
> `parentIndex` 是持久化的（存在 attrs 里会被序列化），但 `children[]` 数组是运行时构建的——加载时通过 `initGraphicsTree` 遍历所有图形，根据 parentIndex.guid 调用 `insertChild` 重建 children 数组。这避免了"children 数组和 parentIndex 不一致"的问题——只有一个真相源（parentIndex），children 只是它的运行时投影。

### 为什么 Group 和 Frame 用同一个类（SuikaFrame）？
> 两者的代码差异很小——Group 多了 `resizeToFit=true`（自动调整大小）、draw 时跳过自身绘制和 clip。用一个类加一个布尔标志比维护两个类简单得多。`isGroup()` 方法就是 `return this.attrs.resizeToFit`，所有需要区分行为的地方用 `if (this.isGroup())` 分支。如果未来 Group 和 Frame 的行为差异变大，可以再拆分。

### 为什么 sceneChange 事件要节流 100ms 而不是每次变更都触发？
> 一次拖拽操作每帧更新多个图形的属性，如果每次 `updateAttrs` 都触发 sceneChange，外部系统（协同同步、自动保存）会被高频事件淹没。100ms 节流把一帧内的所有变更合并成一次事件，外部系统收到的是"这 100ms 内新增了哪些、删除了哪些、更新了哪些"的增量包，处理一次就够。
