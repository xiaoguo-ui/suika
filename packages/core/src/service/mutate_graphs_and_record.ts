import { cloneDeep } from '@suika/common';

import { SetGraphsAttrsCmd } from '../commands/set_elements_attrs';
import { type SuikaEditor } from '../editor';
import {
  type SuikaGraphics,
  type SuikaRect,
  type SuikaRegularPolygon,
  type SuikaStar,
} from '../graphics';
import { Transaction } from '../transaction';
import { GraphicsType } from '../type';

// 修改图形的属性并记录到历史记录
export const MutateGraphsAndRecord = {
  // 设置图形对象X坐标的功能，并记录历史操作到事务中
  setX(editor: SuikaEditor, graphicsArr: SuikaGraphics[], val: number) {
    if (graphicsArr.length === 0) return;
    // 创建事务，记录操作前后的状态变化
    const transaction = new Transaction(editor);

    for (const graphics of graphicsArr) {
      // 记录操作前的状态
      transaction.recordOld(graphics.attrs.id, {
        transform: cloneDeep(graphics.attrs.transform),
      });
      // 获取图形的世界变换矩阵
      const tf = graphics.getWorldTransform();
      // 修改矩阵中的第4个元素（对应X轴平移分量）
      tf[4] = val;
      // 设置图形的世界变换矩阵
      graphics.setWorldTransform(tf);
      // 记录修改后的变换矩阵状态
      transaction.update(graphics.attrs.id, {
        transform: cloneDeep(graphics.attrs.transform),
      });
    }
    // 自动更新所有父级容器的尺寸，以适应子元素位置的变化
    transaction.updateParentSize(graphicsArr);
    // 提交事务，记录操作历史
    transaction.commit('Update X of Elements');
  },
  // 设置图形对象Y坐标的功能，并记录历史操作到事务中
  setY(editor: SuikaEditor, graphicsArr: SuikaGraphics[], val: number) {
    if (graphicsArr.length === 0) return;
    // 创建事务，记录操作前后的状态变化
    const transaction = new Transaction(editor);

    for (const graphics of graphicsArr) {
      // 记录操作前的状态
      transaction.recordOld(graphics.attrs.id, {
        transform: cloneDeep(graphics.attrs.transform),
      });
      // 获取图形的世界变换矩阵
      const tf = graphics.getWorldTransform();
      // 修改矩阵中的第5个元素（对应Y轴平移分量）
      tf[5] = val;
      // 设置图形的世界变换矩阵
      graphics.setWorldTransform(tf);
      // 记录修改后的变换矩阵状态
      transaction.update(graphics.attrs.id, {
        transform: cloneDeep(graphics.attrs.transform),
      });
    }
    // 自动更新所有父级容器的尺寸，以适应子元素位置的变化
    transaction.updateParentSize(graphicsArr);
    // 提交事务，记录操作历史
    transaction.commit('Update Y of Elements');
  },
  // 设置图形对象宽度的功能，并记录历史操作到事务中
  setWidth(editor: SuikaEditor, graphicsArr: SuikaGraphics[], val: number) {
    if (graphicsArr.length === 0) return;
    // 创建事务，记录操作前后的状态变化
    const transaction = new Transaction(editor);
    for (const graphics of graphicsArr) {
      // 记录操作前的状态
      transaction.recordOld(graphics.attrs.id, { width: graphics.attrs.width });
      // 设置图形对象的宽度
      graphics.updateAttrs({ width: val });
      // 记录修改后的状态
      transaction.update(graphics.attrs.id, { width: graphics.attrs.width });
    }
    // 自动更新所有父级容器的尺寸，以适应子元素位置的变化
    transaction.updateParentSize(graphicsArr);
    // FIXME: update children
    transaction.commit('Update Width of Elements');
  },
  // 设置图形对象高度的功能，并记录历史操作到事务中
  setHeight(editor: SuikaEditor, graphicsArr: SuikaGraphics[], val: number) {
    if (graphicsArr.length === 0) return;
    // 创建事务，记录操作前后的状态变化
    const transaction = new Transaction(editor);
    for (const graphics of graphicsArr) {
      // 记录操作前的状态
      transaction.recordOld(graphics.attrs.id, {
        height: graphics.attrs.height,
      });
      // 设置图形对象的高度
      graphics.updateAttrs({ height: val });
      // 记录修改后的状态
      transaction.update(graphics.attrs.id, { height: graphics.attrs.height });
    }
    // 自动更新所有父级容器的尺寸，以适应子元素位置的变化
    transaction.updateParentSize(graphicsArr);
    // FIXME: update children
    transaction.commit('Update Height of Elements');
  },
  // 设置图形对象旋转角度的功能，并记录历史操作到事务中
  setRotation(
    editor: SuikaEditor,
    graphicsArr: SuikaGraphics[],
    rotation: number,
  ) {
    if (graphicsArr.length === 0) return;
    // 创建事务，记录操作前后的状态变化
    const transaction = new Transaction(editor);

    for (const graphics of graphicsArr) {
      // 记录操作前的状态
      transaction.recordOld(graphics.attrs.id, {
        transform: cloneDeep(graphics.attrs.transform),
      });
      // 设置图形对象的旋转角度
      graphics.setRotate(rotation);
      // 记录修改后的状态
      transaction.update(graphics.attrs.id, {
        transform: cloneDeep(graphics.attrs.transform),
      });
    }
    // 自动更新所有父级容器的尺寸，以适应子元素位置的变化
    transaction.updateParentSize(graphicsArr);
    transaction.commit('Update Rotation');
  },
  // 设置图形对象圆角半径的功能
  setCornerRadius(
    editor: SuikaEditor,
    graphicsArr: SuikaGraphics[],
    cornerRadius: number,
  ) {
    if (graphicsArr.length === 0) return;
    // 过滤出矩形图形
    const rectGraphics = graphicsArr.filter(
      (el) => el.type === GraphicsType.Rect,
    ) as SuikaRect[];

    // 记录操作前的属性
    const prevAttrs = rectGraphics.map((el) => ({
      cornerRadius: el.attrs.cornerRadius || 0,
    }));
    // 设置图形对象的圆角半径
    rectGraphics.forEach((el) => {
      el.attrs.cornerRadius = cornerRadius;
    });
    // 创建命令，记录操作历史
    editor.commandManager.pushCommand(
      new SetGraphsAttrsCmd(
        'update Corner Radius',
        rectGraphics,
        { cornerRadius },
        prevAttrs,
      ),
    );
  },
  // 设置图形对象多边形边数的功能
  setCount(editor: SuikaEditor, elements: SuikaGraphics[], count: number) {
    if (elements.length === 0) return;
    // 过滤出多边形和星形图形
    const rectGraphics = elements.filter(
      (el) =>
        el.type === GraphicsType.RegularPolygon ||
        el.type === GraphicsType.Star,
    ) as SuikaRegularPolygon[];

    // 记录操作前的属性
    const prevAttrs = rectGraphics.map((el) => ({
      count: el.attrs.count,
    }));
    // 设置图形对象的边数
    rectGraphics.forEach((el) => {
      el.updateAttrs({
        count,
      });
    });
    // 创建命令，记录操作历史
    editor.commandManager.pushCommand(
      new SetGraphsAttrsCmd(
        'update Count',
        rectGraphics,
        { count: count },
        prevAttrs,
      ),
    );
  },

  // 设置图形对象星形内缩放比例的功能
  setStarInnerScale(
    editor: SuikaEditor,
    elements: SuikaGraphics[],
    val: number,
  ) {
    if (elements.length === 0) return;
    // 过滤出星形图形
    const rectGraphics = elements.filter(
      (el) => el.type === GraphicsType.Star,
    ) as SuikaStar[];
    // 记录操作前的属性
    const prevAttrs = rectGraphics.map((el) => ({
      starInnerScale: el.attrs.starInnerScale,
    }));
    // 设置图形对象的星形内缩放比例
    rectGraphics.forEach((el) => {
      el.updateAttrs({
        starInnerScale: val,
      });
    });
    // 创建命令，记录操作历史
    editor.commandManager.pushCommand(
      new SetGraphsAttrsCmd(
        'update Star InnerScale',
        rectGraphics,
        { count: val },
        prevAttrs,
      ),
    );
  },

  // 智能切换图形可见性的功能
  toggleVisible(editor: SuikaEditor, graphicsArr: SuikaGraphics[]) {
    if (graphicsArr.length === 0) return;
    // 如果至少有一个图形不可见 → 全部显示,如果所有图形都可见 → 全部隐藏
    const newVal = graphicsArr.some((item) => !item.isVisible());

    const transaction = new Transaction(editor);

    for (const graphics of graphicsArr) {
      // 记录
      transaction.recordOld(graphics.attrs.id, {
        visible: graphics.attrs.visible,
      });
      // 更新
      graphics.updateAttrs({
        visible: newVal,
      });
      transaction.update(graphics.attrs.id, { visible: newVal });
    }
    transaction.updateParentSize(graphicsArr);
    transaction.commit('update visible of graphs');
  },
  /**
   * lock / unlock
   */
  // 锁/解锁
  toggleLock(editor: SuikaEditor, graphicsArr: SuikaGraphics[]) {
    if (graphicsArr.length === 0) return;

    // 如果至少有一个图形未锁定 → 全部锁定，如果所有图形都已锁定 → 全部解锁
    const newLock = graphicsArr.some((item) => !item.isLock());
    const prevAttrs = graphicsArr.map((el) => ({ lock: el.attrs.lock }));
    graphicsArr.forEach((el) => {
      el.updateAttrs({
        lock: newLock,
      });
    });
    editor.commandManager.pushCommand(
      new SetGraphsAttrsCmd(
        'update lock of graphs',
        graphicsArr,
        { lock: newLock },
        prevAttrs,
      ),
    );
  },

  // 设置图形名称
  setGraphName(
    editor: SuikaEditor,
    graphics: SuikaGraphics,
    objectName: string,
  ) {
    const prevAttrs = [{ objectName: graphics.attrs.objectName }];
    graphics.updateAttrs({
      objectName,
    });
    editor.commandManager.pushCommand(
      new SetGraphsAttrsCmd(
        'update name of graphics',
        [graphics],
        { objectName },
        prevAttrs,
      ),
    );
  },
};
