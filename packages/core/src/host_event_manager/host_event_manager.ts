import { EventEmitter } from '@suika/common';
import { type IPoint } from '@suika/geo';

import { type SuikaEditor } from '../editor';
import { CommandKeyBinding } from './command_key_binding';
import { MoveGraphsKeyBinding } from './move_graphs_key_binding';

interface Events {
  shiftToggle(press: boolean): void;
  altToggle(press: boolean): void;
  spaceToggle(press: boolean): void;
  contextmenu(point: IPoint): void;
}

/**
 * 对原生事件做一层封装
 *
 * 1. 监听 Shift、Alt、Space、Command 的按下释放事件
 * 2. 滚轮事件
 * 3. 鼠标右键菜单
 */
export class HostEventManager {
  // 是否按下 shift 键
  isShiftPressing = false;
  // 是否按下 ctrl 键
  isCtrlPressing = false;
  // 是否按下 alt 键
  isAltPressing = false;
  // 是否按下 command 键
  isCommandPressing = false;
  // 是否按下 space 键
  isSpacePressing = false;
  // 是否按下滚轮键
  isWheelBtnPressing = false;

  // 是否正在拖拽画布
  isDraggingCanvasBySpace = false;
  // 是否启用删除
  isEnableDelete = true;
  // 是否启用右键菜单
  isEnableContextMenu = true;

  // 方向键移动快捷键绑定
  private moveGraphsKeyBinding: MoveGraphsKeyBinding;
  // 命令快捷键绑定
  private commandKeyBinding: CommandKeyBinding;

  // 事件发射器
  private eventEmitter = new EventEmitter<Events>();
  // 解除绑定函数数组
  private unbindHandlers: Array<() => void> = [];

  constructor(private editor: SuikaEditor) {
    // 绑定方向键移动快捷键
    this.moveGraphsKeyBinding = new MoveGraphsKeyBinding(editor);
    // 绑定命令快捷键
    this.commandKeyBinding = new CommandKeyBinding(editor);
  }
  // 绑定快捷键
  bindHotkeys() {
    // 监听 shift、alt、space 键的按下和释放事件
    this.observeModifiersToggle();
    // 绑定滚轮事件
    this.bindWheelEvent();
    // 绑定右键菜单事件
    this.bindContextMenu();
    // 绑定方向键移动快捷键
    this.moveGraphsKeyBinding.bindKey();
    // 绑定命令快捷键
    this.commandKeyBinding.bindKey();
  }
  // 监听 shift、alt、space 键的按下和释放事件
  private observeModifiersToggle() {
    // 监听 shift、alt、space 键的按下和释放事件的处理器
    const handler = (event: KeyboardEvent) => {
      // 记录按下前的状态
      const prevShift = this.isShiftPressing;
      // 记录按下前的状态
      const prevAlt = this.isAltPressing;
      // 记录按下前的状态
      const prevSpace = this.isSpacePressing;

      // 记录当前按下状态
      this.isShiftPressing = event.shiftKey;
      // 记录当前按下状态
      this.isCtrlPressing = event.ctrlKey;
      // 记录当前按下状态
      this.isAltPressing = event.altKey;
      // 记录当前按下状态
      this.isCommandPressing = event.metaKey;
      // 空格键按下和释放事件
      if (event.code === 'Space') {
        this.isSpacePressing = event.type === 'keydown';
      }

      // 如果按下前的状态和当前状态不一致，则发出 shiftToggle、altToggle、spaceToggle 事件
      if (prevShift !== this.isShiftPressing) {
        // 发出 shiftToggle 事件
        this.eventEmitter.emit('shiftToggle', this.isShiftPressing);
      }
      if (prevAlt !== this.isAltPressing) {
        // 发出 altToggle 事件
        this.eventEmitter.emit('altToggle', this.isAltPressing);
      }
      if (prevSpace !== this.isSpacePressing) {
        // 发出 spaceToggle 事件
        this.eventEmitter.emit('spaceToggle', this.isSpacePressing);
      }
    };
    // 监听键盘按下和释放事件
    document.addEventListener('keydown', handler);
    document.addEventListener('keyup', handler);

    // 解除绑定
    this.unbindHandlers.push(() => {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('keyup', handler);
    });
  }

