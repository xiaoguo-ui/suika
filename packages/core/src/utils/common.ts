import { type SuikaGraphics } from '../graphics';

/**
 * 用于为新建图形对象生成唯一的名称，避免与父对象下现有子对象的名称冲突。
 * @param parent 父对象
 * @param objectType 对象类型
 * @returns 不冲突的对象名称
 */
export const getNoConflictObjectName = (
  parent: SuikaGraphics,
  objectType: string,
) => {
  // 获取父对象的子对象
  const children = parent.getChildren();
  // 初始化最大编号
  let maxNum = 0;
  // 创建正则表达式，用于匹配对象名称中的编号
  const regexp = new RegExp(`^${objectType}\\s+(\\d+)`);
  // 遍历父对象的子对象
  for (const child of children) {
    // 匹配对象名称中的编号
    const match = child.attrs.objectName.match(regexp);
    // 如果匹配到编号
    if (match) {
      // 将匹配到的编号转换为数字
      const num = parseInt(match[1]);
      // 如果编号大于最大编号，则更新最大编号
      if (num > maxNum) {
        // 更新最大编号
        maxNum = num;
      }
    }
  }
  // 返回不冲突的对象名称，编号为最大编号加1
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
