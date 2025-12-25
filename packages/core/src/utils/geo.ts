import { getSweepAngle, type IBox, type IPoint, type IRect } from '@suika/geo';

import { HALF_PI } from '../constant';

export const bboxToBboxWithMid = (
  box: IBox,
): IBox & { midX: number; midY: number } => {
  return {
    ...box,
    midX: box.minX / 2 + box.maxX / 2,
    midY: box.minY / 2 + box.maxY / 2,
  };
};

export const getBoxCenter = (box: IBox) => {
  return {
    x: box.minX / 2 + box.maxX / 2,
    y: box.minY / 2 + box.maxY / 2,
  };
};

/**
 * 将点数组转换为垂直线映射，每个x坐标对应该垂直线上所有点的y坐标数组
 * @param points - 点数组
 * @example
 * const points = [
 *   { x: 10, y: 20 },
 *   { x: 10, y: 30 },
 *   { x: 20, y: 25 },
 *   { x: 10, y: 40 }
 * ];
 * const vLines = pointsToVLines(points);
 *  vLines.get(10) === [20, 30, 40]
 *  vLines.get(20) === [25]
 */
export const pointsToVLines = (points: IPoint[]): Map<number, number[]> => {
  const map = new Map<number, number[]>();
  for (const point of points) {
    const { x, y } = point;
    if (!map.has(x)) map.set(x, []);
    map.get(x)!.push(y);
  }
  return map;
};

/**
 * 将点数组转换为水平线映射，每个y坐标对应该水平线上所有点的x坐标数组
 * @param points - 点数组
 * @example
 * const points = [
 *   { x: 10, y: 20 },
 *   { x: 15, y: 20 },
 *   { x: 20, y: 20 },
 *   { x: 10, y: 25 },
 *   { x: 10, y: 30 }
 * ];
 * const hLines = pointsToHLines(points);
 *  hLines.get(20) === [10, 15, 20]
 *  hLines.get(25) === [10]
 */
export const pointsToHLines = (points: IPoint[]): Map<number, number[]> => {
  const map = new Map<number, number[]>();
  for (const point of points) {
    const { x, y } = point;
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(x);
  }
  return map;
};

export const adjustSizeToKeepPolarSnap = (rect: IRect): IRect => {
  const radian = getSweepAngle(
    { x: 0, y: -1 },
    {
      x: rect.width,
      y: rect.height,
    },
  );

  const { width, height } = rect;
  const remainder = radian % HALF_PI;
  if (remainder < Math.PI / 8 || remainder > (Math.PI * 3) / 8) {
    if (Math.abs(width) > Math.abs(height)) {
      rect.height = 0;
    } else {
      rect.width = 0;
    }
  } else {
    const min = Math.min(Math.abs(width), Math.abs(height));
    const max = Math.max(Math.abs(width), Math.abs(height));
    const size = min + (max - min) / 2;

    rect.height = (Math.sign(height) || 1) * size;
    rect.width = (Math.sign(width) || 1) * size;
  }
  return rect;
};