  // shiftToggle 会在切换时触发。按住 shift 不放，只会触发一次
  on<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.on(eventName, handler);
  }
  off<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.off(eventName, handler);
  }

  // 绑定滚轮事件，用于缩放或移动画布
  private bindWheelEvent() {
    // 获取编辑器实例
    const editor = this.editor;
    // canvas 滚轮事件处理函数
    const onWheel = (event: WheelEvent) => {
      // 如果按下 ctrl 或 command 键，则阻止默认行为
      if (event.ctrlKey || event.metaKey) {
        // 阻止默认行为
        event.preventDefault();
        // 获取鼠标位置
        const point = this.editor.getCursorXY(event);
        // 获取缩放方向
        // event.deltaY 是鼠标滚轮事件的垂直滚动量
        // 如果 event.deltaY 大于 0，则表示向上滚动，即缩小画布
        // 如果 event.deltaY 小于 0，则表示向下滚动，即放大画布
        let isZoomOut = event.deltaY > 0;
        // 如果启用反向缩放，则反转缩放方向
        if (this.editor.setting.get('invertZoomDirection')) {
          isZoomOut = !isZoomOut;
        }
        // 如果缩放方向为缩小，则缩小画布
        if (isZoomOut) {
          // 缩小画布
          editor.zoomManager.zoomOut({
            center: point,
            deltaY: event.deltaY,
          });
        } else {
          // 放大画布
          editor.zoomManager.zoomIn({
            center: point,
            deltaY: event.deltaY,
          });
        }
        // 渲染编辑器
        editor.render();
      } else {
        // 如果画布拖拽器激活且正在拖拽，则返回
        if (
          this.editor.canvasDragger.isActive() &&
          this.editor.canvasDragger.isPressing()
        ) {
          return;
        }
        // 获取缩放比例
        const zoom = editor.zoomManager.getZoom();
        // 移动视口
        editor.viewportManager.translate(
          event.deltaX / zoom,
          event.deltaY / zoom,
        );
        // 渲染编辑器
        editor.render();
      }
    };

    // 阻止默认的缩放页面行为
    const preventDefaultScalePage = (event: WheelEvent) => {
      // 如果按下 ctrl 或 command 键，则阻止默认行为
      if (event.ctrlKey || event.metaKey) {
        // 阻止默认的缩放页面行为
        event.preventDefault();
      }
    };

    // 绑定滚轮事件到画布
    editor.canvasElement.addEventListener('wheel', onWheel);
    // 绑定滚轮事件到窗口,阻止默认的缩放页面行为
    // 设置 passive 为 false，表示事件处理函数需要返回一个布尔值，表示是否阻止默认行为
    window.addEventListener('wheel', preventDefaultScalePage, {
      passive: false,
    });
    // 解除绑定
    this.unbindHandlers.push(() => {
      // 解除滚轮事件到画布
      editor.canvasElement.removeEventListener('wheel', onWheel);
      // 解除滚轮事件到窗口
      window.removeEventListener('wheel', preventDefaultScalePage);
    });
  }

  // 绑定右键菜单事件
  private bindContextMenu() {
    // 右键菜单事件处理函数
    const handler = (e: MouseEvent) => {
      // 阻止默认行为
      e.preventDefault();
      // 如果启用右键菜单，则发出 contextmenu 事件
      if (this.isEnableContextMenu) {
        // 发出 contextmenu 事件
        this.eventEmitter.emit('contextmenu', { x: e.clientX, y: e.clientY });
      }
    };
    // 绑定右键菜单事件到画布
    this.editor.canvasElement.addEventListener('contextmenu', handler);
    // 解除绑定
    this.unbindHandlers.push(() => {
      // 解除右键菜单事件到画布
      this.editor.canvasElement.removeEventListener('contextmenu', handler);
    });
  }

  // 启用删除
  enableDelete() {
    this.isEnableDelete = true;
  }
  // 禁用删除
  disableDelete() {
    this.isEnableDelete = false;
  }
  // 启用右键菜单
  enableContextmenu() {
    this.isEnableContextMenu = true;
  }
  // 禁用右键菜单
  disableContextmenu() {
    this.isEnableContextMenu = false;
  }
  // 销毁
  destroy() {
    // 解除绑定
    this.unbindHandlers.forEach((fn) => fn());
    // 清空绑定函数数组
    this.unbindHandlers = [];
    // 销毁方向键移动快捷键绑定
    this.moveGraphsKeyBinding.destroy();
    // 销毁命令快捷键绑定
    this.commandKeyBinding.destroy();
  }
}
