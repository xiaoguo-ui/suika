import { type SuikaGraphics } from '../graphics';

export const getNoConflictObjectName = (
  parent: SuikaGraphics,
  objectType: string,
) => {
  const children = parent.getChildren();
  let maxNum = 0;
  const regexp = new RegExp(`^${objectType}\\s+(\\d+)`);
  for (const child of children) {
    const match = child.attrs.objectName.match(regexp);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `${objectType} ${maxNum + 1}`;
};
/**
 * 该函数实现区间合并：将重叠或相邻的区间合并为一个连续区间。
 * @param intervals 区间数组
 * @returns
 *
 * @example
 * mergeIntervals([[1, 3], [2, 6], [8, 10], [15, 18]]) => [[1, 6], [8, 10], [15, 18]]
 * mergeIntervals([[1, 4], [4, 5]]) => [[1, 5]]
 * mergeIntervals([[1, 5]]) => [[1, 5]]
 * mergeIntervals([]) => []
 */
export const mergeIntervals = (intervals: [number, number][]) => {
  // 排序区间,确保后续处理按顺序进行
  intervals.sort(([a], [b]) => a - b);
  // 初始化结果数组
  const result: [number, number][] = [];
  // 遍历区间
  for (const [prev, next] of intervals) {
    // 获取当前结果数组的最后一个区间
    const cur = result.at(-1);
    // 如果当前结果数组的最后一个区间与当前区间重叠或相邻，则合并它们
    if (cur && cur[1] >= prev) {
      // 更新最后一个区间的右边界为两个区间的最大值
      cur[1] = Math.max(next, cur[1]);
    } else {
      // 否则，将当前区间添加到结果数组中
      result.push([prev, next]);
    }
  }
  // 返回合并后的区间数组
  return result;
};
