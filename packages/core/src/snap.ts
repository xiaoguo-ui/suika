import { getClosestTimesVal } from '@suika/common';
import { type IPoint } from '@suika/geo';

import { type Setting } from './setting';

export const SnapHelper = {
  /**
   * support grid snap
   *
   * TODO:
   * objects snap
   * polar tracking snap
   * ortho
   * ruler ref line snap
   */
  /**
   * @description 根据设置获取吸附点
   * @param point 点
   * @param setting 设置
   */
  getSnapPtBySetting(point: IPoint, setting: Setting) {
    point = { x: point.x, y: point.y };
    // 是否启动网格吸附
    const snapGrid = setting.get('snapToGrid');
    // 如果启动网格吸附，则获取网格吸附点
    if (snapGrid) {
      // 获取网格吸附间距
      const gridSnapSpacing = {
        x: setting.get('gridSnapX'),
        y: setting.get('gridSnapY'),
      };
      // 获取网格吸附点
      return this.getGridSnapPt(point, gridSnapSpacing);
    }
    return point;
  },

  /**
   * 获取网格吸附点
   * @param point 点
   * @param snapSpacing 吸附间距
   * @returns 吸附点
   */
  getGridSnapPt(point: IPoint, snapSpacing: IPoint) {
    // 获取网格吸附点
    return {
      x: getClosestTimesVal(point.x, snapSpacing.x),
      y: getClosestTimesVal(point.y, snapSpacing.y),
    };
  },
};
