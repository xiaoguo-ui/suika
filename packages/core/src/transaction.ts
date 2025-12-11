import { UpdateGraphicsAttrsCmd } from './commands';
import { type SuikaEditor } from './editor';
import { type GraphicsAttrs, type SuikaGraphics } from './graphics';
import { getParentIdSet, updateNodeSize } from './utils';

export class Transaction {
  // 记录图形对象修改前的原始属性状态
  private originAttrsMap = new Map<string, Partial<GraphicsAttrs>>();
  // 记录图形对象修改后的属性状态
  private updatedAttrsMap = new Map<string, Partial<GraphicsAttrs>>();
  // 记录被删除的图形对象的ID集合
  private removedIds = new Set<string>();
  // 记录新添加的图形对象的ID集合
  private newIds = new Set<string>();
  // 标记是否已经提交事务
  private isCommitDone = false;

  constructor(private editor: SuikaEditor) {}
  // 记录图形对象修改前的原始属性状态
  recordOld<ATTRS extends GraphicsAttrs>(id: string, attrs: Partial<ATTRS>) {
    this.originAttrsMap.set(id, attrs);
    return this;
  }
  // 记录图形对象修改后的属性状态
  update<ATTRS extends GraphicsAttrs>(id: string, attrs: Partial<ATTRS>) {
    this.updatedAttrsMap.set(id, attrs);
    return this;
  }
  // 记录被删除的图形对象的ID
  remove(id: string) {
    this.removedIds.add(id);
    return this;
  }
  // 记录新添加的图形对象的ID
  addNewIds(ids: string[]) {
    for (const id of ids) {
      this.newIds.add(id);
    }
    return this;
  }
  // 更新父级图形对象的尺寸
  updateParentSize(elements: SuikaGraphics[]) {
    updateNodeSize(
      this.editor,
      getParentIdSet(elements),
      this.originAttrsMap,
      this.updatedAttrsMap,
    );
    return this;
  }
  // 更新图形对象的尺寸
  updateNodeSize(idSet: Set<string>) {
    updateNodeSize(
      this.editor,
      idSet,
      this.originAttrsMap,
      this.updatedAttrsMap,
    );
    return this;
  }
  // 提交事务
  commit(desc: string) {
    if (this.isCommitDone) {
      console.error('It had committed before, can not commit again!');
      return;
    }

    // TODO: check duplicated id between removeIds and newIds
    this.editor.commandManager.pushCommand(
      new UpdateGraphicsAttrsCmd(
        desc,
        this.editor,
        this.originAttrsMap,
        this.updatedAttrsMap,
        this.removedIds,
        this.newIds,
      ),
    );

    this.isCommitDone = true;
  }
}
