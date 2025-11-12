import { type IPoint } from '@suika/geo';

import {
  isFrameGraphics,
  type SuikaFrame,
  type SuikaGraphics,
} from '../graphics';

/**
 * 递归查找指定点所在的最深层画框（Frame），用于确定新绘制图形的父容器
 * @param point 要检测的点（场景坐标）
 * @param nodes 要搜索的图形节点数组
 * @param excludeFn 排除特定节点的函数
 * @returns
 */
export const getDeepFrameAtPoint = (
  point: IPoint,
  nodes: SuikaGraphics[],
  excludeFn?: (node: SuikaGraphics) => boolean,
): SuikaFrame | null => {
  // 从后往前遍历，优先匹配最上层的图形（Z-order）
  for (let i = nodes.length - 1; i >= 0; i--) {
    const child = nodes[i];
    // 排除检查
    if (excludeFn?.(child)) {
      continue;
    }
    /* 
        isFrameGraphics(child)  是画框类型
        !child.isGroup()  不是组类型
        child.hitTest(point) 点命中画框
    */
    if (isFrameGraphics(child) && !child.isGroup() && child.hitTest(point)) {
      // 递归查找子节点中的画框
      const item = getDeepFrameAtPoint(point, child.getChildren(), excludeFn);
      // 如果找到更深的画框，返回它；否则返回当前画框
      return item || child;
    }
  }
  return null;
};
