// 鼠标事件管理器，负责处理编辑器的所有鼠标交互。

import { cloneDeep, EventEmitter, isEqual } from '@suika/common';
import { distance, type IPoint } from '@suika/geo';

import { type SuikaEditor } from '../editor';

export enum MouseKey {
  Left = 0, // 鼠标左键标识
  Mid = 1, //  鼠标中键标识
}

export type IMouseEvent = Readonly<{
  pos: Readonly<IPoint>;
  vwPos: Readonly<IPoint>;
  nativeEvent: PointerEvent;
  isComboClick?: boolean;
}>;

export type IMousemoveEvent = Readonly<{
  pos: Readonly<IPoint>;
  vwPos: Readonly<IPoint>;
  nativeEvent: PointerEvent;
  maxDragDistance: number;
  isOutside: boolean; // dragging state and mouse is outside canvas
}>;

interface Events {
  wheelBtnToggle(press: boolean, event: PointerEvent): void;
  cursorPosUpdate(pos: IPoint | null): void;
  start(event: IMouseEvent): void;
  end(event: IMouseEvent): void;
  move(event: IMousemoveEvent): void; // move but not dragging
  drag(event: IMousemoveEvent): void;
  comboClick(event: IMouseEvent): void;
}

export class MouseEventManager {
  // 记录鼠标中键是否按下
  private isWheelBtnPressing = false;
  // 事件发射器
  private eventEmitter = new EventEmitter<Events>();
  // 记录鼠标位置
  private cursorPos: IPoint | null = null;
  // 记录鼠标按下的场景坐标
  private startPos: IPoint = { x: 0, y: 0 };
  // 鼠标是否按下
  private isPressing = false;
  // 记录鼠标拖拽过程中的最大位移距离
  private maxDragDistance = 0;
  // 记录鼠标按下时间戳
  private pointerDownTimeStamp = -Infinity;
  // 记录鼠标按下的位置
  private lastPointerDownPos: IPoint = { x: -99, y: -99 };

  constructor(private editor: SuikaEditor) {
    this.bindEvent();
  }
  // 获取场景位置
  getCursorPos() {
    return cloneDeep(this.cursorPos);
  }
  // 设置场景位置
  private setCursorPos(pos: IPoint | null) {
    const prevCursorPos = this.cursorPos;
    this.cursorPos = pos && { x: pos.x, y: pos.y };

    if (!isEqual(prevCursorPos, this.cursorPos)) {
      this.eventEmitter.emit('cursorPosUpdate', cloneDeep(pos));
    }
  }

