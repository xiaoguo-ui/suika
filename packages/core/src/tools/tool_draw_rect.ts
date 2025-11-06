import { cloneDeep } from '@suika/common';
import { type IRect, normalizeRect } from '@suika/geo';

import { type SuikaEditor } from '../editor';
import {
  GraphicsObjectSuffix,
  type SuikaGraphics,
  SuikaRect,
} from '../graphics';
import { getNoConflictObjectName } from '../utils';
import { DrawGraphicsTool } from './tool_draw_graphics';
import { type ITool } from './type';

// 定义工具的唯一标识符，用于系统内部识别
const TYPE = 'drawRect';
// 声明快捷键为小写字母 'r'
const HOTKEY = 'r';
/**
 * 矩形工具类
 */
export class DrawRectTool extends DrawGraphicsTool implements ITool {
  static override readonly type = TYPE; // 矩形工具类型
  static override readonly hotkey = HOTKEY; // 矩形工具快捷键

  override readonly type = TYPE; // 矩形工具类型
  override readonly hotkey = HOTKEY; // 矩形工具快捷键

  constructor(editor: SuikaEditor) {
    super(editor);
    this.commandDesc = 'Add Rect'; // 设置命令描述为 "添加矩形"
  }

  protected override createGraphics(rect: IRect, parent: SuikaGraphics) {
    rect = normalizeRect(rect);
    const graphics = new SuikaRect(
      {
        objectName: getNoConflictObjectName(parent, GraphicsObjectSuffix.Rect),
        width: rect.width,
        height: rect.height,
        fill: [cloneDeep(this.editor.setting.get('firstFill'))],
      },
      {
        advancedAttrs: {
          x: rect.x,
          y: rect.y,
        },
        doc: this.editor.doc,
      },
    );
    return graphics;
  }
}
