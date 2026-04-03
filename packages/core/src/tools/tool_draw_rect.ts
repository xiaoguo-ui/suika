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

const TYPE = 'drawRect';
const HOTKEY = 'r';

export class DrawRectTool extends DrawGraphicsTool implements ITool {
  static override readonly type = TYPE;
  static override readonly hotkey = HOTKEY;
  override readonly type = TYPE;
  override readonly hotkey = HOTKEY;

  constructor(editor: SuikaEditor) {
    super(editor);
    this.commandDesc = 'Add Rect';
  }

  // 矩形工具与其他绘制工具的唯一区别：创建 SuikaRect 实例
  protected override createGraphics(rect: IRect, parent: SuikaGraphics) {
    // [规则1] normalizeRect 处理反向拖拽产生的负宽高
    rect = normalizeRect(rect);
    const graphics = new SuikaRect(
      {
        // [规则6] 自动命名：同层级内不冲突（Rectangle 1, 2, 3...）
        objectName: getNoConflictObjectName(parent, GraphicsObjectSuffix.Rect),
        width: rect.width,
        height: rect.height,
        // [规则5] 默认灰色填充(217,217,217)，cloneDeep 防止多个矩形共享颜色对象
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
