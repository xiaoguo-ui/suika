# Suika 技术实现问答

本文档整理了 Suika 项目中常见的技术实现问题及解答。

## 矩形选区相关

### Q: 矩形选区是如何实现的？

**A:** 矩形选区通过 `DrawSelectionTool` 类实现，主要流程如下：

1. **初始化阶段** (`onStart`):

   ```typescript
   // 记录鼠标按下时的起始点
   this.startPoint = this.editor.getSceneCursorXY(e);

   // 在场景图中设置选区起点
   this.editor.sceneGraph.setSelection(this.startPoint);
   ```

2. **拖拽阶段** (`onDrag`):

   ```typescript
   // 实时更新鼠标位置
   this.lastMouseScenePoint = this.editor.getSceneCursorXY(e);

   // 计算选区矩形
   const box = getRectByTwoPoint(this.startPoint, this.lastMouseScenePoint);

   // 更新选区显示
   this.editor.sceneGraph.setSelection(box);

   // 查找选区内的图形
   const graphsInSelection = getElementsInSelection(this.editor);
   this.editor.selectedElements.setItems(graphsInSelection);
   ```

3. **结束阶段** (`afterEnd`):

   ```typescript
   // 清理选区显示
   this.editor.sceneGraph.selection = null;
   this.editor.render();
   ```

### Q: 矩形选区如何判断图形是否被选中？

**A:** 使用深度优先搜索结合几何相交检测：

```typescript
const getElementsInSelectionDFS = (
  editor: SuikaEditor,
  box: IBox, // 选区包围盒
  node: SuikaGraphics, // 当前遍历节点
  parentIdSet: Set<string>,
): SuikaGraphics[] => {
  const graphicsArr: SuikaGraphics[] = [];

  for (const child of node.getChildren()) {
    // 跳过不可见/锁定元素
    if (!child.isVisible() || child.isLock()) continue;

    // 检查是否与选区相交
    if (child.intersectWithChildrenBox(box)) {
      graphicsArr.push(child);
    }
  }

  return graphicsArr;
};
```

### Q: Shift 键连选是如何工作的？

**A:** 连选模式通过以下逻辑实现：

```typescript
if (this.isShiftPressingWhenStart) {
  // 获取原有选中元素的父级ID集合
  const parentIdSet = getParentIdSet(this.startSelectedGraphs);

  // 查找新选中的元素
  const graphsInSelection = getElementsInSelection(editor, parentIdSet);

  // 恢复原有选中状态
  this.editor.selectedElements.setItems(this.startSelectedGraphs);

  // 对新元素进行切换操作
  this.editor.selectedElements.toggleItems(
    graphsInSelection.filter((item) => !parentIdSet.has(item.attrs.id)),
  );
}
```

## 坐标系统相关

### Q: 浏览器坐标如何转换为场景坐标？

**A:** 通过三步转换：

```typescript
getSceneCursorXY(event: { clientX: number; clientY: number }, round = false) {
  // 1. 浏览器坐标 → 视图坐标
  const { x, y } = this.getCursorXY(event);

  // 2. 视图坐标 → 场景坐标
  return this.toScenePt(x, y, round);
}

getCursorXY(event) {
  return {
    x: event.clientX - this.setting.get('offsetX'),
    y: event.clientY - this.setting.get('offsetY'),
  };
}

toScenePt(x: number, y: number, round = false) {
  const zoom = this.zoomManager.getZoom();
  const { x: scrollX, y: scrollY } = this.viewportManager.getViewport();

  let newX = scrollX + x / zoom;
  let newY = scrollY + y / zoom;

  if (round) {
    newX = Math.round(newX);
    newY = Math.round(newY);
  }

  return { x: newX, y: newY };
}
```

### Q: 视图坐标和场景坐标有什么区别？

**A:**

- **视图坐标**: 相对于编辑器视口的坐标，考虑画布偏移，但不考虑缩放
- **场景坐标**: 图形的实际存储坐标，考虑缩放和滚动偏移

**转换关系**:

```typescript
// 视图 → 场景
sceneX = scrollX + viewportX / zoom;

// 场景 → 视图
viewportX = (sceneX - scrollX) * zoom;
```

### Q: 为什么要四舍五入场景坐标？

**A:** 为了确保图形对齐到像素网格，避免模糊渲染：

```typescript
// 创建图形时通常使用 round = true
this.startPoint = this.editor.getSceneCursorXY(e, true);
```

## 碰撞检测相关

### Q: 图形悬停检测是如何实现的？

**A:** 使用逆序遍历的深度优先搜索：

```typescript
export const getTopHitElement = (editor: SuikaEditor, point: IPoint) => {
  const zoom = editor.zoomManager.getZoom();
  const tol = editor.setting.get('selectionHitPadding') / zoom;
  const canvasGraphics = editor.doc.getCurrCanvas();

  const hitOptions: IHitOptions = {
    tol,
    parentIdSet: editor.selectedElements.getParentIdSet(),
    zoom,
  };

  return canvasGraphics.getHitGraphics(point, hitOptions);
};
```

Canvas 类的实现：

```typescript
override getHitGraphics(point: IPoint, options: IHitOptions) {
  const children = this.getChildren();
  // 从后往前遍历，实现正确的 Z-order
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    const hitGraphics = child.getHitGraphics(point, options);
    if (hitGraphics) {
      return hitGraphics; // 找到第一个即返回
    }
  }
  return null;
}
```

### Q: 包围盒相交检测的性能优化有哪些？

**A:** 使用多层检测策略：

1. **AABB 快速检测**:

```typescript
if (!isBoxIntersect(box, this.getMinBbox())) {
  return false; // 快速排除
}
```

2. **旋转处理优化**:

