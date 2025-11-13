import { type IMatrixArr, type IPoint, type ITransformRect } from '../type';

/**
 * 返回单位矩阵
 * @returns 单位矩阵
 */
export const identityMatrix = (): IMatrixArr => {
  return [1, 0, 0, 1, 0, 0];
};

/**
 * 矩阵乘法
 * @param m1 矩阵1
 * @param m2 矩阵2
 * @returns 矩阵乘积
 */
export const multiplyMatrix = (m1: IMatrixArr, m2: IMatrixArr): IMatrixArr => {
  // 获取矩阵1的元素
  const a1 = m1[0];
  // 获取矩阵1的元素
  const b1 = m1[1];
  // 获取矩阵1的元素
  const c1 = m1[2];
  // 获取矩阵1的元素
  const d1 = m1[3];

  // 返回矩阵乘积
  return [
    m2[0] * a1 + m2[1] * c1, // 计算矩阵乘积的第一个元素
    m2[0] * b1 + m2[1] * d1, // 计算矩阵乘积的第二个元素
    m2[2] * a1 + m2[3] * c1, // 计算矩阵乘积的第三个元素
    m2[2] * b1 + m2[3] * d1, // 计算矩阵乘积的第四个元素
    m2[4] * a1 + m2[5] * c1 + m1[4], // 计算矩阵乘积的第五个元素
    m2[4] * b1 + m2[5] * d1 + m1[5], // 计算矩阵乘积的第六个元素
  ];
};

export const applyMatrix = (tf: IMatrixArr, pt: IPoint): IPoint => {
  return {
    x: pt.x * tf[0] + pt.y * tf[2] + tf[4],
    y: pt.x * tf[1] + pt.y * tf[3] + tf[5],
  };
};

export const applyInverseMatrix = (tf: IMatrixArr, pt: IPoint): IPoint => {
  return applyMatrix(invertMatrix(tf), pt);
};

export const invertMatrix = (tf: IMatrixArr): IMatrixArr => {
  const a1 = tf[0];
  const b1 = tf[1];
  const c1 = tf[2];
  const d1 = tf[3];
  const tx1 = tf[4];
  const n = a1 * d1 - b1 * c1;

  return [
    d1 / n,
    -b1 / n,
    -c1 / n,
    a1 / n,
    (c1 * tf[5] - d1 * tx1) / n,
    -(a1 * tf[5] - b1 * tx1) / n,
  ];
};

export const getScaleMatrix = (sx: number, sy: number): IMatrixArr => {
  return [sx, 0, 0, sy, 0, 0];
};

export const applySizeToTransform = (
  transformRect: ITransformRect,
): IMatrixArr => {
  return multiplyMatrix(
    transformRect.transform,
    getScaleMatrix(transformRect.width, transformRect.height),
  );
};
