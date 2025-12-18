import { type IBox, type IPoint, type ITransformRect } from '../type';
import { applyMatrix } from './geo_matrix';
import { rectToVertices } from './geo_rect';

export const isPointInBox = (box: IBox, point: IPoint, tol = 0) => {
  return (
    point.x >= box.minX - tol &&
    point.y >= box.minY - tol &&
    point.x <= box.maxX + tol &&
    point.y <= box.maxY + tol
  );
};

/**
 * get merged rect from rects
 */
export const mergeBoxes = (boxes: IBox[]): IBox => {
  if (boxes.length === 0) {
    throw new Error('the count of boxes can not be 0');
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
};

export const isBoxIntersect = (box1: IBox, box2: IBox) => {
  return (
    box1.minX <= box2.maxX &&
    box1.maxX >= box2.minX &&
    box1.minY <= box2.maxY &&
    box1.maxY >= box2.minY
  );
};

/** whether box1 contains box2 */
export const isBoxContain = (box1: IBox, box2: IBox) => {
  return (
    box1.minX <= box2.minX &&
    box1.minY <= box2.minY &&
    box1.maxX >= box2.maxX &&
    box1.maxY >= box2.maxY
  );
};

export const getPointsBbox = (points: IPoint[]): IBox => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
};

// 计算变换后矩形的轴对齐包围盒
export const calcRectBbox = (
  transformRect: ITransformRect,
  paddingBeforeTransform?: number,
): Readonly<IBox> => {
  // 初始化矩形位置为原点
  let x = 0;
  let y = 0;
  // 获取矩形的宽度和高度
  let width = transformRect.width;
  let height = transformRect.height;
  // 如果指定了变换前填充，则在四个方向上扩展矩形
  if (paddingBeforeTransform) {
    // 向左和向上扩展
    x -= paddingBeforeTransform;
    y -= paddingBeforeTransform;
    // 在宽度和高度上增加两倍的填充（左右或上下各增加一份）
    width += paddingBeforeTransform * 2;
    height += paddingBeforeTransform * 2;
  }
  // 获取变换矩阵
  const tf = transformRect.transform;
  // 将矩形转换为四个顶点坐标，然后对每个顶点应用变换矩阵
  const vertices = rectToVertices({
    x,
    y,
    width,
    height,
  }).map((item) => {
    // 对每个顶点应用变换矩阵
    return applyMatrix(tf, item);
  });

  // 计算变换后顶点的最小轴对齐包围盒
  return getPointsBbox(vertices);
};
