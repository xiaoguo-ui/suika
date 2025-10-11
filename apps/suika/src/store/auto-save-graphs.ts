import { debounce } from '@suika/common';
import { type IEditorPaperData, type SuikaEditor } from '@suika/core';

const STORE_KEY = 'suika-paper';

export class AutoSaveGraphics {
  constructor(private editor: SuikaEditor) {
    // 加载本地的图纸数据
    const data = this.load();
    if (data) {
      // 版本不一致
      if (data.appVersion !== editor.appVersion) {
        if (
          confirm(
            '编辑器版本和图纸版本不兼容，将清空本地缓存 (version not match, to clear data)',
          )
        ) {
          // 清空本地缓存
          this.clear();
        }
      } else {
        // 设置编辑器内容
        editor.setContents(data);
      }
    }
    // 自动保存
    this.autoSave();
    // 监听编辑器销毁
    this.editor.on('destroy', () => this.stopAutoSave());
  }

  /**
   * 监听编辑器变化
   */
  private listener = debounce(() => {
    // 保存
    this.save();
  }, 10);

  /**
   * 自动保存
   */
  autoSave() {
    // 监听编辑器变化
    this.editor.commandManager.on('change', this.listener);
  }
  /**
   * 停止自动保存
   */
  stopAutoSave() {
    this.editor.commandManager.off('change', this.listener);
  }

  /**
   * 保存
   */
  save() {
    localStorage.setItem(STORE_KEY, this.editor.sceneGraph.toJSON());
  }
  /**
   * 清空本地缓存
   */
  clear() {
    localStorage.removeItem(STORE_KEY);
  }
  /**
   * 加载图纸数据
   * @returns 图纸数据
   */
  load() {
    // 获取localStorage中的数据
    const dataStr = localStorage.getItem(STORE_KEY);
    if (!dataStr) return null;
    // 转换数据
    const data = JSON.parse(dataStr) as IEditorPaperData;
    return data;
  }
}
