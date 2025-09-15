import { type SuikaEditor } from '../editor';

/**
 * 导入服务
 */
export const importService = {
  /**
   * 导入本地文件
   * @param editor
   */
  importOriginFile: (editor: SuikaEditor) => {
    readTextFile('.suika', (content) => {
      // 设置编辑器内容
      editor.setContents(JSON.parse(content));
    });
  },
};

/**
 * 读取文本文件
 * @param accept 文件类型
 * @param callback 回调函数,参数为文件内容
 */
function readTextFile(
  accept: string,
  callback: (contents: string) => void,
): void {
  // 创建输入元素
  const input = document.createElement('input');
  // 设置类型为文件
  input.type = 'file';
  // 设置文件类型
  input.accept = accept;
  // 设置样式为隐藏
  input.style.display = 'none';

  // 监听输入元素的change事件
  input.addEventListener('change', function (event) {
    // 获取文件
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    // 创建文件读取器
    const reader = new FileReader();

    // 监听文件读取器的load事件
    reader.onload = function (e) {
      // 获取文件内容
      const contents = e.target?.result as string;
      if (contents) {
        callback(contents);
      }
    };
    // 读取文件
    reader.readAsText(file);
  });
  input.click();
}
