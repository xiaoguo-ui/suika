import { isWindows } from '@suika/common';

import { type SuikaEditor } from './editor';

export interface IKey {
  ctrlKey?: boolean; // 控制键
  shiftKey?: boolean; // 移位键
  altKey?: boolean; // 替代键
  metaKey?: boolean; // 元键
  /**
   * KeyboardEvent['code'] or '*'(match any key)
   */
  keyCode: string; // 键盘事件码
}

interface IWhenCtx {
  isToolDragging: boolean;
}

interface IKeyBinding {
  key: IKey | IKey[]; // 快捷键
  winKey?: IKey | IKey[]; // 快捷键
  when?: (ctx: IWhenCtx) => boolean; // 快捷键启动条件
  /**
   * action name (just for debug)
   */
  actionName: string;
  action: (e: KeyboardEvent) => void; // 触发的方法
}

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

/**
 * key binding manager
 *
 * reference: https://mp.weixin.qq.com/s/Rwnxh3f9rqMpz_ZQx5CM2Q
 */
export class KeyBindingManager {
  /**
   * 快捷键映射 id => keybinding
   */
  private keyBindingMap = new Map<number, IKeyBinding>();
  /**
   * 是否绑定状态
   */
  private isBound = false;
  /**
   * 快捷键ID
   */
  private id = 0;

  constructor(private editor: SuikaEditor) {}
  /**
   * 处理快捷键动作
   * @param e 键盘事件
   */
  private handleAction = (e: KeyboardEvent) => {
    // There are some default behaviors to prevent editor action
    // e.g. Windows press ALT will focus on browser menu bar, which make key press no effect
    // 如果按下了 ALT 键，则阻止默认行为
    if (e.altKey) {
      e.preventDefault();
    }
    // 如果按下了输入框或文本框，则阻止默认行为
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    // 检查是否匹配快捷键
    let isMatch = false;
    const ctx: IWhenCtx = {
      isToolDragging: this.editor.toolManager.isDragging(),
    };
    // 遍历快捷键映射
    for (const keyBinding of this.keyBindingMap.values()) {
      // match when
      // 检查快捷键启动条件
      if (!keyBinding.when || keyBinding.when(ctx)) {
        // match windows os
        // 检查是否匹配 Windows 操作系统
        if (isWindows() && keyBinding.winKey) {
          // 检查是否匹配 Windows 操作系统快捷键
          if (this.isKeyMatch(keyBinding.winKey, e)) {
            isMatch = true;
          }
        }
        // match other os
        // 检查是否匹配其他操作系统快捷键
        else if (this.isKeyMatch(keyBinding.key, e)) {
          isMatch = true;
        }
      }
      // 如果匹配，则阻止默认行为，并调用快捷键动作
      if (isMatch) {
        e.preventDefault();
        console.log(`[${getKeyStr(e)}] => ${keyBinding.actionName}`);
        // 调用快捷键动作
        keyBinding.action(e);
        break;
      }
    }
    // 如果未匹配，则打印日志
    if (!isMatch) {
      console.log(`[${getKeyStr(e)}] => no match`);
    }
  };
  /**
   * 检查是否匹配快捷键
   * @param key 快捷键
   * @param e 键盘事件
   * @returns 是否匹配
   */
  private isKeyMatch(key: IKey | IKey[], e: KeyboardEvent): boolean {
    // 如果快捷键是数组，则检查是否匹配数组中的快捷键
    if (Array.isArray(key)) {
      return key.some((k) => this.isKeyMatch(k, e));
    }

    if (key.keyCode == '*') return true;

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
  /**
   * 注册快捷键
   * @param keybinding 快捷键绑定
   * @returns 快捷键ID
   */
  register(keybinding: IKeyBinding) {
    const id = this.id;
    // 添加到映射中
    this.keyBindingMap.set(id, keybinding);
    // 递增ID
    this.id++;
    // 返回ID
    return id;
  }

  registerWithHighPrior(keybinding: IKeyBinding) {
    const id = this.id;

    const map = new Map<number, IKeyBinding>();
    map.set(id, keybinding);

    for (const [key, val] of this.keyBindingMap) {
      map.set(key, val);
    }
    this.keyBindingMap = map;
    this.id++;
    return id;
  }
  /**
   * 解除快捷键绑定
   * @param id 快捷键ID
   */
  unregister(id: number) {
    this.keyBindingMap.delete(id);
  }
  /**
   * 绑定事件
   */
  bindEvent() {
    // 如果已经绑定，则返回
    if (this.isBound) return;
    // 设置绑定状态
    this.isBound = true;
    // 监听鼠标按下事件
    document.addEventListener('keydown', this.handleAction);
  }
  /**
   * 销毁
   */
  destroy() {
    // 如果未绑定，则返回
    if (!this.isBound) return;
    // 清空快捷键映射
    this.keyBindingMap.clear();
    // 移除鼠标按下事件
    document.removeEventListener('keydown', this.handleAction);
  }
}
