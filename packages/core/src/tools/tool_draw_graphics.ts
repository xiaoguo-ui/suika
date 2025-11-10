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

  private startPoint: IPoint = { x: -1, y: -1 };
  private lastDragPoint!: IPoint;
  private lastDragPointInViewport!: IPoint;
  /** lastPoint with snap when dragging */
  private lastMousePoint!: IPoint;
  /**
   * use to calculate the offset, to change the graphics's start point
   */
  private startPointWhenSpaceDown: IPoint | null = null;
  private lastDragPointWhenSpaceDown: IPoint | null = null;
  /**
   * 是否正在拖拽
   */
  private isDragging = false;
  private unbindEvent: () => void = noop;

  constructor(protected editor: SuikaEditor) {}

  onActive() {
    const editor = this.editor;
    const hotkeysManager = editor.hostEventManager;
    const updateRect = () => {
      if (this.isDragging) {
        this.updateRect();
      }
    };
    hotkeysManager.on('shiftToggle', updateRect);

    const updateRefLinesWhenViewportTranslate = () => {
      if (editor.hostEventManager.isDraggingCanvasBySpace) {
        return;
      }
      if (this.isDragging && this.editor.setting.get('snapToObjects')) {
        this.editor.refLine.cacheGraphicsRefLines({
          excludeItems: this.editor.selectedElements.getItems(),
        });
      }
    };
    const updateRectWhenViewportTranslate = () => {
      if (editor.hostEventManager.isDraggingCanvasBySpace) {
        return;
      }
      if (this.isDragging) {
        this.lastDragPoint = editor.toScenePt(
          this.lastDragPointInViewport.x,
          this.lastDragPointInViewport.y,
          this.editor.setting.get('snapToGrid'),
        );
        this.updateRect();
      }
    };
    editor.viewportManager.on(
      'xOrYChange',
      updateRefLinesWhenViewportTranslate,
    );
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
    // 获取鼠标点击的起点
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

  protected adjustSizeWhenShiftPressing(rect: IRect) {
    // pressing Shift to draw a square
    const { width, height } = rect;
    const size = Math.max(Math.abs(width), Math.abs(height));
    rect.height = (Math.sign(height) || 1) * size;
    rect.width = (Math.sign(width) || 1) * size;
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

  /** update drawing rect object */
  private updateRect() {
    if (!this.isDragging) return;

    const { x, y } = this.lastDragPoint;
    const sceneGraph = this.editor.sceneGraph;

    if (this.startPointWhenSpaceDown && this.lastDragPointWhenSpaceDown) {
      const { x: sx, y: sy } = this.startPointWhenSpaceDown;
      const { x: lx, y: ly } = this.lastDragPointWhenSpaceDown;
      const dx = x - lx;
      const dy = y - ly;
      this.startPoint = {
        x: sx + dx,
        y: sy + dy,
      };
    }

    const { x: startX, y: startY } = this.startPoint;

    let width = x - startX;
    let height = y - startY;

    if (width === 0 || height === 0) {
      const size = this.solveWidthOrHeightIsZero(
        { width, height },
        {
          x: this.lastMousePoint.x - this.startPoint.x,

          y: this.lastMousePoint.y - this.startPoint.y,
        },
      );
      width = size.width;
      height = size.height;
    }

    let rect = {
      x: startX,
      y: startY,
      width, // width may be negative
      height, // height may be negative
    };

    // whether to set the starting point as the center of the graphics
    const isStartPtAsCenter = this.editor.hostEventManager.isAltPressing;
    // whether to keep the graphics square
    const keepSquare = this.editor.hostEventManager.isShiftPressing;

    let cx = 0;
    let cy = 0;
    if (isStartPtAsCenter) {
      rect = {
        x: rect.x - width,
        y: rect.y - height,
        width: rect.width * 2,
        height: rect.height * 2,
      };

      cx = rect.x + rect.width / 2;
      cy = rect.y + rect.height / 2;
    }

    if (keepSquare) {
      rect = this.adjustSizeWhenShiftPressing(rect);
    }

    if (isStartPtAsCenter) {
      rect.x = cx - rect.width / 2;
      rect.y = cy - rect.height / 2;
    }

    if (this.drawingGraphics) {
      this.updateGraphics(rect);
    } else {
      const currentCanvas = this.editor.doc.getCurrCanvas();
      const frame = getDeepFrameAtPoint(
        this.startPoint,
        currentCanvas.getChildren(),
      );
      const parent = frame || currentCanvas;
      const graphics = this.createGraphics(rect, parent);
      this.drawingGraphics = graphics;

      if (!graphics) {
        return;
      }

      sceneGraph.addItems([graphics]);
      parent.insertChild(graphics);
      if (frame) {
        const tf = [...graphics.attrs.transform] as IMatrixArr;
        graphics.setWorldTransform(tf);
      }
      this.editor.selectedElements.setItems([graphics]);
    }
    this.editor.render();
  }

  protected solveWidthOrHeightIsZero(size: ISize, delta: IPoint): ISize {
    const newSize = { width: size.width, height: size.height };
    if (size.width === 0) {
      const sign = Math.sign(delta.x) || 1;
      newSize.width = sign * this.editor.setting.get('gridSnapX');
    }
    if (size.height === 0) {
      const sign = Math.sign(delta.y) || 1;
      newSize.height = sign * this.editor.setting.get('gridSnapY');
    }
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
