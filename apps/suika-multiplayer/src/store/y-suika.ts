import { type HocuspocusProvider } from '@hocuspocus/provider';
import { EventEmitter, isEqual, pick, throttle } from '@suika/common';
import {
  type GraphicsAttrs,
  GraphicsType,
  type IChanges,
  type SuikaEditor,
} from '@suika/core';
import { type IPoint } from '@suika/geo';
import type * as Y from 'yjs';
import { type YMap, type YMapEvent } from 'yjs/dist/src/internals';

import { type IUserItem } from '../type';

const devLog = (...data: any[]) => {
  // console.log(...data);
};

interface Events {
  usersChange(items: IUserItem[]): void;
}

export class SuikaBinding {
  private doc: Y.Doc;
  private dataInitialed = false;

  private eventEmitter = new EventEmitter<Events>();

  constructor(
    /**
     * Yjs Map，用于存储图形数据
     */
    private yMap: YMap<Record<string, any>>,
    private editor: SuikaEditor,
    public awareness: NonNullable<HocuspocusProvider['awareness']>,
    private user: { username: string; id: number },
  ) {
    this.doc = yMap.doc!;
    // data
    // 监听场景变化
    editor.doc.on('sceneChange', this.suikaObserve);
    yMap.observe(this.yMapObserve);

    // awareness
    this.awareness.on('change', this.onAwarenessChange);
    this.editor.mouseEventManager.on('cursorPosUpdate', this.onCursorPosChange);
    this.awareness.setLocalStateField('user', {
      id: this.user.id,
      name: this.user.username,
      awarenessId: this.awareness.clientID,
      pos: null,
      color: getRandomColor(),
    });
  }

  // editor --> remote
  /**
   * 协作编辑系统的核心，负责将本地编辑器的变化同步到远程共享状态。
   * @param ops 变化数据
   */
  private suikaObserve = (ops: IChanges) => {
    const yMap = this.yMap;
    devLog('[[editor --> remote]]');
    devLog(ops);
    // 事务包装器，确保所有操作都以原子方式执行
    this.doc.transact(() => {
      // 遍历所有新添加的图形，直接设置到 Yjs Map 中
      for (const [id, attrs] of ops.added) {
        yMap.set(id, attrs);
      }
      // 遍历所有被删除的图形，直接从 Yjs Map 中删除
      // 其他协作用户会看到这些图形被移除
      for (const id of ops.deleted) {
        yMap.delete(id);
      }
      // 处理更新图形
      for (const [id, attrs] of ops.update) {
        const oldAttrs = yMap.get(id);
        const keys = Object.keys(attrs);
        // 使用 isEqual 和 pick 比较变化的属性,只有当属性真正发生变化时才更新，避免不必要的同步
        if (!isEqual(pick(oldAttrs, keys), attrs)) {
          // 将新属性合并到现有属性中
          yMap.set(id, { ...yMap.get(id), ...attrs });
        }
      }
    }, this);
  };

  // remote --> editor
  private yMapObserve = (event: YMapEvent<any>) => {
    const yMap = this.yMap;
    if (event.transaction.origin == this) {
      return;
    }
    devLog('[[remote --> editor]]');
    devLog('------ y.js event.changes ------');
    devLog(event.changes);
    const changes: IChanges = {
      added: new Map(),
      deleted: new Set(),
      update: new Map(),
    };
    for (const [id, { action }] of event.changes.keys) {
      if (action === 'delete') {
        changes.deleted.add(id);
        return;
      }
      const attrs = yMap.get(id) as GraphicsAttrs;
      if (action === 'add' && attrs.type !== GraphicsType.Document) {
        changes.added.set(id, attrs);
      } else if (action === 'update') {
        changes.update.set(id, attrs);
      }
    }

    devLog('------ parse to suika changes ------');
    devLog(changes);

    this.editor.applyChanges(changes);
    if (!this.dataInitialed) {
      this.editor.zoomManager.zoomToFit(1);
    }
    this.dataInitialed = true;
    this.editor.render();
  };

  private onAwarenessChange = () => {
    const users = Array.from(this.awareness.getStates().values())
      .filter((item) => item.user)
      .map((item) => item.user) as IUserItem[];
    this.eventEmitter.emit('usersChange', users);
  };

  private onCursorPosChange = throttle((pos: IPoint) => {
    const activeClientCount = this.awareness.getStates().size;
    if (activeClientCount < 2) return;

    const localState = this.awareness.getLocalState()!;
    this.awareness.setLocalStateField('user', {
      ...localState.user,
      pos: { ...pos },
    });
  }, 80);

  destroy() {
    // data
    this.yMap.unobserve(this.yMapObserve);
    this.editor.doc.off('sceneChange', this.suikaObserve);

    // awareness
    this.editor.mouseEventManager.off(
      'cursorPosUpdate',
      this.onCursorPosChange,
    );
    this.awareness.off('change', this.onAwarenessChange);
    this.awareness.destroy();
  }

  on<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.on(eventName, handler);
  }

  off<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.off(eventName, handler);
  }
}

const getRandomColor = () => {
  const randNum = getRandom(0, colors.length - 1);
  return colors[randNum];
};

const colors = [
  '#0C83AC',
  '#14B531',
  '#FFBC42',
  '#EE6352',
  '#26A0B3',
  '#3B9C37',
  '#0794A5',
  '#FFCD29',
  '#FF0044',
  '#9747FF',
  '#FF24BD',
  '#14AE5C',
];

const getRandom = (min: number, max: number) => {
  if (min > max) {
    [min, max] = [max, min];
  }
  min = Math.floor(min);
  max = Math.ceil(max);
  return Math.floor(Math.random() * (max - min + 1) + min);
};
