import { EventEmitter, noop } from '@suika/common';
import { type IPoint } from '@suika/geo';

import { type SuikaEditor } from '../editor';
import { type IKey } from '../key_binding_manager';
import { DragCanvasTool } from './tool_drag_canvas';
import { DrawEllipseTool } from './tool_draw_ellipse';
import { DrawFrameTool } from './tool_draw_frame';
import { DrawImgTool } from './tool_draw_img';
import { DrawLineTool } from './tool_draw_line';
import { DrawPathTool } from './tool_draw_path';
import { DrawRectTool } from './tool_draw_rect';
import { DrawRegularPolygonTool } from './tool_draw_regular_polygon';
import { DrawStarTool } from './tool_draw_star';
import { DrawTextTool } from './tool_draw_text';
import { PathSelectTool } from './tool_path_select/tool_path_select';
import { PencilTool } from './tool_pencil';
import { SelectTool } from './tool_select';
import { type ITool, type IToolClassConstructor } from './type';

interface Events {
  switchTool(type: string): void;
  changeEnableTools(toolTypes: string[]): void;
}

/**
 * Tool Manager
 * reference: https://mp.weixin.qq.com/s/ZkZZoscN6N7_ykhC9rOpdQ
 */
export class ToolManager {
  /**
   * 工具构造函数映射
   * tool type(string) => tool class constructor
   */
  private toolCtorMap = new Map<string, IToolClassConstructor>();
  /**
   * hotkey => tool type
   * 快捷键 => 工具类型
   */
  private hotkeySet = new Set<string>();
  /**
   * 当前工具
   */
  private currentTool: ITool | null = null;
  /**
   * 事件发射器
   */
  private eventEmitter = new EventEmitter<Events>();
  /**
   * 标记是否启用工具切换
   */
  private enableSwitchTool = true;
  /**
   * 快捷键绑定token
   */
  private keyBindingToken: number[] = [];
  /**
   * 标记是否正在拖拽
   */
  private _isDragging = false;
  /**
   * 可使用的工具列表
   */
  private enableToolTypes: string[] = [];
  /**
   * 当前视口点
   */
  private currViewportPoint: IPoint = { x: Infinity, y: Infinity };
  /**
   * 解除事件绑定
   */
  _unbindEvent: () => void;

  constructor(private editor: SuikaEditor) {
    // 注册选择工具
    this.registerToolCtor(SelectTool);
    // 注册画板工具
    this.registerToolCtor(DrawFrameTool);
    // 注册矩形工具
    this.registerToolCtor(DrawRectTool);
    // 注册椭圆工具
    this.registerToolCtor(DrawEllipseTool);
    // 注册图片工具
    this.registerToolCtor(DrawImgTool);
    // 注册划线工具
    this.registerToolCtor(DrawLineTool);
    // 注册文本工具
    this.registerToolCtor(DrawTextTool);
    // 注册画板工具
    this.registerToolCtor(DragCanvasTool);
    // 注册路径选择工具
    this.registerToolCtor(PathSelectTool);
    // 注册划线工具
    this.registerToolCtor(DrawPathTool);
    // 注册多边形工具
    this.registerToolCtor(DrawRegularPolygonTool);
    // 注册星星工具
    this.registerToolCtor(DrawStarTool);
    // 注册铅笔工具
    this.registerToolCtor(PencilTool);
    // 设置可使用快捷键工具列表
    this.setEnableHotKeyTools([
      SelectTool.type, // 选择工具
      DrawFrameTool.type, // 画板工具
      DrawRectTool.type, // 矩形工具
      DrawEllipseTool.type, // 椭圆工具
      DrawImgTool.type, // 图片工具
      DrawPathTool.type, // 路径工具
      PencilTool.type, // 铅笔工具
      DrawLineTool.type, // 划线工具
      DrawRegularPolygonTool.type, // 多边形工具
      DrawStarTool.type, // 星星工具
      DrawTextTool.type, // 文本工具
      DragCanvasTool.type, // 画板工具
    ]);
    // 设置默认工具
    this.setActiveTool(SelectTool.type);
    // 绑定事件
    this._unbindEvent = this.bindEvent();
  }
  /**
   * 解除快捷键绑定
   */
  private unbindHotkey() {
    // 解除快捷键绑定
    this.keyBindingToken.forEach((token) => {
      this.editor.keybindingManager.unregister(token);
    });
    // 清空快捷键绑定token
    this.keyBindingToken = [];
  }
  /**
   * 设置可使用快捷键工具列表
   * @param toolTypes 工具类型列表
   */
  public setEnableHotKeyTools(toolTypes: string[]) {
    this.enableToolTypes = toolTypes;
    this.eventEmitter.emit('changeEnableTools', [...toolTypes]);
  }
  /**
   * 获取可使用工具列表
   * @returns
   */
  public getEnableTools() {
    return [...this.enableToolTypes];
  }

