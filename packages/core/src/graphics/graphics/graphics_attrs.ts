import { type IMatrixArr } from '@suika/geo';

import { type IPaint } from '../../paint';
import { type GraphicsType as GraphicsType } from '../../type';
import { type SuikaDocument } from '../document';

/**
 * 图形属性
 */
export interface GraphicsAttrs {
  type?: GraphicsType; // 图形类型
  id: string; // 图形 id
  objectName: string; // 图形名称
  width: number; // 图形宽度
  height: number; // 图形高度
  /**
   * | a | c | tx|
   * | b | d | ty|
   * | 0 | 0 | 1 |
   */
  transform: IMatrixArr; // 图形变换
  opacity?: number; // 图形透明度
  fill?: IPaint[]; // 图形填充
  stroke?: IPaint[]; // 图形描边
  strokeWidth?: number; // 图形描边宽度
  visible?: boolean; // 图形是否可见
  lock?: boolean; // 图形是否锁定
  parentIndex?: IParentIndex; // 父级图形索引
}

export interface IParentIndex {
  guid: string; // 父级图形 id
  position: string; // 父级图形位置
}

export interface IAdvancedAttrs {
  x?: number;
  y?: number;
  rotate?: number;
}

export interface IGraphicsOpts {
  // advance attribute, will convert to 'attrs.transform'
  advancedAttrs?: IAdvancedAttrs;
  doc: SuikaDocument;
  noCollectUpdate?: boolean;
}
