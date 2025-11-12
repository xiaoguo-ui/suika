import { noop } from '@suika/common';
import {
  applyInverseMatrix,
  type IMatrixArr,
  type IPoint,
  type IRect,
  type ISize,
  normalizeRect,
} from '@suika/geo';

import { AddGraphCmd } from '../commands/add_graphs';
import { type ICursor } from '../cursor_manager';
import { type SuikaEditor } from '../editor';
import { isFrameGraphics, type SuikaGraphics } from '../graphics';
import { SnapHelper } from '../snap';
import { getDeepFrameAtPoint } from '../utils';
import { type ITool } from './type';

/**
 * Draw Graph Tool
 * reference: https://mp.weixin.qq.com/s/lD1qlGus3pRvT5ZfdH0_lg
 */
export abstract class DrawGraphicsTool implements ITool {
  // 这个设计允许系统通过 DrawRectTool.hotkey 自动获取快捷键配置，无需手动硬编码。
  static readonly type: string = ''; // 工具类型
  static readonly hotkey: string = ''; // 工具快捷键

  readonly type: string = ''; // 工具类型
  readonly hotkey: string = ''; // 工具快捷键

  cursor: ICursor = 'crosshair';
  commandDesc = 'Add Graphics';
  /**
   * 绘制的图形对象
   */
  protected drawingGraphics: SuikaGraphics | null = null;

  /**
   * 起始点
   * @description 起始点，用于计算矩形的起点
   */
  private startPoint: IPoint = { x: -1, y: -1 };
  /**
   * 拖拽点在场景中的坐标
   */
  private lastDragPoint!: IPoint;
  /**
   * 拖拽点在视口中的坐标
   */
  private lastDragPointInViewport!: IPoint;
  /**
   * 最后鼠标点
   */
  /** lastPoint with snap when dragging */
  private lastMousePoint!: IPoint;
  /**
   * 用于处理在绘制过程中按下空格键拖拽画布的场景，确保图形起点随画布移动而正确更新。
   */
  private startPointWhenSpaceDown: IPoint | null = null;
  /**
   * 用于处理在绘制过程中按下空格键拖拽画布的场景，确保图形起点随画布移动而正确更新。
   */
  private lastDragPointWhenSpaceDown: IPoint | null = null;
  /**
   * 是否正在拖拽
   */
  private isDragging = false;
  private unbindEvent: () => void = noop;

  constructor(protected editor: SuikaEditor) {}

  /**
   * 激活工具
   * @description 激活工具
   */
  onActive() {
    // 获取编辑器实例
    const editor = this.editor;
    // 获取修饰键管理器
    const hotkeysManager = editor.hostEventManager;
    /**
     * 更新矩形
     * @description 更新矩形
     */
    const updateRect = () => {
      // 如果正在拖拽，则更新矩形
      if (this.isDragging) {
        this.updateRect();
      }
    };
    // 监听 shift 键切换事件
    hotkeysManager.on('shiftToggle', updateRect);

    /**
     * 更新参考线
     * @description 更新参考线
     */
    const updateRefLinesWhenViewportTranslate = () => {
      // 通过 hostEventManager 判断是否使用空格键拖拽画布
      if (editor.hostEventManager.isDraggingCanvasBySpace) {
        return;
      }
      // 如果正在拖拽且启用对象吸附，则缓存参考线
      if (this.isDragging && this.editor.setting.get('snapToObjects')) {
        this.editor.refLine.cacheGraphicsRefLines({
          excludeItems: this.editor.selectedElements.getItems(),
        });
      }
    };
    /**
     * 更新正在绘制的矩形
     * @description 更新正在绘制的矩形
     */
    const updateRectWhenViewportTranslate = () => {
      // 如果正在拖拽画布，则返回
      if (editor.hostEventManager.isDraggingCanvasBySpace) {
        return;
      }
      // 如果正在拖拽，则更新矩形
      if (this.isDragging) {
        // 将拖拽点从视口坐标转换为场景坐标
        this.lastDragPoint = editor.toScenePt(
          this.lastDragPointInViewport.x,
          this.lastDragPointInViewport.y,
          this.editor.setting.get('snapToGrid'),
        );
        // 更新矩形
        this.updateRect();
      }
    };
    // 当视口位置（x或y坐标）发生变化时，更新参考线
    editor.viewportManager.on(
      'xOrYChange',
      updateRefLinesWhenViewportTranslate,
    );
    // 当视口位置（x或y坐标）发生变化时，更新正在绘制的矩形。
    editor.viewportManager.on('xOrYChange', updateRectWhenViewportTranslate);

    this.unbindEvent = () => {
      hotkeysManager.off('shiftToggle', updateRect);
      editor.viewportManager.off(
        'xOrYChange',
        updateRefLinesWhenViewportTranslate,
      );
      editor.viewportManager.off('xOrYChange', updateRectWhenViewportTranslate);
    };
  }

