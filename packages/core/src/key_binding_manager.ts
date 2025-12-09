import { isWindows } from '@suika/common';

import { type SuikaEditor } from './editor';

// 快捷键
export interface IKey {
  ctrlKey?: boolean; // 控制键
  shiftKey?: boolean; // 移位键
  altKey?: boolean; // 替代键
  metaKey?: boolean; // 元键
  keyCode: string; // 键盘事件码
}

// 快捷键启动条件
interface IWhenCtx {
  isToolDragging: boolean; // 工具是否正在拖拽
}

// 快捷键绑定
interface IKeyBinding {
  key: IKey | IKey[]; // 快捷键(Mac系统)
  winKey?: IKey | IKey[]; // 快捷键(Windows系统)
  when?: (ctx: IWhenCtx) => boolean; // 快捷键启动条件
  /**
   * action name (just for debug)
   */
  actionName: string;
  action: (e: KeyboardEvent) => void; // 触发的方法
}

// 获取快捷键字符串
const getKeyStr = (e: KeyboardEvent) => {
  const {
    ctrlKey = false,
    shiftKey = false,
    altKey = false,
    metaKey = false,
  } = e;

  return `${ctrlKey ? 'ctrl+' : ''}${metaKey ? 'meta+' : ''}${
    shiftKey ? 'shift+' : ''
  }${altKey ? 'alt+' : ''}${e.code}`;
};

// 快捷键管理器
export class KeyBindingManager {
  // 快捷键映射 id => keybinding
  private keyBindingMap = new Map<number, IKeyBinding>();
  // 是否绑定状态
  private isBound = false;
  // 快捷键ID
  private id = 0;

  constructor(private editor: SuikaEditor) {}
  // 处理快捷键动作的处理器
  private handleAction = (e: KeyboardEvent) => {
    // 为了防止浏览器的默认行为干扰编辑器的快捷键功能。
    // 在 Windows 系统中，按下 ALT 键会自动聚焦到浏览器的菜单栏，这会导致后续的键盘快捷键组合失效
    if (e.altKey) e.preventDefault();
    // 当用户在输入框或文本框中输入文字时，应该使用标准的文本编辑快捷键，不应该被编辑器的全局快捷键干扰
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    // 检查是否匹配快捷键
    let isMatch = false;
    // 检查快捷键启动条件,工具是否正在拖拽
    const ctx: IWhenCtx = {
      isToolDragging: this.editor.toolManager.isDragging(),
    };
    // 遍历快捷键映射
    for (const keyBinding of this.keyBindingMap.values()) {
      // 检查快捷键启动条件
      if (!keyBinding.when || keyBinding.when(ctx)) {
        // 检查是否匹配 Windows 操作系统快捷键
        if (isWindows() && keyBinding.winKey) {
          // 检查是否匹配 Windows 操作系统快捷键
          if (this.isKeyMatch(keyBinding.winKey, e)) {
            isMatch = true;
          }
        }
        // 检查是否匹配其他操作系统快捷键
        else if (this.isKeyMatch(keyBinding.key, e)) {
          isMatch = true;
        }
      }
      // 如果匹配，则阻止默认行为，并调用快捷键动作
      if (isMatch) {
        // 阻止默认行为
        e.preventDefault();
        // 打印日志
        console.log(`[${getKeyStr(e)}] => ${keyBinding.actionName}`);
        // 调用快捷键触发绑定的回调函数
        keyBinding.action(e);
        break;
      }
    }
    // 如果未匹配，则打印日志
    if (!isMatch) {
      console.log(`[${getKeyStr(e)}] => no match`);
    }
  };
  // 检查是否匹配快捷键
  private isKeyMatch(key: IKey | IKey[], e: KeyboardEvent): boolean {
    // 如果快捷键是数组，则检查是否匹配数组中的快捷键
    if (Array.isArray(key)) {
      return key.some((k) => this.isKeyMatch(k, e));
    }
    // 如果快捷键是*，则匹配任何键
    if (key.keyCode == '*') return true;

    // 检查是否匹配快捷键
    const {
      ctrlKey = false,
      shiftKey = false,
      altKey = false,
      metaKey = false,
    } = key;

    return (
      ctrlKey == e.ctrlKey &&
      shiftKey == e.shiftKey &&
      altKey == e.altKey &&
      metaKey == e.metaKey &&
      key.keyCode == e.code
    );
  }
  // 注册快捷键
  register(keybinding: IKeyBinding) {
    const id = this.id;
    // 添加到映射中
    this.keyBindingMap.set(id, keybinding);
    // 递增ID
    this.id++;
    // 返回ID
    return id;
  }
  // 注册快捷键，并设置优先级
  registerWithHighPrior(keybinding: IKeyBinding) {
    const id = this.id;
    // 创建新的快捷键映射
    const map = new Map<number, IKeyBinding>();
    map.set(id, keybinding);

    // 添加现有的快捷键映射
    for (const [key, val] of this.keyBindingMap) {
      map.set(key, val); // 设置现有的快捷键映射
    }
    this.keyBindingMap = map;
    this.id++;
    return id;
  }
  // 解除快捷键绑定
  unregister(id: number) {
    this.keyBindingMap.delete(id);
  }
  // 绑定事件
  bindEvent() {
    // 如果已经绑定，则返回
    if (this.isBound) return;
    // 设置绑定状态
    this.isBound = true;
    // 监听鼠标按下事件
    document.addEventListener('keydown', this.handleAction);
  }
  // 销毁快捷键绑定
  destroy() {
    // 如果未绑定，则返回
    if (!this.isBound) return;
    // 清空快捷键映射
    this.keyBindingMap.clear();
    // 移除鼠标按下事件
    document.removeEventListener('keydown', this.handleAction);
  }
}
