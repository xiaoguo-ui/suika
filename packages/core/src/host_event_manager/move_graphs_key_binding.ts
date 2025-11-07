import { cloneDeep, debounce, noop } from '@suika/common';

import { type SuikaEditor } from '../editor';
import { SuikaGraphics } from '../graphics';
import { Transaction } from '../transaction';

/**
 * move graphs by arrow key binding
 */
export class MoveGraphsKeyBinding {
  private unbindHandler = noop;
  /**
   * 是否已经绑定
   */
  private hadBound = false;
  /**
   * 事务
   */
  private transaction: Transaction;

  constructor(private editor: SuikaEditor) {
    this.transaction = new Transaction(editor);
  }
  /**
   * 绑定方向键移动快捷键
   */
  bindKey() {
    // 如果已经绑定，则打印警告并返回
    if (this.hadBound) {
      console.warn(
        'MoveGraphsKeyBinding had already bound, please unbind first',
      );
      return;
    }
    // 设置已经绑定
    this.hadBound = true;
    // 获取编辑器实例
    const editor = this.editor;
    // 是否需要记录原始属性
    let needRecordOriginAttrs = true;

    const recordDebounce = debounce((movedGraphicsArr: SuikaGraphics[]) => {
      // 显示自定义手柄
      this.editor.controlHandleManager.showCustomHandles();
      // 设置需要记录原始属性为 true
      needRecordOriginAttrs = true;

      // 更新图形属性
      for (const graphics of movedGraphicsArr) {
        // 更新图形属性
        this.transaction.update(graphics.attrs.id, {
          transform: cloneDeep(graphics.attrs.transform),
        });
      }

      // 启用撤销/重做
      this.editor.commandManager.enableRedoUndo();
      // 提交事务，记录移动图形的历史
      this.transaction.commit('Move elements by direction key');
      this.transaction = new Transaction(editor);
    }, editor.setting.get('moveElementsDelay'));

    /**
     *
     */
    const flushRecordDebounce = () => {
      recordDebounce.flush();
    };
    // 是否按下方向键的记录
    const pressed = {
      ArrowLeft: false, // 是否按下左方向键
      ArrowRight: false, // 是否按下右方向键
      ArrowUp: false, // 是否按上方向键
      ArrowDown: false, // 是否按下下方向键
    };
    // 检查是否按下方向键
    const checkPressed = () =>
      pressed.ArrowLeft ||
      pressed.ArrowRight ||
      pressed.ArrowUp ||
      pressed.ArrowDown;

    /**
     * 按键按下时触发
     * @param event 键盘事件
     * @returns
     */
    const handleKeydown = (event: KeyboardEvent) => {
      // 获取选中的图形
      const movedGraphicsArr = editor.selectedElements.getItems();
      // 如果选中的图形为空，则返回
      if (movedGraphicsArr.length === 0) return;

      // 如果按键在 pressed 中，则设置为 true
      if (event.key in pressed) {
        // 设置为 true
        pressed[event.key as keyof typeof pressed] = true;
      }
      // 如果未按下方向键，则返回
      if (!checkPressed()) return;

      // 如果需要记录原始属性，则记录原始属性
      if (needRecordOriginAttrs) {
        // 记录原始属性
        for (const graphics of movedGraphicsArr) {
          // 记录原始属性
          this.transaction.recordOld(graphics.attrs.id, {
            transform: cloneDeep(graphics.attrs.transform),
          });
        }
        // 设置需要记录原始属性为 false
        needRecordOriginAttrs = false;
      }

      // 获取微调值
      let nudge = editor.setting.get('smallNudge');
      // 如果按下 shift 键，则设置为大微调值
      if (event.shiftKey) nudge = editor.setting.get('bigNudge');

      // 如果按下左方向键，则移动图形
      if (pressed.ArrowLeft) {
        // 移动图形
        SuikaGraphics.dMove(movedGraphicsArr, -nudge, 0);
      }
      // 如果按下右方向键，则移动图形
      if (pressed.ArrowRight) {
        // 移动图形
        SuikaGraphics.dMove(movedGraphicsArr, nudge, 0);
      }
      // 如果按上方向键，则移动图形
      if (pressed.ArrowUp) {
        // 移动图形
        SuikaGraphics.dMove(movedGraphicsArr, 0, -nudge);
      }
      // 如果按下下方向键，则移动图形
      if (pressed.ArrowDown) {
        // 移动图形
        SuikaGraphics.dMove(movedGraphicsArr, 0, nudge);
      }

      // 更新父级大小
      this.transaction.updateParentSize(movedGraphicsArr);

      // 禁用撤销/重做
      this.editor.commandManager.disableRedoUndo();
      // 隐藏自定义手柄
      this.editor.controlHandleManager.hideCustomHandles();
      // 记录移动图形的历史
      recordDebounce(movedGraphicsArr);
      // 渲染编辑器
      editor.render();
    };
    /**
     * 鼠标松开时触发
     * @param e 键盘事件
     */
    const handleKeyup = (e: KeyboardEvent) => {
      // 获取按键
      const key = e.key;
      // 如果按键在 pressed 中，则设置为 false
      if (key in pressed) {
        // 设置为 false
        pressed[key as keyof typeof pressed] = false;
      }
    }; // 按键释放时触发

    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

    // 注册快捷键
    this.editor.keybindingManager.register({
      key: [
        ...keys.map((keyCode) => ({ keyCode })),
        ...keys.map((keyCode) => ({ shiftKey: true, keyCode })),
      ],
      actionName: 'Move Elements',
      action: handleKeydown,
    });
    // 鼠标松开时触发
    window.addEventListener('keyup', handleKeyup);
    // 执行命令前触发
    editor.commandManager.on('beforeExecCmd', flushRecordDebounce);
    // 解除绑定

    this.unbindHandler = () => {
      window.removeEventListener('keyup', handleKeyup);
      editor.commandManager.off('beforeExecCmd', flushRecordDebounce);
    };
  }

  destroy() {
    this.unbindHandler();
    this.hadBound = false;
  }
}