  onSpaceToggle(isSpacePressing: boolean) {
    if (this.isDragging && isSpacePressing) {
      this.startPointWhenSpaceDown = this.startPoint;
      this.lastDragPointWhenSpaceDown = this.lastMousePoint;
      this.updateRect();
    } else {
      this.startPointWhenSpaceDown = null;
      this.lastDragPointWhenSpaceDown = null;
    }
  }

  onAltToggle() {
    if (this.isDragging) {
      this.updateRect();
    }
  }

  onInactive() {
    this.unbindEvent();
  }
  onMoveExcludeDrag() {
    // do nothing;
  }
  /**
   * 开始绘制图形
   * @param e PointerEvent
   * @description 开始绘制图形
   */
  onStart(e: PointerEvent) {
    // 获取鼠标点击的起点【网格吸附点】
    this.startPoint = SnapHelper.getSnapPtBySetting(
      this.editor.getSceneCursorXY(e),
      this.editor.setting,
    );
    // 重置绘制图形
    this.drawingGraphics = null;
    // 重置拖拽状态
    this.isDragging = false;
    // 重置临时起点
    this.startPointWhenSpaceDown = null;
    // 重置临时拖拽点
    this.lastDragPointWhenSpaceDown = null;
  }
  /**
   * 拖拽绘制图形
   * @param e PointerEvent
   * @description 拖拽绘制图形
   */
  onDrag(e: PointerEvent) {
    // 禁用删除
    this.editor.hostEventManager.disableDelete();
    // 禁用右键菜单
    this.editor.hostEventManager.disableContextmenu();
    // 如果正在拖拽画布，则不进行绘制
    if (this.editor.hostEventManager.isDraggingCanvasBySpace) {
      return;
    }
    // 获取鼠标在视口中的位置
    this.lastDragPointInViewport = this.editor.getCursorXY(e);

    // 获取鼠标在场景中的位置
    this.lastDragPoint = this.lastMousePoint = SnapHelper.getSnapPtBySetting(
      this.editor.getSceneCursorXY(e),
      this.editor.setting,
    );
    // 如果未开始拖拽且启用对象捕捉，则缓存参考线
    if (!this.isDragging && this.editor.setting.get('snapToObjects')) {
      this.editor.refLine.cacheGraphicsRefLines();
    }
    // 获取参考线偏移量
    const offset = this.editor.refLine.getGraphicsSnapOffset([
      this.lastDragPoint,
    ]);
    // 更新拖拽点
    this.lastDragPoint = {
      x: this.lastDragPoint.x + offset.x,
      y: this.lastDragPoint.y + offset.y,
    };
    // 设置拖拽状态
    this.isDragging = true;
    // 更新绘制矩形
    this.updateRect();
  }
  /**
   * create graphics, and give the original rect (width may be negative)
   * noMove: if true, the graphics will not move when drag
   */
  protected abstract createGraphics(
    rect: IRect,
    parentGraphics: SuikaGraphics,
    noMove?: boolean,
  ): SuikaGraphics | null;

  /**
   * 按下 Shift 键时将矩形调整为正方形，边长取宽度和高度的绝对值的最大值。
   * @param rect 当前处理的矩形
   * @returns 调整后的矩形
   */
  protected adjustSizeWhenShiftPressing(rect: IRect) {
    // 获取当前尺寸
    const { width, height } = rect;
    // 获取最大边长
    const size = Math.max(Math.abs(width), Math.abs(height));
    // 保持方向并应用新尺寸
    rect.height = (Math.sign(height) || 1) * size;
    rect.width = (Math.sign(width) || 1) * size;
    // 返回调整后的矩形
    return rect;
  }

