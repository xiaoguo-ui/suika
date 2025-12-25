import { getClosestTimesVal } from '@suika/common';
import { type IPoint } from '@suika/geo';

import { type Setting } from './setting';

export const SnapHelper = {
  // 根据设置获取吸附点
  getSnapPtBySetting(point: IPoint, setting: Setting) {
    point = { x: point.x, y: point.y };
    // 检查网格吸附开关
    const snapGrid = setting.get('snapToGrid');
    if (snapGrid) {
      // 获取网格吸附间距
      const gridSnapSpacing = {
        x: setting.get('gridSnapX'),
        y: setting.get('gridSnapY'),
      };
      // 计算网格吸附点
      return this.getGridSnapPt(point, gridSnapSpacing);
    }
    return point;
  },

  // 获取网格吸附点
  getGridSnapPt(point: IPoint, snapSpacing: IPoint) {
    return {
      x: getClosestTimesVal(point.x, snapSpacing.x),
      y: getClosestTimesVal(point.y, snapSpacing.y),
    };
  },
};
