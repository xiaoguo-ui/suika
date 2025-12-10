import { SuikaFrame, type SuikaGraphics } from '.';
import { SuikaCanvas } from './canvas';

/**
 * Graphics Manager
 * 整个图形系统的"数据库"，为文档系统提供高效的图形对象存取服务
 */
export class GraphicsStoreManager {
  // 保存所有的图形对象
  private graphicsStore = new Map<string, SuikaGraphics>();
  // 专门存储画布类型的图形对象
  private canvasStore = new Map<string, SuikaCanvas>();
  // 存储帧类型的图形对象【分组容器】
  private frameStore = new Map<string, SuikaFrame>();
  // 添加图形
  add(graphics: SuikaGraphics) {
    // 获取图形 ID
    const id = graphics.attrs.id;
    const graphicsStore = this.graphicsStore;

    if (graphicsStore.has(id)) console.warn(`graphics ${id} has added`);
    // 如果图形是画布，则添加到画布存储
    if (graphics instanceof SuikaCanvas) {
      this.canvasStore.set(id, graphics);
    } else if (graphics instanceof SuikaFrame) {
      this.frameStore.set(id, graphics);
    }
    graphicsStore.set(id, graphics);
  }
  // 根据ID获取图形
  get(id: string) {
    return this.graphicsStore.get(id);
  }
  // 获取所有图形
  getAll() {
    const graphicsArr: SuikaGraphics[] = [];
    for (const [, graphics] of this.graphicsStore) {
      if (!graphics.isDeleted()) {
        graphicsArr.push(graphics);
      }
    }
    return graphicsArr;
  }
  // 获取画布
  getCanvas() {
    const canvas = Array.from(this.canvasStore.values());
    return canvas[0];
  }
  // 获取所有帧
  getFrames() {
    const frames = Array.from(this.frameStore.values());
    return frames;
  }
  // 清空图形存储
  clear() {
    // TODO: modify this.changes
    this.graphicsStore.clear();
    this.canvasStore.clear();
    this.frameStore.clear();
  }
}