  /**
   * update graphics, and give the original rect (width may be negative)
   */
  protected updateGraphics(rect: IRect) {
    rect = normalizeRect(rect);
    const drawingShape = this.drawingGraphics!;

    const parent = drawingShape.getParent();
    let x = rect.x;
    let y = rect.y;
    if (parent && isFrameGraphics(parent)) {
      const tf = parent.getWorldTransform();
      const point = applyInverseMatrix(tf, rect);
      x = point.x;
      y = point.y;
    }

    drawingShape.updateAttrs({
      x: x,
      y: y,
      width: rect.width,
      height: rect.height,
    });
  }

  /**
   * 更新绘制矩形对象
   * @description 根据当前鼠标位置和修饰键状态，更新或创建图形对象
   */
  private updateRect() {
    // 如果不在拖拽状态，则返回
    if (!this.isDragging) return;

    // 获取拖拽点的坐标
    const { x, y } = this.lastDragPoint;
    // 获取场景图
    const sceneGraph = this.editor.sceneGraph;

    //  处理在绘制过程中按下空格键拖拽画布的场景，确保图形起点随画布移动而正确更新。
    if (this.startPointWhenSpaceDown && this.lastDragPointWhenSpaceDown) {
      // 获取空格键按下时的起始点坐标
      const { x: sx, y: sy } = this.startPointWhenSpaceDown;
      // 获取空格键按下时的拖拽点坐标
      const { x: lx, y: ly } = this.lastDragPointWhenSpaceDown;
      const dx = x - lx; // 计算x方向偏移量
      const dy = y - ly; // 计算y方向偏移量
      this.startPoint = {
        x: sx + dx, // 更新起始点x坐标
        y: sy + dy, // 更新起始点y坐标
      };
    }

    // 获取起始点坐标
    const { x: startX, y: startY } = this.startPoint;

    // 计算矩形的宽度和高度（可能为负值，表示反向绘制）
    let width = x - startX;
    let height = y - startY;

    // 处理宽度或高度为0的特殊情况
    if (width === 0 || height === 0) {
      const size = this.solveWidthOrHeightIsZero(
        { width, height },
        // lastMousePoint 仅网格吸附，未应用对象吸附
        {
          x: this.lastMousePoint.x - this.startPoint.x,
          y: this.lastMousePoint.y - this.startPoint.y,
        },
      );
      // 使用处理后的尺寸
      width = size.width;
      height = size.height;
    }

    // 创建矩形对象（坐标和尺寸，宽度和高度可能为负）
    let rect = {
      x: startX, // 矩形左上角x坐标
      y: startY, // 矩形左上角y坐标
      width, // 矩形宽度（可能为负）
      height, // 矩形高度（可能为负）
    };

    // 是否以起始点为中心绘制图形（Alt键按下）
    const isStartPtAsCenter = this.editor.hostEventManager.isAltPressing;
    // 是否保持图形为正方形（Shift键按下）
    const keepSquare = this.editor.hostEventManager.isShiftPressing;

    let cx = 0; // 中心点x坐标
    let cy = 0; // 中心点y坐标

    // 处理以中心点绘制的逻辑
    if (isStartPtAsCenter) {
      // 将矩形扩展为两倍大小，以起始点为中心
      rect = {
        x: rect.x - width, // 向左扩展
        y: rect.y - height, // 向上扩展
        width: rect.width * 2, // 宽度加倍
        height: rect.height * 2, // 高度加倍
      };

      // 计算中心点坐标
      cx = rect.x + rect.width / 2;
      cy = rect.y + rect.height / 2;
    }

    // 处理保持正方形的逻辑
    if (keepSquare) {
      rect = this.adjustSizeWhenShiftPressing(rect);
    }

    // 如果是以中心点绘制，需要重新调整矩形位置
    if (isStartPtAsCenter) {
      rect.x = cx - rect.width / 2; // 以中心点为准重新定位x坐标
      rect.y = cy - rect.height / 2; // 以中心点为准重新定位y坐标
    }

    // 如果已经创建了图形对象，则更新其属性
    if (this.drawingGraphics) {
      this.updateGraphics(rect);
    } else {
      // 创建新的图形对象
      const currentCanvas = this.editor.doc.getCurrCanvas();
      // 查找点击位置所在的画框（如果有）
      const frame = getDeepFrameAtPoint(
        this.startPoint,
        currentCanvas.getChildren(),
      );
      const parent = frame || currentCanvas; // 父级元素为画框或画布
      // 创建图形对象
      const graphics = this.createGraphics(rect, parent);
      this.drawingGraphics = graphics;
      if (!graphics) {
        return;
      }

      // 将图形添加到场景图中
      sceneGraph.addItems([graphics]);
      // 将图形插入到父级元素中
      parent.insertChild(graphics);
      // 如果在画框内绘制，需要设置世界变换矩阵
      if (frame) {
        const tf = [...graphics.attrs.transform] as IMatrixArr;
        graphics.setWorldTransform(tf);
      }
      // 设置当前选中的元素
      this.editor.selectedElements.setItems([graphics]);
    }
    // 触发渲染
    this.editor.render();
  }
  /**
   *
   *
   * 当起始点和拖拽点在同一水平或垂直线上时，宽度或高度为 0，导致图形不可见。
   * @description 处理宽度或高度为0的特殊情况
   * @param size 尺寸
   * @param delta 偏移量
   * @returns 处理后的尺寸
   */
  protected solveWidthOrHeightIsZero(size: ISize, delta: IPoint): ISize {
    const newSize = { width: size.width, height: size.height };
    // 处理宽度为0的情况
    if (size.width === 0) {
      // 返回方向符号（-1、0、1）
      const sign = Math.sign(delta.x) || 1;
      // 设置为网格间距
      newSize.width = sign * this.editor.setting.get('gridSnapX');
    }
    // 处理高度为0的情况
    if (size.height === 0) {
      // 返回方向符号（-1、0、1）
      const sign = Math.sign(delta.y) || 1;
      // 设置为网格间距
      newSize.height = sign * this.editor.setting.get('gridSnapY');
    }
    // 返回处理后的尺寸
    return newSize;
  }

