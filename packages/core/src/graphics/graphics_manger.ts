import { SuikaFrame, type SuikaGraphics } from '.';
import { SuikaCanvas } from './canvas';

/**
 * Graphics Manager
 *
 * 1. record "id -> graphics"
 * 2. TODO: search graphics by box (with R-Tree)
 */
export class GraphicsStoreManager {
  /**
   * 通用图形存储
   * 作用：提供统一的ID到图形对象的映射，用于快速查找任何图形
   */
  private graphicsStore = new Map<string, SuikaGraphics>();
  /**
   * 专门存储 SuikaCanvas 类型的图形对象
   * 主要负责点击测试，会遍历子元素进行命中检测
   */
  private canvasStore = new Map<string, SuikaCanvas>();
  /**
   * 存储 SuikaFrame 类型的图形对象
   * Frame是分组容器，可以包含其他图形
   */
  private frameStore = new Map<string, SuikaFrame>();

  /**
   * 添加图形
   * @param graphics 图形
   */
  add(graphics: SuikaGraphics) {
    // 获取图形 id
    const id = graphics.attrs.id;
    const graphicsStore = this.graphicsStore;
    // 如果图形已存在，则抛出警告
    if (graphicsStore.has(id)) {
      console.warn(`graphics ${id} has added`);
    }
    // 如果图形是画布，则添加到画布存储
    if (graphics instanceof SuikaCanvas) {
      // 添加到画布存储
      this.canvasStore.set(id, graphics);
    } else if (graphics instanceof SuikaFrame) {
      // 添加到帧存储
      this.frameStore.set(id, graphics);
    } else {
      // 添加到图形存储
    }
    // 添加到图形存储
    graphicsStore.set(id, graphics);
  }

  get(id: string) {
    return this.graphicsStore.get(id);
  }

  getAll() {
    const graphicsArr: SuikaGraphics[] = [];
    for (const [, graphics] of this.graphicsStore) {
      if (!graphics.isDeleted()) {
        graphicsArr.push(graphics);
      }
    }
    return graphicsArr;
  }

  getCanvas() {
    const canvas = Array.from(this.canvasStore.values());
    return canvas[0];
  }

  getFrames() {
    const frames = Array.from(this.frameStore.values());
    return frames;
  }

  clear() {
    // TODO: modify this.changes
    this.graphicsStore.clear();
    this.canvasStore.clear();
    this.frameStore.clear();
  }
}