  // 鼠标按下事件处理函数
  private onPointerdown = (event: PointerEvent) => {
    // 判断是否是画布元素
    if (event.target !== this.editor.canvasElement) return;
    // 更新鼠标中键按下的状态
    this.updateIsWheelBtnPressing(event);
    // 更新鼠标按下的状态
    this.isPressing = true;
    // 场景坐标与视口坐标
    const { pos, vwPos } = this.getPosAndVwPos(event);
    this.startPos = { ...pos };
    // 检查双击是否触发
    const isComboClick = this.checkIfComboClick(event);
    const e = {
      pos, // 场景坐标
      vwPos, // 视口坐标
      nativeEvent: event, // 原始事件
      isComboClick, // 是否双击
    };
    this.eventEmitter.emit('start', e);
    // 如果双击触发，则发射双击事件
    if (isComboClick) {
      this.eventEmitter.emit('comboClick', e);
    }
  };
  // 处理鼠标移动事件
  private onPointerMove = (event: PointerEvent) => {
    // 检查鼠标是否在画布内部
    const isInsideCanvas = event.target === this.editor.canvasElement;
    // 如果鼠标在画布内部或者鼠标按下，则更新鼠标位置
    if (isInsideCanvas || this.isPressing) {
      const cursorPos = this.editor.getSceneCursorXY(event);
      this.setCursorPos(cursorPos);
    }
    // 获取鼠标位置和视口位置
    const { pos, vwPos } = this.getPosAndVwPos(event);
    // 鼠标按下并且一直按下状态
    if (this.isPressing) {
      // 计算鼠标移动距离
      const dx = pos.x - this.startPos.x;
      const dy = pos.y - this.startPos.y;

      // 在拖拽过程中持续更新
      const dragDistance = Math.max(Math.abs(dx), Math.abs(dy));
      this.maxDragDistance = Math.max(dragDistance, this.maxDragDistance);
      // 发射拖拽事件
      this.eventEmitter.emit('drag', {
        pos, // 场景坐标
        vwPos, // 视口坐标
        nativeEvent: event, // 原始事件
        isOutside: isInsideCanvas, // 是否在画布外部
        maxDragDistance: this.maxDragDistance, // 鼠标移动的最大距离
      });
    } else {
      this.eventEmitter.emit('move', {
        pos, // 场景坐标
        vwPos, // 视口坐标
        nativeEvent: event, // 原始事件
        isOutside: isInsideCanvas, // 是否在画布外部
        maxDragDistance: this.maxDragDistance, // 鼠标移动的最大距离
      });
    }
  };
  // 获取鼠标位置和视口位置
  private getPosAndVwPos(event: PointerEvent) {
    // 获取到视口坐标
    const vwPos = this.editor.getCursorXY(event);
    return {
      pos: this.editor.toScenePt(vwPos.x, vwPos.y),
      vwPos,
    };
  }
  // 鼠标释放事件处理函数
  private onPointerUp = (event: PointerEvent) => {
    // 更新中键状态
    this.updateIsWheelBtnPressing(event);
    // 重置按压状态
    this.isPressing = false;
    // 重置拖拽距离
    this.maxDragDistance = 0;
    // 是否在画布内
    const isInsideCanvas = event.target === this.editor.canvasElement;
    // 发出结束事件
    if (isInsideCanvas || this.isPressing) {
      this.eventEmitter.emit('end', {
        ...this.getPosAndVwPos(event),
        nativeEvent: event,
      });
    }
  };
  // 更新鼠标按下事件处理状态
  private updateIsWheelBtnPressing(event: PointerEvent) {
    // 鼠标中键
    if (event.button === MouseKey.Mid) {
      const prevWheelBtnPressing = this.isWheelBtnPressing;
      // 鼠标中键按下
      if (event.type === 'pointerdown') {
        this.isWheelBtnPressing = true;
        // 鼠标中键释放
      } else if (event.type === 'pointerup') {
        this.isWheelBtnPressing = false;
      }
      // 只有状态真正改变时才发射事件，避免重复通知
      if (prevWheelBtnPressing !== this.isWheelBtnPressing) {
        this.eventEmitter.emit(
          'wheelBtnToggle',
          this.isWheelBtnPressing,
          event,
        );
      }
    }
  }
  // 双击检测逻辑，用于识别用户的双击操作。
  private checkIfComboClick = (nativeEvent: PointerEvent) => {
    // 不是鼠标左键
    if (nativeEvent.button !== MouseKey.Left) return false;
    // 获取当前的时间戳
    const now = new Date().getTime();
    // 获取鼠标位置
    const newPos = {
      x: nativeEvent.pageX,
      y: nativeEvent.pageY,
    };
    // 获取时间间隔
    const interval = now - this.pointerDownTimeStamp;
    // 获取点击距离差
    const clickDistanceDiff = distance(newPos, this.lastPointerDownPos);
    if (
      interval < this.editor.setting.get('comboClickMaxGap') &&
      clickDistanceDiff < this.editor.setting.get('comboClickDistanceTol')
    ) {
      // 记录当前的时间戳
      this.pointerDownTimeStamp = now;
      return true;
    }
    // 记录当前的时间戳和鼠标位置
    this.pointerDownTimeStamp = now;
    // 记录鼠标的点击的位置
    this.lastPointerDownPos = newPos;
    return false;
  };
  // 绑定鼠标事件
  private bindEvent() {
    window.addEventListener('pointerdown', this.onPointerdown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }
  // 解绑鼠标事件
  private unbindEvent() {
    window.removeEventListener('pointerdown', this.onPointerdown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }
  destroy() {
    this.unbindEvent();
  }
  on<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.on(eventName, handler);
  }
  off<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.off(eventName, handler);
  }
}