  /**
   * 注册工具构造函数
   * @param toolCtor 工具构造函数
   */
  private registerToolCtor(toolCtor: IToolClassConstructor) {
    // 获取工具类型
    const type = toolCtor.type;
    // 如果工具类型已存在，则替换它
    if (this.toolCtorMap.has(type)) {
      console.warn(`tool "${type}" had exit, replace it!`);
    }
    // 保存工具构造函数
    this.toolCtorMap.set(type, toolCtor);

    // select and pathSelect tool has same hotkey
    // 选择和路径选择工具有相同的快捷键
    const hotkey = toolCtor.hotkey;
    // 设置快捷键对象
    let keyCode = '';
    let hotkeyObj: IKey;
    // 如果工具没有快捷键，则跳过
    if (!hotkey) {
      console.log(`${type} has no hotkey`);
      return;
    }
    // 单字母快捷键，转换为keyCode
    if (typeof hotkey === 'string') {
      // 转换为keyCode
      keyCode = `Key${hotkey.toUpperCase()}`;
      // 设置快捷键对象
      hotkeyObj = { keyCode: keyCode };
    } else {
      // support complex hotkey
      // 支持复杂快捷键
      // 生成了什么样的快捷键？
      // ctrl+shift+p
      keyCode = `${hotkey.altKey ? 'alt+' : ''}${
        hotkey.ctrlKey ? 'ctrl+' : ''
      }${hotkey.shiftKey ? 'shift+' : ''}${hotkey.metaKey ? 'meta+' : ''}${
        hotkey.keyCode
      }`;
      // 设置快捷键对象
      hotkeyObj = hotkey;
    }
    // 如果快捷键已存在，则打印警告
    if (this.hotkeySet.has(keyCode)) {
      console.log(`register same hotkey: "${keyCode}"`);
    }
    // 添加快捷键到集合中
    this.hotkeySet.add(keyCode);
    // 注册快捷键.token为快捷键的ID
    const token = this.editor.keybindingManager.register({
      key: hotkeyObj,
      actionName: type,
      when: () => this.enableToolTypes.includes(type),
      action: () => {
        this.setActiveTool(type);
      },
    });
    // 添加快捷键绑定token
    this.keyBindingToken.push(token);
  }
  /**
   * 获取当前工具名称
   * @returns 当前工具名称
   */
  getActiveToolName() {
    return this.currentTool?.type;
  }
  /**
   * bind event
   * about dragBlockStep: https://mp.weixin.qq.com/s/05lbcYIJ8qwP8EHCXzgnqA
   */
  /**
   * 绑定事件
   */
  private bindEvent() {
    /**
     * 标记鼠标当前是否处于按下状态
     */
    let isPressing = false;
    /**
     * 记录鼠标按下时的起始位置
     */
    let startPos: IPoint = { x: 0, y: 0 };
    /**
     * 标记是否通过左键开始的操作
     */
    let startWithLeftMouse = false;

    /**
     * 处理鼠标按下事件
     * @param e 鼠标事件
     */
    const handleDown = (e: PointerEvent) => {
      setTimeout(() => {
        // 重置回默认状态
        isPressing = false;
        // 重置拖拽状态
        this._isDragging = false;
        // 重置左键标记
        startWithLeftMouse = false;
        // 检查是否为左键按下
        if (
          e.button !== 0 || // is not left mouse
          this.editor.textEditor.isActive() || // is editing text mode 文本编辑模式
          this.editor.hostEventManager.isSpacePressing // is dragging canvas mode 拖拽画布模式
        ) {
          return;
        }
        // 设置按下状态
        isPressing = true;
        // 设置左键标记
        startWithLeftMouse = true;
        // 检查是否设置了当前工具
        if (!this.currentTool) {
          throw new Error('there is no active tool');
        }
        // 记录鼠标按下时的起始位置
        startPos = { x: e.clientX, y: e.clientY };
        // 调用当前工具的 onStart 方法
        this.currentTool.onStart(e);
      });
    };
    /**
     * 处理鼠标移动事件
     * @param e 鼠标事件
     */
    const handleMove = (e: PointerEvent) => {
      // 记录当前视口点
      this.currViewportPoint = this.editor.getCursorXY(e);
      // 检查是否设置了当前工具
      if (!this.currentTool) {
        throw new Error('未设置当前使用工具');
      }
      // 是按下的状态
      if (isPressing) {
        // 检查是否通过左键开始的操作
        if (!startWithLeftMouse) {
          return;
        }
        // 计算鼠标移动距离
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        // TODO：获取拖拽阈值
        // 优先使用工具自己的拖拽阈值
        // 如果没有则使用编辑器的全局设置
        const dragBlockStep =
          this.currentTool.getDragBlockStep?.() ??
          this.editor.setting.get('dragBlockStep');
        // 检查是否达到拖拽阈值
        if (
          !this._isDragging &&
          (Math.abs(dx) > dragBlockStep || Math.abs(dy) > dragBlockStep)
        ) {
          // 设置拖拽状态
          this._isDragging = true;
        }
        // 正在拖拽
        if (this._isDragging) {
          // 禁用工具切换
          this.enableSwitchTool = false;
          // 禁用画布拖拽
          this.editor.canvasDragger.disableDragBySpace();
          // 调用当前工具的 onDrag 方法
          this.currentTool.onDrag(e);
        }
      } else {
        // 检查是否在画布外部
        const isOutsideCanvas = this.editor.canvasElement !== e.target;
        // 调用当前工具的 onMoveExcludeDrag 方法
        this.currentTool.onMoveExcludeDrag(e, isOutsideCanvas);
      }
    };
    /**
     * 处理鼠标释放事件
     * @param e 鼠标事件
     */
    const handleUp = (e: PointerEvent) => {
      // 启用工具切换
      this.enableSwitchTool = true;
      // 检查是否通过左键开始的操作
      if (!startWithLeftMouse) {
        return;
      }
      // 检查是否设置了当前工具
      if (!this.currentTool) {
        throw new Error('未设置当前使用工具');
      }
      // 检查是否是按下的状态
      if (isPressing) {
        // 启用画布拖拽
        this.editor.canvasDragger.enableDragBySpace();
        // 设置按下状态
        isPressing = false;
        // 调用当前工具的 onEnd 方法
        this.currentTool.onEnd(e, this._isDragging);
        // 调用当前工具的 afterEnd 方法
        this.currentTool.afterEnd(e, this._isDragging);
      }
      // 重置拖拽状态
      this._isDragging = false;
    };
    /**
     * 处理命令改变事件
     */
    const handleCommandChange = () => {
      this.currentTool?.onCommandChange?.();
    };
    /**
     * 处理空格键切换事件
     * @param isSpacePressing 是否按下空格键
     */
    const handleSpaceToggle = (isSpacePressing: boolean) => {
      this.currentTool?.onSpaceToggle?.(isSpacePressing);
    };
    /**
     * 处理 shift 键切换事件
     * @param isShiftPressing 是否按下 shift 键
     */
    const handleShiftToggle = (isShiftPressing: boolean) => {
      this.currentTool?.onShiftToggle?.(isShiftPressing);
    };
    /**
     * 处理 alt 键切换事件
     * @param isAltPressing 是否按下 alt 键
     */
    const handleAltToggle = (isAltPressing: boolean) => {
      this.currentTool?.onAltToggle?.(isAltPressing);
    };
    /**
     * 处理视口 x 或 y 改变事件
     * @param x 视口 x 坐标
     * @param y 视口 y 坐标
     */
    const handleViewportXOrYChange = (x: number, y: number) => {
      this.currentTool?.onViewportXOrYChange?.(x, y);
    };
    /**
     * 处理画布拖拽激活改变事件
     * @param active 是否激活
     */
    const handleCanvasDragActiveChange = (active: boolean) => {
      this.currentTool?.onCanvasDragActiveChange?.(active);
    };
    const canvas = this.editor.canvasElement;
    /**
     * 绑定鼠标按下事件
     */
    canvas.addEventListener('pointerdown', handleDown);
    /**
     * 绑定鼠标移动事件
     */
    window.addEventListener('pointermove', handleMove);
    /**
     * 绑定鼠标释放事件
     */
    window.addEventListener('pointerup', handleUp);
    /**
     * 绑定命令改变事件
     */
    this.editor.commandManager.on('change', handleCommandChange);
    /**
     * 绑定空格键切换事件
     */
    this.editor.hostEventManager.on('spaceToggle', handleSpaceToggle);
    /**
     * 绑定 shift 键切换事件
     */
    this.editor.hostEventManager.on('shiftToggle', handleShiftToggle);
    /**
     * 绑定 alt 键切换事件
     */
    this.editor.hostEventManager.on('altToggle', handleAltToggle);
    /**
     * 绑定视口 x 或 y 改变事件
     */
    this.editor.viewportManager.on('xOrYChange', handleViewportXOrYChange);
    /**
     * 绑定画布拖拽激活改变事件
     */
    this.editor.canvasDragger.on('activeChange', handleCanvasDragActiveChange);

    return () => {
      /**
       * 解除鼠标按下事件
       */
      canvas.removeEventListener('pointerdown', handleDown);
      /**
       * 解除鼠标移动事件
       */
      window.removeEventListener('pointermove', handleMove);
      /**
       * 解除鼠标释放事件
       */
      window.removeEventListener('pointerup', handleUp);
      /**
       * 解除命令改变事件
       */
      this.editor.commandManager.off('change', handleCommandChange);
      /**
       * 解除空格键切换事件
       */
      this.editor.hostEventManager.off('spaceToggle', handleSpaceToggle);
      /**
       * 解除 shift 键切换事件
       */
      this.editor.hostEventManager.off('shiftToggle', handleShiftToggle);
      /**
       * 解除 alt 键切换事件
       */
      this.editor.hostEventManager.off('altToggle', handleAltToggle);
      /**
       * 解除 alt 键切换事件
       */
      this.editor.hostEventManager.off('altToggle', handleAltToggle);
      /**
       * 解除视口 x 或 y 改变事件
       */
      this.editor.viewportManager.off('xOrYChange', handleViewportXOrYChange);
      /**
       * 解除画布拖拽激活改变事件
       */
      this.editor.canvasDragger.off(
        'activeChange',
        handleCanvasDragActiveChange,
      );
    };
  }
  /**
   * 解除事件绑定
   */
  unbindEvent() {
    // 解除事件绑定
    this._unbindEvent();
    // 重置事件绑定
    this._unbindEvent = noop;
    // 解除快捷键绑定
    this.unbindHotkey();
  }
  /**
   * 设置当前工具
   * @param toolName 工具名称
   */
  async setActiveTool(toolName: string) {
    // 检查是否启用工具切换
    if (!this.enableSwitchTool || this.getActiveToolName() === toolName) {
      return;
    }
    // 检查工具是否启用
    if (!this.enableToolTypes.includes(toolName)) {
      console.warn(`target tool "${toolName}" is not enable`);
      return;
    }
    // 获取工具构造函数
    const currentToolCtor = this.toolCtorMap.get(toolName) || null;
    // 检查工具构造函数是否存在
    if (!currentToolCtor) {
      throw new Error(`tool "${toolName}" is not registered`);
    }
    // 创建工具实例
    const currentTool = new currentToolCtor(this.editor);
    // 检查工具是否激活
    if (currentTool.enableActive) {
      // 启用工具
      const canActive = await currentTool.enableActive();
      if (!canActive) {
        return;
      }
    }
    // 设置前一个工具
    const prevTool = this.currentTool;
    // 设置当前工具
    this.currentTool = currentTool;
    // 调用前一个工具的 onInactive 方法
    prevTool && prevTool.onInactive();
    // 设置光标
    this.setCursorWhenActive();
    // 调用当前工具的 onActive 方法
    currentTool.onActive();
    // 发射工具切换事件
    this.eventEmitter.emit('switchTool', currentTool.type);
  }
  on<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.on(eventName, handler);
  }
  off<K extends keyof Events>(eventName: K, handler: Events[K]) {
    this.eventEmitter.off(eventName, handler);
  }
  /**
   * 销毁工具
   */
  destroy() {
    this.currentTool?.onInactive();
  }
  /**
   * 设置光标
   */
  setCursorWhenActive() {
    // 检查当前工具是否存在
    if (this.currentTool) {
      this.editor.cursorManager.setCursor(this.currentTool.cursor);
    }
  }
  /**
   * 检查是否正在拖拽
   * @returns 是否正在拖拽
   */
  isDragging() {
    return this._isDragging;
  }

  getCurrPoint() {
    return this.editor.toScenePt(
      this.currViewportPoint.x,
      this.currViewportPoint.y,
    );
  }
}
