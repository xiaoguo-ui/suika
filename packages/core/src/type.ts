import { type GraphicsAttrs } from './graphics';

/**
 * 数组长度必须大于等于 1 的数组
 */
export type INoEmptyArray<T> = [T, ...T[]];

export interface IObject {
  id: string;
  type: string;
  visible: boolean;
  lock: boolean;
  name: string;
  children?: IObject[];
}

export enum GraphicsType {
  Graph = 'Graph',
  Rect = 'Rect',
  Ellipse = 'Ellipse',
  Text = 'Text',
  Line = 'Line',
  Path = 'Path',
  RegularPolygon = 'RegularPolygon',
  Star = 'Star',
  Frame = 'Frame',
  Canvas = 'Canvas',
  Document = 'Document',
}

/**
 * set some optional property
 *
 * @example
 * type Foo = { a: string; b: number; c: boolean };
 * type FooWithOptionalB = Optional<Foo, 'b'>;
 * // { a: string; b?: number; c: boolean }
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * 编辑器图纸数据
 */
export interface IEditorPaperData {
  appVersion: string; // 应用版本
  paperId: string; // 图纸 id
  data: GraphicsAttrs[]; // 图纸数据
}

export interface IVerticalLine {
  x: number;
  ys: number[];
}

export interface IHorizontalLine {
  y: number;
  xs: number[];
}

/**
 * get all boolean keys of T
 * e.g.
 * type A = { a: string; b: boolean; c: boolean };
 * type B = BooleanKeys<A>; // 'b' | 'c'
 */
export type BooleanKeys<T> = {
  [K in keyof T]: T[K] extends boolean ? K : never;
}[keyof T];

export interface IFillStrokeSVGAttrs {
  fill?: string;
  'fill-opacity'?: number;
  stroke?: string;
  'stroke-opacity'?: number;
}

export enum AlignType {
  Left = 'Left',
  HCenter = 'HCenter',
  Right = 'Right',
  Top = 'Top',
  VCenter = 'VCenter',
  Bottom = 'Bottom',
}

export enum ArrangeType {
  Front = 'Front',
  Back = 'Back',
  Forward = 'Forward',
  Backward = 'Backward',
}

export interface IChanges {
  added: Map<string, GraphicsAttrs>;
  deleted: Set<string>;
  update: Map<string, Partial<GraphicsAttrs>>;
}
