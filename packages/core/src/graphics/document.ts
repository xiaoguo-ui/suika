import { EventEmitter, throttle } from '@suika/common';

import { type SuikaEditor } from '../editor';
import { GraphicsType, type Optional } from '../type';
import {
  type GraphicsAttrs,
  type IGraphicsOpts,
  SuikaGraphics,
} from './graphics';
import { GraphicsStoreManager } from './graphics_manger';

type SuikaCanvasAttrs = GraphicsAttrs;

interface Events {
  sceneChange(
    ops: {
      added: Map<string, GraphicsAttrs>;
      deleted: Set<string>;
      update: Map<string, Partial<GraphicsAttrs>>;
    },
    source: string,
  ): void;
}

export class SuikaDocument extends SuikaGraphics<SuikaCanvasAttrs> {
  // 图形类型为文档
  override type = GraphicsType.Document;
  protected override isContainer = true;
  // 图形存储管理器
  graphicsStoreManager = new GraphicsStoreManager();
  private emitter = new EventEmitter<Events>();

  private changes = {
    // 记录新添加的图形对象
    added: new Map<string, GraphicsAttrs>(),
    // 记录被删除的图形ID
    deleted: new Set<string>(),
    // 被更新的图形ID
    updatedIds: new Set<string>(),
  };

  private editor!: SuikaEditor;

  constructor(attrs: Optional<SuikaCanvasAttrs, 'id' | 'transform'>) {
    super({ ...attrs, type: GraphicsType.Document }, {} as IGraphicsOpts);
  }

  // 设置编辑器
  setEditor(editor: SuikaEditor) {
    this.editor = editor;
  }
  // 清空图形存储
  clear() {
    // TODO: update doc.updateInfo
    this.graphicsStoreManager.clear();
  }
  // 获取画布
  getCanvas() {
    return this.graphicsStoreManager.getCanvas();
  }
  // 根据ID获取图形
  getGraphicsById(id: string) {
    return this.graphicsStoreManager.get(id);
  }
  // 根据ID集合获取图形数组
  getGraphicsArrByIds(ids: Set<string>) {
    const graphicsArr: SuikaGraphics[] = [];
    // 遍历ID集合
    for (const id of ids) {
      const graphics = this.getGraphicsById(id);
      if (!graphics) {
        console.warn(`id ${id} is no exist in graphics array`);
        continue;
      }
      graphicsArr.push(graphics);
    }
    return graphicsArr;
  }
  // 获取所有图形
  getAllGraphicsArr() {
    return this.graphicsStoreManager.getAll();
  }
  // 获取当前画布
  getCurrCanvas() {
    return this.graphicsStoreManager.getCanvas();
  }
  // 添加图形
  addGraphics(graphics: SuikaGraphics) {
    // 添加图形
    this.graphicsStoreManager.add(graphics);
    // 记录新添加的图形对象
    this.changes.added.set(graphics.attrs.id, graphics.getAttrs());
    // 触发场景变化
    this.emitSceneChangeThrottle();
  }
  // 收集删除的图形
  collectDeletedGraphics(graphics: SuikaGraphics) {
    // 当前图形的ID
    const id = graphics.attrs.id;
    // 当前图形可删除
    if (graphics.isDeleted()) {
      // 记录被删除的图形ID
      this.changes.deleted.add(id);
      // 删除新添加的图形对象
      this.changes.added.delete(id);
    } else {
      // 不可删除
      this.changes.deleted.delete(id);
      // 记录新添加的图形对象
      this.changes.added.set(id, graphics.getAttrs());
    }
    // 触发场景变化
    this.emitSceneChangeThrottle();
  }
  // 收集更新的图形ID
  collectUpdatedGraphics(id: string) {
    // 保存更新的图形ID
    this.changes.updatedIds.add(id);
    // 触发场景变化
    this.emitSceneChangeThrottle();
  }
  // 将文档中累积的图形变化汇总并返回一个标准化的变化对象
  flushChanges() {
    // 汇总被更新的图形对象
    const updates = new Map<string, Partial<GraphicsAttrs>>();
    // 遍历被更新的图形ID
    for (const id of this.changes.updatedIds) {
      // 获取图形对象
      const graphics = this.getGraphicsById(id);
      // 如果图形对象不存在，则抛出警告
      if (!graphics) {
        console.warn(`graphics ${id} is lost!`);
        continue;
      }
      // 记录被更新的图形对象
      updates.set(id, graphics.getUpdatedAttrs());
    }
    // 变化的值的状态
    const changes = {
      added: this.changes.added,
      deleted: this.changes.deleted,
      update: updates,
    };
    // 清除更改
    this.clearChanges();
    return changes;
  }
  // 重置更改
  private clearChanges() {
    this.changes = {
      added: new Map(),
      deleted: new Set(),
      updatedIds: new Set(),
    };
  }
  // 触发场景变化
  private emitSceneChangeThrottle = throttle(() => {
    const changes = this.flushChanges();
    this.emitter.emit('sceneChange', changes, 'unknown');
  }, 100);
  // 获取设备视口大小
  getDeviceViewSize() {
    const canvasEl = this.editor.canvasElement;
    return {
      width: canvasEl.width,
      height: canvasEl.height,
    };
  }

  on<T extends keyof Events>(eventName: T, listener: Events[T]) {
    this.emitter.on(eventName, listener);
  }
  off<T extends keyof Events>(eventName: T, listener: Events[T]) {
    this.emitter.off(eventName, listener);
  }
}
