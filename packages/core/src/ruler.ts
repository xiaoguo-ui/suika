import { getClosestTimesVal, nearestPixelVal } from '@suika/common';

import { HALF_PI } from './constant';
import { type SuikaEditor } from './editor';
import { mergeIntervals, rotateInCanvas } from './utils';

/**
 * 根据缩放比例获取步长
 * @param zoom 缩放比例
 * @returns 步长
 */
const getStepByZoom = (zoom: number) => {
  // 步长研究，参考 figma
  /**
   * 步长研究，参考 figma
   * 1
   * 2
   * 5
   * 10（对应 500% 往上） 找到规律了： 50 / zoom = 步长
   * 25（对应 200% 往上）
   * 50（对应 100% 往上）
   * 100（对应 50% 往上）
   * 250
   * 500
   * 1000
   * 2500
   * 5000
   */
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  // 计算步长
  const step = 50 / zoom;
  // 遍历步长数组，找到最接近的步长
  for (let i = 0, len = steps.length; i < len; i++) {
    if (steps[i] >= step) return steps[i];
  }
  // 如果找不到，返回步长数组的第一个元素
  return steps[0];
};

/**
 * Ruler
 *
 * reference: https://mp.weixin.qq.com/s/RlNTitV3XTEKHfwpOKAQ0g
 */
class Ruler {
  /**
   * 标尺是否可见
   */
  visible = false;

  constructor(private editor: SuikaEditor) {}