  onEnd(e: PointerEvent) {
    if (this.editor.hostEventManager.isDraggingCanvasBySpace) {
      return;
    }

    const endPoint = SnapHelper.getSnapPtBySetting(
      this.editor.getSceneCursorXY(e),
      this.editor.setting,
    );

    if (this.drawingGraphics === null) {
      const { x: cx, y: cy } = endPoint;
      const width = this.editor.setting.get('drawGraphDefaultWidth');
      const height = this.editor.setting.get('drawGraphDefaultHeight');

      const currentCanvas = this.editor.doc.getCurrCanvas();
      const frame = getDeepFrameAtPoint(
        this.startPoint,
        currentCanvas.getChildren(),
      );
      const parent = frame || currentCanvas;

      this.drawingGraphics = this.createGraphics(
        {
          x: cx - width / 2,
          y: cy - height / 2,
          width,
          height,
        },
        parent,
        true,
      );

      if (this.drawingGraphics) {
        const graphics = this.drawingGraphics;
        this.editor.sceneGraph.addItems([graphics]);
        parent.insertChild(graphics);
        if (frame) {
          const tf = [...graphics.attrs.transform] as IMatrixArr;
          graphics.setWorldTransform(tf);
        }
        this.editor.selectedElements.setItems([graphics]);
        this.editor.render();
      }
    }

    if (this.drawingGraphics) {
      this.editor.commandManager.pushCommand(
        new AddGraphCmd(this.commandDesc, this.editor, [this.drawingGraphics]),
      );
    }
  }

  afterEnd() {
    this.isDragging = false;
    this.editor.hostEventManager.enableDelete();
    this.editor.hostEventManager.enableContextmenu();
    if (
      this.drawingGraphics &&
      !this.editor.setting.get('keepToolSelectedAfterUse')
    ) {
      this.editor.toolManager.setActiveTool('select');
    }
    this.startPointWhenSpaceDown = null;
    this.lastDragPointWhenSpaceDown = null;
    this.editor.refLine.clear();
  }
}
