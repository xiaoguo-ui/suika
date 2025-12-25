import { EventEmitter, getDevicePixelRatio } from '@suika/common';
import { type IBox, type IRect } from '@suika/geo';

import { type SuikaEditor } from './editor';

interface Events {
  xOrYChange(x: number | undefined, y: number): void;
}
/* 
  视口管理器
*/
export class ViewportManager {
  /**
   * 水平方向的滚动偏移量，表示视口左上角在画布坐标系中的 X 坐标
   */
  private scrollX = 0;
  /**
   * 垂直方向的滚动偏移量，表示视口左上角在画布坐标系中的 Y 坐标
   */
  private scrollY = 0;

  private eventEmitter = new EventEmitter<Events>();

  constructor(private editor: SuikaEditor) {}
  // 获取视口区域（滚动位置和画布尺寸）
  getViewport(): IRect {
    return {
      x: this.scrollX,
      y: this.scrollY,
      width: parseFloat(this.editor.canvasElement.style.width),
      height: parseFloat(this.editor.canvasElement.style.height),
    };
  }
  /**
   * 设置画板大小
   * @param x 画板 x 坐标
   * @param y 画板 y 坐标
   * @param width 画板宽度
   * @param height 画板高度
   */
  setViewport({ x, y, width, height }: Partial<IRect>) {
    // 记录之前的 x 和 y
    const prevX = this.scrollX;
    const prevY = this.scrollY;
    // 获取设备像素比
    const dpr = getDevicePixelRatio();
    // 设置画板 x 坐标，如果 x 未定义，则不设置
    if (x !== undefined) {
      this.scrollX = x;
    }
    // 设置画板 y 坐标，如果 y 未定义，则不设置
    if (y !== undefined) {
      this.scrollY = y;
    }
    // 设置画板宽度
    if (width !== undefined) {
      this.editor.canvasElement.width = width * dpr;
      this.editor.canvasElement.style.width = width + 'px';
    }
    // 设置画板的高度
    if (height !== undefined) {
      this.editor.canvasElement.height = height * dpr;
      this.editor.canvasElement.style.height = height + 'px';
    }
    /**
     * 目的是检查视口的位置是否发生了变化，如果有变化就触发事件通知监听者。
     */
    if (prevX !== x || prevY !== y) {
      this.eventEmitter.emit('xOrYChange', x as number, y as number);
    }
  }
  /**
   * 获取视口中心点
   * @returns 视口中心点
   */
  getCenter() {
    // 获取视口参数
    const { x, y, width, height } = this.getViewport();
    // 获取缩放比例
    const zoom = this.editor.zoomManager.getZoom();
    return {
      // 计算视口中心点的坐标
      x: x + width / 2 / zoom,
      y: y + height / 2 / zoom,
    };
  }
  /**
   * 平移视口
   * @param dx 水平方向的平移量
   * @param dy 垂直方向的平移量
   */
  translate(dx: number, dy: number) {
    // 平移视口
    this.scrollX += dx;
    this.scrollY += dy;
    // 触发事件通知监听者
    this.eventEmitter.emit('xOrYChange', this.scrollX, this.scrollY);
  }
  /**
   * 获取视口包围盒
   * @returns 视口包围盒
   */
  getBbox(): IBox {
    // 获取视口参数
    const { x, y, width, height } = this.getViewport();
    // 获取缩放比例
    const zoom = this.editor.zoomManager.getZoom();
    return {
      minX: x,
      minY: y,
      // 为什么需要 / zoom？
      /* 
      1、width 和 height 是物理像素：
        从 getViewport() 返回的 width/height 是 canvas 的 CSS 像素尺寸
        例如：800px × 600px
      2、逻辑坐标系的转换：
        当缩放比例 zoom = 2 时，800px 物理宽度只对应 400 个逻辑单位
        当缩放比例 zoom = 0.5 时，800px 物理宽度对应 1600 个逻辑单位
      3、保持与其他包围盒一致：
        图形元素的 getBbox() 返回的是逻辑坐标系中的包围盒
        参考线、选择框等功能都需要在同一坐标系下工作
      假设视口参数：
        位置：(0, 0)
        物理尺寸：800px × 600px
        缩放比例：2倍
      计算结果：
      maxX = 0 + 800 / 2 = 400
      maxY = 0 + 600 / 2 = 300
      这意味着在逻辑坐标系中，视口覆盖的区域是 400×300 个单位，与图形元素的包围盒坐标系完全一致。
      */
      maxX: x + width / zoom,
      maxY: y + height / zoom,
    };
  }

  on<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.on(eventName, handler);
  }
  off<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.off(eventName, handler);
  }
}