  /**
   * 打开标尺
   */
  open() {
    this.visible = true;
  }
  /**
   * 关闭标尺
   */
  close() {
    this.visible = false;
  }
  /**
   * 绘制标尺
   */
  draw() {
    // 获取到编辑器的全局设置
    const setting = this.editor.setting;
    // 获取默认的标尺宽度
    const rulerWidth = setting.get('rulerWidth');

    // canvas 上下文对象
    const ctx = this.editor.ctx;
    // 获取视口
    const viewport = this.editor.viewportManager.getViewport();
    // 获取视口宽度，高度
    const { width: viewportWidth, height: viewportHeight } = viewport;
    // 确保标尺绘制不会影响编辑器的其他绘制逻辑
    ctx.save();
    // 绘制背景
    ctx.fillStyle = setting.get('rulerBgColor');
    // 绘制背景
    ctx.fillRect(0, 0, viewportWidth, rulerWidth);
    // 绘制背景
    ctx.fillRect(0, 0, rulerWidth, viewportHeight);
    // 绘制选中区域背景
    this.drawSelectArea();
    // 绘制 x 轴标尺
    this.drawXRuler();
    // 绘制 y 轴标尺
    this.drawYRuler();

    // 把左上角的小矩形上的刻度盖掉
    ctx.fillStyle = setting.get('rulerBgColor');
    ctx.fillRect(0, 0, rulerWidth, rulerWidth);

    // 绘制 border
    ctx.strokeStyle = setting.get('rulerStroke');
    ctx.beginPath();
    // 水平 border
    ctx.moveTo(0, rulerWidth + 0.5);
    ctx.lineTo(viewportWidth, rulerWidth + 0.5);
    ctx.stroke();
    ctx.closePath();
    // 垂直 border
    ctx.beginPath();
    ctx.moveTo(rulerWidth + 0.5, 0);
    ctx.lineTo(rulerWidth + 0.5, viewportHeight);
    ctx.stroke();
    ctx.closePath();

    ctx.restore();
  }
  /**
   * 该方法在标尺上高亮显示选中元素的区域投影，帮助快速定位选中元素的边界。
   */
  private drawSelectArea() {
    // 获取到编辑器的全局设置
    const setting = this.editor.setting;
    // 获取默认的标尺宽度
    const rulerWidth = setting.get('rulerWidth');

    const ctx = this.editor.ctx;
    // 获取缩放比例
    const zoom = this.editor.zoomManager.getZoom();
    // 获取视口
    const viewport = this.editor.viewportManager.getViewport();
    // 收集选中元素的边界框
    const bboxes = this.editor.selectedElements
      .getItems()
      .map((item) => item.getBbox());
    // 绘制选中区域背景
    ctx.fillStyle = setting.get('rulerSelectedBgColor');
    // 遍历边界框，绘制水平区域
    for (const [minX, maxX] of mergeIntervals(
      bboxes.map(({ minX, maxX }) => [minX, maxX]),
    )) {
      // 绘制填充矩形
      ctx.fillRect(
        (minX - viewport.x) * zoom,
        0,
        (maxX - minX) * zoom,
        rulerWidth,
      );
    }
    // 遍历边界框，绘制垂直区域
    for (const [minY, maxY] of mergeIntervals(
      bboxes.map(({ minY, maxY }) => [minY, maxY]),
    )) {
      ctx.fillRect(
        0,
        (minY - viewport.y) * zoom,
        rulerWidth,
        (maxY - minY) * zoom,
      );
    }
  }
  /**
   * 该方法用于绘制水平标尺（X 轴），包括刻度线和刻度值。
   */
  private drawXRuler() {
    // 获取到编辑器的全局设置
    const setting = this.editor.setting;
    // 获取默认的标尺宽度
    const rulerWidth = setting.get('rulerWidth');
    // canvas 上下文对象
    const ctx = this.editor.ctx;
    // 获取缩放比例
    const zoom = this.editor.zoomManager.getZoom();
    // 获取视口
    const viewport = this.editor.viewportManager.getViewport();
    // 获取步长
    const stepInScene = getStepByZoom(zoom);
    // 获取 x 轴起点
    const startX = rulerWidth;
    // 转换为场景坐标
    let startXInScene = viewport.x + startX / zoom;
    // 取整，确保标尺刻度与实际场景坐标对齐
    startXInScene = getClosestTimesVal(startXInScene, stepInScene);
    // 获取 x 轴终点
    const endX = viewport.width;
    // 转换为场景坐标
    let { x: endXInScene } = this.editor.toScenePt(endX, 0);
    // 取整，确保标尺刻度与实际场景坐标对齐
    endXInScene = getClosestTimesVal(endXInScene, stepInScene);
    // 设置文本对齐方式
    ctx.textAlign = 'center';
    // 获取 y 轴位置
    const y = rulerWidth - setting.get('rulerMarkSize');
    // 遍历 x 轴起点到终点
    while (startXInScene <= endXInScene) {
      // 设置刻度线颜色
      ctx.strokeStyle = setting.get('rulerMarkStroke');
      // 设置刻度值颜色
      ctx.fillStyle = setting.get('rulerMarkStroke');
      // 获取 x 轴位置
      const x = nearestPixelVal((startXInScene - viewport.x) * zoom);
      // 绘制刻度线
      ctx.beginPath();
      // 绘制水平线
      ctx.moveTo(x, y);
      // 绘制垂直线
      ctx.lineTo(x, y + setting.get('rulerMarkSize'));
      // 描边刻度线
      ctx.stroke();
      // 关闭路径
      ctx.closePath();
      // 绘制刻度值
      ctx.fillText(String(startXInScene), x, y - 4);
      // 增加步长
      startXInScene += stepInScene;
    }
  }
  /**
   * 该方法用于绘制垂直标尺（Y 轴），包括刻度线和刻度值。
   */
  private drawYRuler() {
    // 获取到编辑器的全局设置
    const setting = this.editor.setting;
    // 获取默认的标尺宽度
    const rulerWidth = setting.get('rulerWidth');
    // canvas 上下文对象
    const ctx = this.editor.ctx;
    // 获取缩放比例
    const zoom = this.editor.zoomManager.getZoom();
    // 获取视口
    const viewport = this.editor.viewportManager.getViewport();
    // 获取步长
    const stepInScene = getStepByZoom(zoom);
    // 获取 y 轴起点
    const startY = rulerWidth;
    // 转换为场景坐标
    let startYInScene = viewport.y + startY / zoom;
    // 取整，确保标尺刻度与实际场景坐标对齐
    startYInScene = getClosestTimesVal(startYInScene, stepInScene);
    // 获取 y 轴终点
    const endY = viewport.height;
    // 转换为场景坐标
    let endYInScene = viewport.y + endY / zoom;
    // 取整，确保标尺刻度与实际场景坐标对齐
    endYInScene = getClosestTimesVal(endYInScene, stepInScene);
    // 设置文本对齐方式
    const x = rulerWidth - setting.get('rulerMarkSize');
    // 设置文本对齐方式
    ctx.textAlign = 'center';
    // 设置刻度值颜色
    ctx.fillStyle = setting.get('rulerMarkStroke');
    // 遍历 y 轴起点到终点
    while (startYInScene <= endYInScene) {
      // 获取 y 轴位置
      const y = nearestPixelVal((startYInScene - viewport.y) * zoom);
      // 绘制刻度线
      ctx.beginPath();
      // 绘制水平线
      ctx.moveTo(x, y);
      // 绘制垂直线
      ctx.lineTo(x + setting.get('rulerMarkSize'), y);
      // 描边刻度线
      ctx.stroke();
      ctx.closePath();
      // 围绕指定点旋转 Canvas 的变换矩阵，而不是围绕画布原点 (0, 0) 旋转
      rotateInCanvas(ctx, -HALF_PI, x, y);
      // 绘制刻度值
      ctx.fillText(String(startYInScene), x, y - 3);
      // 围绕指定点旋转 Canvas 的变换矩阵，而不是围绕画布原点 (0, 0) 旋转
      rotateInCanvas(ctx, HALF_PI, x, y);
      // 增加步长
      startYInScene += stepInScene;
    }
  }
}

export default Ruler;
