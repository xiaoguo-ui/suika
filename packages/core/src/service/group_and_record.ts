import { cloneDeep } from '@suika/common';
import {
  boxToRect,
  calcRectBbox,
  invertMatrix,
  mergeBoxes,
  multiplyMatrix,
} from '@suika/geo';

import { type SuikaEditor } from '../editor';
import { GraphicsObjectSuffix, SuikaFrame, SuikaGraphics } from '../graphics';
import { Transaction } from '../transaction';
import { getNoConflictObjectName, getParentIdSet } from '../utils';

/**
 * 将一组图形组合成一个组，并记录操作
 * @param graphicsArr 图形数组
 * @param editor 编辑器
 * @description 将一组图形组合成一个组，并记录操作
 */
export const groupAndRecord = (
  graphicsArr: SuikaGraphics[],
  editor: SuikaEditor,
) => {
  // 检查图形数组是否为空，空数组不允许编组
  if (graphicsArr.length === 0) {
    console.warn('graphics should not be empty');
    return;
  }
  // 对图形数组按排序索引排序，确保编组后的层级关系正确
  graphicsArr = SuikaGraphics.sortGraphics(graphicsArr);
  // 获取所有图形元素的父级ID集合，用于后续更新父级容器尺寸
  const parentIdSet = getParentIdSet(graphicsArr);

  // 取最后一个图形作为参考点，获取其父容器作为新组的父容器
  const lastGraphics = graphicsArr.at(-1)!;
  const parentOfGroup = lastGraphics.getParent()!;
  // 计算父容器的逆变换矩阵，用于将图形坐标转换为父容器坐标系
  const parentOfGroupInvertTf = invertMatrix(parentOfGroup.getWorldTransform());

  // 获取最后一个图形的排序索引，新组将插入到这个位置
  const groupSortIndex = lastGraphics.getSortIndex();

  // 计算所有图形在父容器坐标系下的合并边界框，用于确定组容器的大小和位置
  const boundRect = boxToRect(
    mergeBoxes(
      graphicsArr.map((el) => {
        // 将每个图形的边界框转换到父容器坐标系中
        return calcRectBbox({
          ...el.getSize(),
          transform: multiplyMatrix(
            parentOfGroupInvertTf,
            el.getWorldTransform(),
          ),
        });
      }),
    ),
  );

  // 创建新的组容器，设置自适应尺寸和唯一对象名称
  const group = new SuikaFrame(
    {
      // 生成不冲突的组名称，如"组"、"组 2"等
      objectName: getNoConflictObjectName(
        parentOfGroup,
        GraphicsObjectSuffix.Group,
      ),
      width: boundRect.width,
      height: boundRect.height,
      // 启用自适应尺寸，组的大小会根据内容自动调整
      resizeToFit: true,
    },
    {
      advancedAttrs: {
        // 设置组的位置为合并边界框的左上角
        x: boundRect.x,
        y: boundRect.y,
      },
      doc: editor.doc,
    },
  );
  // 将新创建的组插入到父容器的正确排序位置
  parentOfGroup.insertChild(group, groupSortIndex);
  // 计算组容器的逆变换矩阵，用于将图形坐标转换为组内坐标
  const groupInvertTf = invertMatrix(group.getWorldTransform());

  // 创建事务对象开始记录状态变化，支持撤销/重做功能
  const transaction = new Transaction(editor);
  // 标记新创建的组ID，撤销时需要删除这个组
  transaction.addNewIds([group.attrs.id]);

  // 遍历每个要编组的图形，进行坐标转换和状态记录
  for (const graphics of graphicsArr) {
    // 记录图形当前的原始状态（父级索引和变换矩阵）
    transaction.recordOld(graphics.attrs.id, {
      parentIndex: cloneDeep(graphics.attrs.parentIndex),
      transform: cloneDeep(graphics.attrs.transform),
    });

    // 将图形坐标从世界坐标系转换为组内坐标系，保持相对位置
    graphics.updateAttrs({
      transform: multiplyMatrix(groupInvertTf, graphics.getWorldTransform()),
    });
    // 将图形插入到组容器中，成为组的子元素
    group.insertChild(graphics);

    // 记录图形变换后的新状态，用于撤销重做
    transaction.update(graphics.attrs.id, {
      parentIndex: cloneDeep(graphics.attrs.parentIndex),
      transform: cloneDeep(graphics.attrs.transform),
    });
  }

  // 更新所有相关父级容器的尺寸，以适应布局变化
  transaction.updateNodeSize(parentIdSet);
  // 提交事务到命令管理器，完成编组操作的历史记录
  transaction.commit('group');

  // 将新创建的组添加到场景图中，触发渲染更新
  editor.sceneGraph.addItems([group]);
  // 设置新创建的组为当前选中元素，更新编辑器选择状态
  editor.selectedElements.setItems([group]);
};
