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
  isShiftPressing = false; // 是否按下 shift 键
  isCtrlPressing = false; // 是否按下 ctrl 键
  isAltPressing = false; // 是否按下 alt 键
  isCommandPressing = false; // 是否按下 command 键
  isSpacePressing = false; // 是否按下 space 键
  isWheelBtnPressing = false; // 是否按下滚轮键

  isDraggingCanvasBySpace = false; // 是否按下 space 键拖拽画布
  isEnableDelete = true; // 是否启用删除
  isEnableContextMenu = true; // 是否启用右键菜单
  // isEnableMoveSelectedElementByKey = true; // no use now

  private moveGraphsKeyBinding: MoveGraphsKeyBinding;
  private commandKeyBinding: CommandKeyBinding;

  private eventEmitter = new EventEmitter<Events>();
  private unbindHandlers: Array<() => void> = [];

  constructor(private editor: SuikaEditor) {
    // 绑定方向键移动快捷键
    this.moveGraphsKeyBinding = new MoveGraphsKeyBinding(editor);
    // 绑定命令快捷键
    this.commandKeyBinding = new CommandKeyBinding(editor);
  }
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
  /**
   * 监听 shift、alt、space 键的按下和释放事件
   */
  private observeModifiersToggle() {
    /**
     * 监听 shift、alt、space 键的按下和释放事件
     * @param event 键盘事件
     */
    const handler = (event: KeyboardEvent) => {
      // 记录按下前的状态
      const prevShift = this.isShiftPressing;
      const prevAlt = this.isAltPressing;
      const prevSpace = this.isSpacePressing;

      // 记录当前状态
      this.isShiftPressing = event.shiftKey;
      this.isCtrlPressing = event.ctrlKey;
      this.isAltPressing = event.altKey;
      this.isCommandPressing = event.metaKey;
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

  /**
   * shiftToggle 会在切换时触发。按住 shift 不放，只会触发一次
   */
  on<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.on(eventName, handler);
  }
  off<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.off(eventName, handler);
  }

  /**
   * bind wheel event, to zoom or move canvas
   */
  private bindWheelEvent() {
    const editor = this.editor;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const point = this.editor.getCursorXY(event);
        let isZoomOut = event.deltaY > 0;
        if (this.editor.setting.get('invertZoomDirection')) {
          isZoomOut = !isZoomOut;
        }
        if (isZoomOut) {
          editor.zoomManager.zoomOut({
            center: point,
            deltaY: event.deltaY,
          });
        } else {
          editor.zoomManager.zoomIn({
            center: point,
            deltaY: event.deltaY,
          });
        }
        editor.render();
      } else {
        if (
          this.editor.canvasDragger.isActive() &&
          this.editor.canvasDragger.isPressing()
        ) {
          return;
        }
        const zoom = editor.zoomManager.getZoom();
        editor.viewportManager.translate(
          event.deltaX / zoom,
          event.deltaY / zoom,
        );
        editor.render();
      }
    };

    // prevent default scale page action in win
    const preventDefaultScalePage = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    editor.canvasElement.addEventListener('wheel', onWheel);
    window.addEventListener('wheel', preventDefaultScalePage, {
      passive: false,
    });
    this.unbindHandlers.push(() => {
      editor.canvasElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('wheel', preventDefaultScalePage);
    });
  }

  private bindContextMenu() {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      if (this.isEnableContextMenu) {
        this.eventEmitter.emit('contextmenu', { x: e.clientX, y: e.clientY });
      }
    };
    this.editor.canvasElement.addEventListener('contextmenu', handler);
    this.unbindHandlers.push(() => {
      this.editor.canvasElement.removeEventListener('contextmenu', handler);
    });
  }

  enableDelete() {
    this.isEnableDelete = true;
  }
  disableDelete() {
    this.isEnableDelete = false;
  }
  enableContextmenu() {
    this.isEnableContextMenu = true;
  }
  disableContextmenu() {
    this.isEnableContextMenu = false;
  }
  destroy() {
    this.unbindHandlers.forEach((fn) => fn());
    this.unbindHandlers = [];
    this.moveGraphsKeyBinding.destroy();
    this.commandKeyBinding.destroy();
  }
}