```typescript
const rotate = this.getRotate();
if (!rotate || rotate % (Math.PI / 2) == 0) {
  return true; // 无旋转或90度倍数，直接返回相交
} else {
  // 使用SAT算法进行精确检测
}
```

3. **缓存优化**:

```typescript
protected _cacheBboxWithStroke: Readonly<IBox> | null = null;

getBboxWithStroke(): IBox {
  if (this._cacheBboxWithStroke) {
    return this._cacheBboxWithStroke; // 直接返回缓存
  }
  // 计算并缓存
  const bbox = this.computeBboxWithStroke();
  this._cacheBboxWithStroke = bbox;
  return bbox;
}
```

## 渲染优化相关

### Q: Canvas 渲染为什么不使用脏矩形渲染？

**A:** 基于以下考虑：

1. **交互密集**: 鼠标移动、选择等操作非常频繁
2. **状态复杂**: 悬停、选择、缩放状态需要同步更新
3. **全局影响**: 一个元素变化可能影响其他元素的显示

```typescript
// 当前策略：全画布重绘
render = rafThrottle(() => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 重绘所有内容...
});
```

### Q: 如何避免过度渲染？

**A:** 使用 `rafThrottle` 进行渲染节流：

```typescript
export const rafThrottle = (callback: (...args: any) => void) => {
  let requestId: number | undefined;

  const throttled = function (...args: unknown[]) {
    if (requestId === undefined) {
      requestId = requestAnimationFrame(() => {
        requestId = undefined;
        callback(args);
      });
    }
  };

  return throttled;
};
```

这样可以将渲染频率控制在 60fps 以下，避免不必要的性能开销。

## 选择工具相关

### Q: 选择工具如何处理不同操作模式？

**A:** 使用策略模式，根据鼠标按下时的上下文选择不同的策略：

```typescript
onStart(e: PointerEvent) {
  const handleInfo = this.editor.controlHandleManager.getHandleInfoByPoint(this.startPoint);

  if (handleInfo) {
    // 控制点操作：缩放或旋转
    if (isRotationCursor(handleInfo.cursor)) {
      this.currStrategy = this.strategySelectRotation;
    } else {
      this.currStrategy = this.strategySelectResize;
    }
  } else {
    const isInsideSelectedBox = this.editor.selectedBox.hitTest(this.startPoint);
    const topHitElement = getTopHitElement(this.editor, this.startPoint);

    if (isInsideSelectedBox) {
      // 移动操作
      this.currStrategy = this.strategyMove;
    } else if (topHitElement) {
      // 单选操作
      this.editor.selectedElements.setItems([topHitElement]);
      this.currStrategy = this.strategyMove;
    } else {
      // 矩形选区操作
      this.currStrategy = this.strategyDrawSelection;
    }
  }

  this.currStrategy?.onActive();
  this.currStrategy?.onStart(e);
}
```

### Q: 双击操作如何处理？

**A:** 在 `onComboClick` 事件中处理：

```typescript
private onComboClick = (event: IMouseEvent) => {
  const point = event.pos;
  const topHitElement = getTopHitElement(editor, point);

  if (!topHitElement) return;

  if (topHitElement instanceof SuikaPath) {
    // 双击路径：进入路径编辑模式
    editor.pathEditor.active(topHitElement);
  } else if (topHitElement instanceof SuikaText) {
    // 双击文本：进入文本编辑模式
    editor.textEditor.active({
      textGraphics: topHitElement,
      pos: topHitElement.getWorldPosition(),
      range: {
        start: 0,
        end: topHitElement.getContentLength(),
      },
    });
  } else if (isFrameGraphics(topHitElement) && topHitElement.isGroup()) {
    // 双击组：选中子元素
    // ...处理组的双击逻辑
  }
};
```

## 快捷键相关

### Q: 快捷键是如何注册和处理的？

**A:** 通过 KeyBindingManager 管理：

```typescript
// 注册快捷键
editor.keybindingManager.register({
  key: { metaKey: true, keyCode: 'KeyZ' },  // Cmd+Z (Mac) 或 Ctrl+Z (Win)
  winKey: { ctrlKey: true, keyCode: 'KeyZ' },
  when: (ctx) => !ctx.isToolDragging,       // 仅在非拖拽状态下生效
  actionName: 'Undo',
  action: () => editor.commandManager.undo(),
});

// 处理键盘事件
private handleAction = (e: KeyboardEvent) => {
  for (const keyBinding of this.keyBindingMap.values()) {
    // 检查条件和按键匹配
    if (this.isKeyMatch(keyBinding.key, e)) {
      e.preventDefault();
      keyBinding.action(e);
      break;
    }
  }
};
```

### Q: 高优先级快捷键是如何实现的？

**A:** 通过调整 Map 中的插入顺序：

```typescript
registerWithHighPrior(keybinding: IKeyBinding) {
  const map = new Map<number, IKeyBinding>();

  // 新快捷键放在最前面（高优先级）
  map.set(id, keybinding);

  // 复制现有快捷键
  for (const [key, val] of this.keyBindingMap) {
    map.set(key, val);
  }

  this.keyBindingMap = map;
}
```

这样在遍历时，高优先级快捷键会被先检查和执行。

## 总结

这些问答涵盖了 Suika 项目中的核心技术实现：

- **矩形选区**: 基于拖拽的几何选择算法
- **坐标转换**: 四层坐标系统的转换逻辑
- **碰撞检测**: 分层包围盒检测策略
- **渲染优化**: 全画布重绘 + 节流策略
- **交互处理**: 策略模式 + 事件驱动架构

这些实现体现了实用主义的设计原则，在性能、复杂度和用户体验之间取得了良好平衡。
