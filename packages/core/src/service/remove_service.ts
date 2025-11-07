import { UpdateGraphicsAttrsCmd } from '../commands';
import { type SuikaEditor } from '../editor';
import {
  type GraphicsAttrs,
  type SuikaFrame,
  type SuikaGraphics,
} from '../graphics';
import { getChildNodeSet, getParentIdSet, updateNodeSize } from '../utils';

/**
 * 从场景中移除图形并记录
 * @param editor 编辑器
 * @param graphicsArray 图形数组
 */
export const removeGraphicsAndRecord = (
  editor: SuikaEditor,
  graphicsArray: SuikaGraphics[],
) => {
  // 需要移除的图形ID集合
  const removeIdSet = new Set<string>();
  // 遍历图形数组
  for (const graphics of graphicsArray) {
    graphics.removeFromParent();
    graphics.setDeleted(true);
    removeIdSet.add(graphics.attrs.id);
  }

  const parentIdSet = getParentIdSet(graphicsArray);

  // remove empty group
  for (const id of parentIdSet) {
    const parent = editor.doc.getGraphicsById(id) as SuikaFrame;
    if (parent.isEmpty()) {
      parent.removeFromParent();
      parent.setDeleted(true);
      removeIdSet.add(id);
    }
  }

  const childNodeSet = getChildNodeSet(graphicsArray);
  for (const child of childNodeSet) {
    // 标记为删除
    child.setDeleted(true);
    removeIdSet.add(child.attrs.id);
  }

  const originAttrsMap = new Map<string, Partial<GraphicsAttrs>>();
  const updatedAttrsMap = new Map<string, Partial<GraphicsAttrs>>();

  updateNodeSize(editor, parentIdSet, originAttrsMap, updatedAttrsMap);

  editor.commandManager.pushCommand(
    new UpdateGraphicsAttrsCmd(
      'remove graphics',
      editor,
      originAttrsMap,
      updatedAttrsMap,
      removeIdSet,
    ),
  );
};
