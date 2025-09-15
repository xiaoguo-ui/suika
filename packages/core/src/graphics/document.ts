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
  override type = GraphicsType.Document;
  protected override isContainer = true;
  /**
   * 图形存储管理器
   */
  graphicsStoreManager = new GraphicsStoreManager();
  private emitter = new EventEmitter<Events>();

  private changes = {
    /**
     * 记录新添加的图形对象
     * 数据结构：Map（键为图形ID，值为图形属性）
     */
    added: new Map<string, GraphicsAttrs>(),
    /**
     * 记录被删除的图形ID
     */
    deleted: new Set<string>(),
    /**
     * 被更新的图形ID
     */
    updatedIds: new Set<string>(),
  };

  private editor!: SuikaEditor;

  constructor(attrs: Optional<SuikaCanvasAttrs, 'id' | 'transform'>) {
    super({ ...attrs, type: GraphicsType.Document }, {} as IGraphicsOpts);
  }

  setEditor(editor: SuikaEditor) {
    this.editor = editor;
  }

  clear() {
    // TODO: update doc.updateInfo
    this.graphicsStoreManager.clear();
  }

  getCanvas() {
    return this.graphicsStoreManager.getCanvas();
  }

  getGraphicsById(id: string) {
    return this.graphicsStoreManager.get(id);
  }

  getGraphicsArrByIds(ids: Set<string>) {
    const graphicsArr: SuikaGraphics[] = [];
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

  getAllGraphicsArr() {
    return this.graphicsStoreManager.getAll();
  }

  getCurrCanvas() {
    return this.graphicsStoreManager.getCanvas();
  }
  /**
   * 添加图形
   * @param graphics 图形
   */
  addGraphics(graphics: SuikaGraphics) {
    // 添加图形
    this.graphicsStoreManager.add(graphics);
    // 记录新添加的图形对象
    this.changes.added.set(graphics.attrs.id, graphics.getAttrs());
    // 触发场景变化
    this.emitSceneChangeThrottle();
  }

  collectDeletedGraphics(graphics: SuikaGraphics) {
    const id = graphics.attrs.id;
    if (graphics.isDeleted()) {
      this.changes.deleted.add(id);
      this.changes.added.delete(id);
    } else {
      this.changes.deleted.delete(id);
      this.changes.added.set(id, graphics.getAttrs());
    }
    this.emitSceneChangeThrottle();
  }

  collectUpdatedGraphics(id: string) {
    this.changes.updatedIds.add(id);
    this.emitSceneChangeThrottle();
  }
  /**
   * 刷新更改
   * @returns 更改
   */
  flushChanges() {
    // 记录被更新的图形对象
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
    // 变化
    return changes;
  }
  /**
   * 重置更改
   */
  private clearChanges() {
    this.changes = {
      added: new Map(),
      deleted: new Set(),
      updatedIds: new Set(),
    };
  }
  /**
   * 触发场景变化
   */
  private emitSceneChangeThrottle = throttle(
    () => {
      const changes = this.flushChanges();
      // 触发场景变化事件
      this.emitter.emit('sceneChange', changes, 'unknown');
    },
    100,
    // { leading: false },
  );

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
