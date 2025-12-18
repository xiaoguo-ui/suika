import {
  calcCoverScale,
  cloneDeep,
  genUuid,
  isEqual,
  objectNameGenerator,
  omit,
  parseRGBToHex,
  pick,
} from '@suika/common';
import {
  boxToRect,
  calcRectBbox,
  getTransformAngle,
  getTransformedSize,
  type IBox,
  identityMatrix,
  type IMatrixArr,
  invertMatrix,
  type IPoint,
  isBoxContain,
  isBoxIntersect,
  isPointInTransformedRect,
  isRectIntersect,
  type ITransformRect,
  Matrix,
  multiplyMatrix,
  normalizeRadian,
  rad2Deg,
  recomputeTransformRect,
  rectToVertices,
  resizeLine,
  resizeRect,
} from '@suika/geo';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

import { HALF_PI } from '../../constant';
import { type ControlHandle } from '../../control_handle_manager';
import { type ImgManager } from '../../Img_manager';
import {
  DEFAULT_IMAGE,
  isPaintsShouldRender,
  type PaintImage,
  PaintType,
} from '../../paint';
import {
  GraphicsType,
  type IFillStrokeSVGAttrs,
  type IObject,
  type Optional,
} from '../../type';
import { drawRoundRectPath } from '../../utils';
import { type SuikaDocument } from '../document';
import { type IDrawInfo, type IHitOptions } from '../type';
import {
  type GraphicsAttrs,
  type IAdvancedAttrs,
  type IGraphicsOpts,
} from './graphics_attrs';

export class SuikaGraphics<ATTRS extends GraphicsAttrs = GraphicsAttrs> {
  type = GraphicsType.Graph;
  // 当前图形的属性
  attrs: ATTRS;
  // 文档引用
  protected doc: SuikaDocument;
  // 缓存描边包围盒
  protected _cacheBboxWithStroke: Readonly<IBox> | null = null;
  protected _cacheBbox: Readonly<IBox> | null = null;
  protected _cacheMinBbox: IBox | null = null;

  /** hide graphics temporarily, it's possible that attrs.visible is true */
  noRender = false;
  private _deleted = false;
  private _sortDirty = false;

  // 是否不收集更新
  private noCollectUpdate: boolean;
  constructor(
    attrs: Omit<Optional<ATTRS, 'transform'>, 'id'>,
    opts: IGraphicsOpts,
  ) {
    // 保存文档引用，用于管理图形树和属性
    this.doc = opts.doc;
    // 如果未提供 transform，使用单位矩阵（无变换）
    const transform = attrs.transform ?? identityMatrix();

    const advancedAttrs = opts.advancedAttrs;
    // 将 x、y 写入矩阵的平移分量
    if (advancedAttrs && !attrs.transform) {
      // transform[4] = tx（x 平移）
      if (advancedAttrs.x !== undefined) {
        transform[4] = advancedAttrs.x;
      }
      // transform[5] = ty（y 平移）
      if (advancedAttrs.y !== undefined) {
        transform[5] = advancedAttrs.y;
      }
    }
    // 复制属性对象
    this.attrs = { ...attrs } as ATTRS;
    // 生成唯一 ID
    this.attrs.id ??= genUuid();
    // 设置变换矩阵
    this.attrs.transform = transform;
    // strokeWidth，默认为 1
    this.attrs.strokeWidth ??= 1;
    // 如果已提供 objectName，更新生成器的最大索引
    if (this.attrs.objectName) {
      objectNameGenerator.setMaxIdx(attrs.objectName);
      // 根据类型生成新名称（如 "Rect 1", "Ellipse 2"）
    } else {
      this.attrs.objectName = objectNameGenerator.gen(this.attrs.type ?? '');
    }

    // 是否不收集更新
    this.noCollectUpdate = Boolean(opts?.noCollectUpdate);
  }

  // 获取当前图形的属性
  getAttrs(): ATTRS {
    return cloneDeep(this.attrs);
  }

  // 判断给定的属性变化是否需要更新包围盒缓存
  protected shouldUpdateBbox(attrs: Partial<GraphicsAttrs> & IAdvancedAttrs) {
    // TODO: if x, y, width, height value no change, bbox should not be updated
    // 是否有属性会影响包围盒
    return (
      // 位置坐标变化
      attrs.x !== undefined ||
      attrs.y !== undefined ||
      // 尺寸变化
      attrs.width !== undefined ||
      attrs.height !== undefined ||
      // 变换矩阵变化
      attrs.transform !== undefined ||
      // 描边宽度变化
      'strokeWidth' in attrs ||
      // 父级索引变化
      'parentIndex' in attrs
    );
  }

  // 清除包围盒缓存
  protected clearBboxCache() {
    this._cacheBbox = null;
    // 清除描边包围盒缓存
    this._cacheBboxWithStroke = null;
    // 清除最小包围盒缓存
    this._cacheMinBbox = null;
  }

  // 记录被更新的属性键名
  private updatedKeys = new Set<string>();

  // 获取自上次调用以来被更新的属性，并清空更新键集合
  getUpdatedAttrs() {
    // 从当前属性中挑选出被标记为已更新的属性
    const attrs = pick(this.attrs, [...this.updatedKeys]);
    // 清空更新键集合
    this.updatedKeys.clear();
    // 返回被更新的属性对象
    return attrs;
  }

  // 更新图形属性
  updateAttrs(
    partialAttrs: Partial<GraphicsAttrs> & IAdvancedAttrs,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: { finishRecomputed?: boolean },
  ) {
    // TODO: 提示，x、y、rotation 不能和 transform 同时存在，否则效果不可预测
    // 如果属性变化会影响包围盒，则清除缓存
    if (this.shouldUpdateBbox(partialAttrs)) {
      this.clearBboxCache();
    }
    // 处理描边宽度为undefined的特殊情况
    if (
      'strokeWidth' in partialAttrs &&
      partialAttrs.strokeWidth === undefined
    ) {
      partialAttrs.strokeWidth = 1;
    }

    // 如果没有直接设置transform，则处理x、y坐标更新到变换矩阵中
    if (!partialAttrs.transform) {
      if (partialAttrs.x !== undefined || partialAttrs.y !== undefined) {
        // 克隆当前的变换矩阵
        const tf = cloneDeep(this.attrs.transform);
        // 更新变换矩阵中的x,y坐标
        if (partialAttrs.x) tf[4] = partialAttrs.x;
        if (partialAttrs.y) tf[5] = partialAttrs.y;
        // 更新图形属性中的变换矩阵
        this.attrs.transform = tf;
        // 记录transform属性已被更新
        this.updatedKeys.add('transform');
      }
    }
    // 处理旋转角度
    if (partialAttrs.rotate !== undefined) this.setRotate(partialAttrs.rotate);

    // 从属性对象中移除已处理的x、y、rotate属性，避免重复设置
    partialAttrs = omit(partialAttrs, 'x', 'y', 'rotate');
    // 遍历剩余的属性，更新到图形属性对象中
    for (const key in partialAttrs) {
      // 记录被更新的属性键名
      this.updatedKeys.add(key);
      // 使用类型断言更新属性值
      // eslint-disable-next-line @typescript-eslint/no-this-alias, @typescript-eslint/no-explicit-any
      (this.attrs as any)[key] = partialAttrs[key as keyof typeof partialAttrs];
    }

    // 如果启用了更新收集或者图形有父级，则收集更新的图形用于后续处理
    if (!this.noCollectUpdate || this.attrs.parentIndex) {
      this.doc.collectUpdatedGraphics(this.attrs.id);
    }
  }
  // 取消收集更新
  cancelCollectUpdate() {
    this.noCollectUpdate = true;
  }
  // 获取描边宽度
  getStrokeWidth() {
    return this.attrs.strokeWidth ?? 0;
  }

  // 获取包含描边扩展的图形包围盒，使用缓存优化性能
  getBboxWithStroke() {
    // 如果有缓存的包围盒，直接返回以提高性能
    if (this._cacheBboxWithStroke) return this._cacheBboxWithStroke;

    // 计算包含描边的包围盒：图形尺寸、变换矩阵和描边宽度的一半作为扩展
    const bbox = calcRectBbox(
      {
        ...this.getSize(),
        transform: this.getWorldTransform(),
      },
      this.getStrokeWidth() / 2,
    );
    // 缓存计算结果，避免重复计算
    this._cacheBboxWithStroke = bbox;
    // 返回包含描边的包围盒
    return bbox;
  }

  getBbox(): Readonly<IBox> {
    return calcRectBbox({
      ...this.getSize(),
      transform: this.getWorldTransform(),
    });
  }

  getLocalBbox(): Readonly<IBox> {
    if (this._cacheBbox) {
      return this._cacheBbox;
    }
    const bbox = calcRectBbox({
      ...this.getSize(),
      transform: this.attrs.transform,
    });
    this._cacheBbox = bbox;
    return bbox;
  }

  getMinBbox(): Readonly<IBox> {
    return this.getBbox();
  }

  getWorldBboxVerts(): IPoint[] {
    const rect = {
      x: 0,
      y: 0,
      width: this.attrs.width,
      height: this.attrs.height,
    };
    return rectToVertices(rect, this.getWorldTransform());
  }

  // 获取图形的本地坐标位置（相对于父容器的位置）
  getLocalPosition() {
    // 从变换矩阵中提取x、y坐标值
    return { x: this.attrs.transform[4], y: this.attrs.transform[5] };
  }

  getWorldPosition() {
    const tf = this.getWorldTransform();
    return { x: tf[4], y: tf[5] };
  }

  getX() {
    return this.attrs.transform[4];
  }

  getY() {
    return this.attrs.transform[5];
  }

  // 获取图形的尺寸
  getSize() {
    return { width: this.attrs.width, height: this.attrs.height };
  }
  // 获取图形的透明度
  getOpacity() {
    return this.attrs.opacity ?? 1;
  }
  // 获取图形的本地坐标矩形
  getRect() {
    return {
      ...this.getLocalPosition(),
      width: this.attrs.width,
      height: this.attrs.height,
    };
  }

  getTransformedSize() {
    return getTransformedSize(this.attrs);
  }

  getLocalCenter(): IPoint {
    const tf = new Matrix(...this.attrs.transform);
    return tf.apply({
      x: this.attrs.width / 2,
      y: this.attrs.height / 2,
    });
  }

  getWorldCenter(): IPoint {
    const tf = new Matrix(...this.getWorldTransform());
    return tf.apply({
      x: this.attrs.width / 2,
      y: this.attrs.height / 2,
    });
  }

  protected isStrokeShouldRender() {
    return isPaintsShouldRender(this.attrs.stroke);
  }

  protected isFillShouldRender() {
    return isPaintsShouldRender(this.attrs.fill);
  }

  hitTest(point: IPoint, tol = 0) {
    return isPointInTransformedRect(
      point,
      {
        ...this.getSize(),
        transform: this.getWorldTransform(),
      },
      tol + this.getStrokeWidth() / 2,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getHitGraphics(point: IPoint, options: IHitOptions): SuikaGraphics | null {
    const { tol = 0 } = options;
    if (
      !this.isVisible() ||
      this.isLock() ||
      (!this.isFillShouldRender() && !this.isStrokeShouldRender())
    ) {
      return null;
    }
    if (this.hitTest(point, tol)) {
      return this;
    }
    return null;
  }

  hitTestChildren(point: IPoint, padding = 0): boolean {
    if (!this.isContainer) {
      return this.hitTest(point, padding);
    }

    if (!this.hitTest(point, padding)) {
      return false;
    }
    const children = this.getChildren();
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].hitTest(point, padding)) {
        return true;
      }
    }
    return false;
  }

  intersectWithChildrenBox(box: IBox) {
    if (!this.isContainer) {
      return this.intersectWithBox(box);
    }
    if (!this.intersectWithBox(box)) {
      return false;
    }
    const children = this.getChildren();
    for (const child of children) {
      if (child.isVisible() && child.intersectWithBox(box)) {
        return true;
      }
    }
    return false;
  }

  /**
   * whether the element intersect with the box
   */
  intersectWithBox(box: IBox) {
    let isIntersected = false;
    if (!isBoxIntersect(box, this.getMinBbox())) {
      isIntersected = false;
    } else {
      const rotate = this.getRotate();
      if (!rotate || rotate % HALF_PI == 0) {
        isIntersected = true;
      } else {
        // OBB intersect
        // use SAT algorithm to check intersect
        const [s1, s2, s3, s4] = rectToVertices(
          boxToRect(box),
          invertMatrix(this.getWorldTransform()),
        );

        const minX = Math.min(s1.x, s2.x, s3.x, s4.x);
        const minY = Math.min(s1.y, s2.y, s3.y, s4.y);
        const maxX = Math.max(s1.x, s2.x, s3.x, s4.x);
        const maxY = Math.max(s1.y, s2.y, s3.y, s4.y);

        const rotatedSelection = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };

        isIntersected = isRectIntersect(rotatedSelection, {
          x: 0,
          y: 0,
          ...this.getSize(),
        });
      }
    }

    return isIntersected;
  }

  /**
   * whether the element contain with the rect
   */
  containWithBox(box: IBox) {
    const bbox = this.getMinBbox();
    return isBoxContain(box, bbox) || isBoxContain(bbox, box);
  }

  /**
   * calculate new attributes by control handle
   */
  calcNewAttrsByControlHandle(
    /** 'se' | 'ne' | 'nw' | 'sw' | 'n' | 'e' | 's' | 'w' */
    type: string,
    newPos: IPoint,
    oldRect: ITransformRect,
    oldWorldTransform: IMatrixArr,
    isShiftPressing = false,
    isAltPressing = false,
    flipWhenResize?: boolean,
  ): Partial<ATTRS> {
    const parentTf = this.getParentWorldTransform();
    oldRect = {
      width: oldRect.width,
      height: oldRect.height,
      transform: oldWorldTransform,
    };
    const rect =
      this.attrs.height === 0
        ? resizeLine(type, newPos, oldRect, {
            keepPolarSnap: isShiftPressing,
            scaleFromCenter: isAltPressing,
          })
        : resizeRect(type, newPos, oldRect, {
            keepRatio: isShiftPressing,
            scaleFromCenter: isAltPressing,
            flip: flipWhenResize,
          });
    rect.transform = multiplyMatrix(invertMatrix(parentTf), rect.transform);
    return rect as Partial<ATTRS>;
  }

  /**
   * update attributes by control handle
   * @param type
   * @param newPos
   * @param oldRect
   * @param isShiftPressing
   * @param isAltPressing
   * @param flipWhenResize
   * @returns if width or height is zero, return true; otherwise return undefined
   */
  updateByControlHandle(
    /** 'se' | 'ne' | 'nw' | 'sw' | 'n' | 'e' | 's' | 'w' */
    type: string,
    newPos: IPoint,
    oldRect: ITransformRect,
    oldWorldTransform: IMatrixArr,
    isShiftPressing = false,
    isAltPressing = false,
    flipWhenResize?: boolean,
  ) {
    const rect = this.calcNewAttrsByControlHandle(
      type,
      newPos,
      oldRect,
      oldWorldTransform,
      isShiftPressing,
      isAltPressing,
      flipWhenResize,
    );

    this.updateAttrs(rect, { finishRecomputed: true });
  }

  draw(drawInfo: IDrawInfo) {
    if (!this.isVisible()) return;

    const { ctx } = drawInfo;

    ctx.save();
    ctx.transform(...this.attrs.transform);
    for (const child of this.children) {
      child.draw(drawInfo);
    }
    ctx.restore();
  }

  drawOutline(
    ctx: CanvasRenderingContext2D,
    stroke: string,
    strokeWidth: number,
  ) {
    const { width, height } = this.attrs;
    ctx.transform(...this.getWorldTransform());
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.stroke();
    ctx.closePath();
  }

  /**
   * fill image
   *
   * reference: https://mp.weixin.qq.com/s/TSpZv_0VJtxPTCCzEqDl8Q
   */
  protected fillImage(
    ctx: CanvasRenderingContext2D,
    paint: PaintImage,
    imgManager: ImgManager,
    smooth = true,
    cornerRadius = 0,
  ) {
    const src = paint.attrs.src;
    const width = this.attrs.width;
    const height = this.attrs.height;
    const x = 0;
    const y = 0;
    let img: CanvasImageSource | undefined = undefined;

    // anti-aliasing
    ctx.imageSmoothingEnabled = smooth;

    if (src) {
      imgManager.addImg(src);
      img = imgManager.getImg(src);
    } else {
      ctx.imageSmoothingEnabled = false;
      img = DEFAULT_IMAGE;
    }

    if (!img) {
      return;
    }

    // reference: https://mp.weixin.qq.com/s/TSpZv_0VJtxPTCCzEqDl8Q
    const scale = calcCoverScale(img.width, img.height, width, height);

    const sx = img.width / 2 - width / scale / 2;
    const sy = img.height / 2 - height / scale / 2;

    if (cornerRadius) {
      ctx.save();
      drawRoundRectPath(ctx, x, y, width, height, cornerRadius);
      ctx.clip();
    }

    ctx.drawImage(
      img,
      sx,
      sy,
      width / scale,
      height / scale,
      x,
      y,
      width,
      height,
    );

    if (cornerRadius) {
      ctx.restore();
    }
  }

  static dMove(graphicsArr: SuikaGraphics[], dx: number, dy: number) {
    for (const graphics of graphicsArr) {
      const tf = graphics.getWorldTransform();
      tf[4] += dx;
      tf[5] += dy;
      graphics.setWorldTransform(tf);
    }
  }

  toJSON(): GraphicsAttrs {
    return { ...this.attrs };
  }

  isVisible() {
    return this.attrs.visible ?? true;
  }

  isLock() {
    return this.attrs.lock ?? false;
  }

  isDeleted() {
    return this._deleted;
  }

  setDeleted(val: boolean) {
    this._deleted = val;
    this.doc.collectDeletedGraphics(this);
  }

  /**
   * get simple info (for layer panel)
   */
  toObject(): IObject {
    return {
      type: this.type,
      id: this.attrs.id,
      name: this.attrs.objectName,
      visible: this.isVisible(),
      lock: this.isLock(),
      children: this.children.map((item) => item.toObject()),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getControlHandles(_zoom: number, _initial?: boolean): ControlHandle[] {
    return [];
  }

  getRotate() {
    return getTransformAngle(this.getWorldTransform());
  }

  getRotateDegree() {
    return rad2Deg(normalizeRadian(this.getRotate()));
  }

  // 设置图形的旋转角度，以指定的中心点为旋转轴
  setRotate(newRotate: number, center?: IPoint) {
    // 获取当前旋转角度
    const rotate = this.getRotate();
    // 计算旋转角度差值
    const delta = newRotate - rotate;
    // 如果没有指定旋转中心，则使用图形的世界坐标中心点
    center ??= this.getWorldCenter();
    // 创建旋转变换矩阵：先平移到原点，再旋转，最后平移回原位置
    const rotateMatrix = new Matrix()
      .translate(-center.x, -center.y)
      .rotate(delta)
      .translate(center.x, center.y);
    // 将旋转变换矩阵应用到图形的变换矩阵前缀
    this.prependWorldTransform(rotateMatrix.getArray());
  }

  prependWorldTransform(m: IMatrixArr) {
    const parentTf = this.getParentWorldTransform();
    const tf = multiplyMatrix(
      m,
      multiplyMatrix(parentTf, this.attrs.transform),
    );
    this.updateAttrs(
      recomputeTransformRect({
        ...this.getSize(),
        transform: multiplyMatrix(invertMatrix(parentTf), tf),
      }),
    );
  }

  dRotate(dRotation: number, originWorldTf: IMatrixArr, center: IPoint) {
    const rotateMatrix = new Matrix()
      .translate(-center.x, -center.y)
      .rotate(dRotation)
      .translate(center.x, center.y);

    const newWoldTf = rotateMatrix
      .append(new Matrix(...originWorldTf))
      .getArray();

    this.setWorldTransform(newWoldTf);
  }

  getInfoPanelAttrs(): {
    label: string;
    key: string;
    value: number;
    uiType: string;
    suffixValue?: string;
  }[] {
    const size = this.getTransformedSize();
    const pos = this.getWorldPosition();
    return [
      {
        label: 'X',
        key: 'x',
        value: pos.x,
        uiType: 'number',
      },
      {
        label: 'Y',
        key: 'y',
        value: pos.y,
        uiType: 'number',
      },
      {
        label: 'W',
        key: 'width',
        value: size.width,
        uiType: 'number',
      },
      {
        label: 'H',
        key: 'height',
        value: size.height,
        uiType: 'number',
      },
      {
        label: 'R',
        key: 'rotation',
        value: this.getRotateDegree(),
        suffixValue: '°',
        uiType: 'number',
      },
    ];
  }

  toSVGSegment(offset?: IPoint) {
    const tagHead = this.getSVGTagHead();
    console.log(offset);
    if (!tagHead) {
      console.warn(
        `please implement getSVGTagHead method of "${this.type}" type`,
      );
      return '';
    }

    // TODO: precision config
    const fillAndStrokeAttrs: IFillStrokeSVGAttrs[] = [];

    const { fillPaints, strokePaints } = this.getFillAndStrokesToSVG();
    // TODO: do not to SVG if paints is empty
    if (fillPaints.length <= 1 && strokePaints.length <= 1) {
      const fillPaint = fillPaints[0];
      if (fillPaint) {
        const rect: IFillStrokeSVGAttrs = {};
        if (fillPaint.type === PaintType.Solid) {
          rect.fill = '#' + parseRGBToHex(fillPaint.attrs);
          const opacity = fillPaint.attrs.a;
          if (opacity !== 1) {
            rect['fill-opacity'] = opacity;
          }
        }
        fillAndStrokeAttrs.push(rect);
        // TODO: solve image
      }
      const strokePaint = strokePaints[0];
      if (strokePaint) {
        const rect: IFillStrokeSVGAttrs = {};
        if (strokePaint.type === PaintType.Solid) {
          rect.stroke = '#' + parseRGBToHex(strokePaint.attrs);
          const opacity = strokePaint.attrs.a;
          if (opacity !== 1) {
            rect['stroke-opacity'] = opacity;
          }
        }
        fillAndStrokeAttrs.push(rect);
      }
    } else {
      for (const fillPaint of fillPaints) {
        if (fillPaint) {
          if (fillPaint.type === PaintType.Solid) {
            const rect: IFillStrokeSVGAttrs = {
              fill: '#' + parseRGBToHex(fillPaint.attrs),
            };
            const opacity = fillPaint.attrs.a;
            if (opacity !== 1) {
              rect['fill-opacity'] = opacity;
            }
            fillAndStrokeAttrs.push(rect);
          }
        }
      }
      for (const strokePaint of strokePaints) {
        if (strokePaint) {
          if (strokePaint.type === PaintType.Solid) {
            const rect: IFillStrokeSVGAttrs = {
              stroke: '#' + parseRGBToHex(strokePaint.attrs),
            };
            const opacity = strokePaint.attrs.a;
            if (opacity !== 1) {
              rect['stroke-opacity'] = opacity;
            }
            fillAndStrokeAttrs.push(rect);
          }
        }
      }
    }

    const strokeWidth = this.attrs.strokeWidth ?? 0;
    const strokeWidthStr =
      strokeWidth > 1 ? ` stroke-width="${strokeWidth}"` : '';

    let content = '';
    const tagTail = this.getSVGTagTail();
    for (const attrs of fillAndStrokeAttrs) {
      let fillAndStrokeStr = '';
      let key: keyof typeof attrs;
      for (key in attrs) {
        fillAndStrokeStr += ` ${key}="${attrs[key]}"`;
      }
      content += tagHead + fillAndStrokeStr + strokeWidthStr + tagTail;
    }

    return content;
  }

  protected getSVGTagHead() {
    return '';
  }

  protected getSVGTagTail() {
    return '/>\n';
  }

  protected getFillAndStrokesToSVG() {
    return {
      fillPaints: this.attrs.fill ?? [],
      strokePaints: this.attrs.stroke ?? [],
    };
  }

  getLayerIconPath() {
    return 'M0.5 0.5H11.5V11.5H0.5V0.5Z';
  }

  /**
   * 获取图形的世界变换矩阵
   * @returns { IMatrixArr } 世界变换矩阵
   */
  getWorldTransform(): IMatrixArr {
    // 获取图形父级
    const parent = this.getParent();
    // 如果父级存在，则返回父级世界变换矩阵与当前图形变换矩阵的乘积
    if (parent) {
      return multiplyMatrix(parent.getWorldTransform(), this.attrs.transform);
    }
    // 如果父级不存在，则返回当前图形变换矩阵
    return [...this.attrs.transform];
  }

  protected children: SuikaGraphics[] = [];
  protected isContainer = false;

  getChildren() {
    if (!this.isContainer) {
      return [];
    }
    if (this._sortDirty) {
      this.sortChildren();
    }
    return [...this.children];
  }

  getChildrenCount() {
    return this.children.length;
  }

  setChildren(graphs: SuikaGraphics[]) {
    if (!this.isContainer) {
      return;
    }

    const sortKeys = generateNKeysBetween(null, null, graphs.length);
    for (let i = 0; i < graphs.length; i++) {
      const el = graphs[i];
      el.updateAttrs({
        parentIndex: {
          guid: this.attrs.id,
          position: sortKeys[i],
        },
      });
    }
  }

  insertAtParent(position: string) {
    const parent = this.getParent();
    if (parent) {
      parent.insertChild(this, position);
    }
  }
  /**
   * 用于将图形插入到容器图形中，维护父子关系和排序索引。
   * @param graphics 要插入的图形
   * @param sortIdx 排序索引
   * @returns
   */
  insertChild(graphics: SuikaGraphics, sortIdx?: string) {
    // 只有容器图形（如 Canvas、Frame）才能插入子图形
    if (!this.isContainer) {
      console.warn(`graphics "${this.type}" is not container`);
      return;
    }
    // 如果子图形已存在，跳过插入
    if (this.children.some((item) => item.attrs.id === graphics.attrs.id)) {
      // 如果提供了 sortIdx，仍进行排序（可能改变顺序）
      if (sortIdx) {
        this.sortChildren();
      }
      return;
    }
    if (!sortIdx) {
      const maxSortIdx = this.getMaxChildIndex();
      sortIdx = generateKeyBetween(maxSortIdx, null);
    }

    graphics.removeFromParent(); // 这个应该要删除？
    const newParentIndex = {
      guid: this.attrs.id,
      position: sortIdx,
    };
    if (!isEqual(graphics.attrs.parentIndex, newParentIndex)) {
      graphics.updateAttrs({
        parentIndex: newParentIndex,
      });
    }

    this.children.push(graphics);
    if (sortIdx) {
      // TODO: 考虑 this._sortDirty 标记为 true，然后找个合适的时机再排序，减少图形重复地调用 sortChildren
      this.sortChildren();
    }
  }

  removeChild(graphics: SuikaGraphics) {
    this.children = this.children.filter(
      (item) => item.attrs.id !== graphics.attrs.id,
    );
  }

  markSortDirty() {
    this._sortDirty = true;
  }

  sortChildren() {
    SuikaGraphics.sortGraphicsArray(this.children);
  }

  static sortGraphicsArray(graphicsArr: SuikaGraphics[]) {
    graphicsArr.sort((a, b) => {
      return (a.attrs.parentIndex?.position ?? '') <
        (b.attrs.parentIndex?.position ?? '')
        ? -1
        : 1;
    });
    return graphicsArr;
  }

  // 获取当前图形的父图形ID
  getParentId() {
    return this.attrs.parentIndex?.guid;
  }

  // 获取当前图形的父图形对象
  getParent() {
    // 获取父图形的ID标识符
    const parentId = this.getParentId();
    // 如果没有父图形ID（说明是根层级图形），返回undefined
    if (!parentId) return undefined;
    // 通过文档对象根据ID查找并返回父图形对象
    return this.doc.getGraphicsById(parentId);
  }

  getParentWorldTransform() {
    const parent = this.getParent();
    return parent ? parent.getWorldTransform() : identityMatrix();
  }

  removeFromParent() {
    const parent = this.getParent();
    if (parent) {
      parent.removeChild(this);
    }
  }

  getMaxChildIndex() {
    if (this.children.length === 0) {
      return null;
    }
    if (!this._sortDirty) {
      return this.children.at(-1)!.getSortIndex() ?? null;
    }
    let maxIndex = this.children[0].getSortIndex()!;
    for (let i = 1; i < this.children.length; i++) {
      const currIndex = this.children[i].getSortIndex();
      if (currIndex > maxIndex) {
        maxIndex = currIndex;
      }
    }
    return maxIndex;
  }

  getMinChildIndex() {
    if (this.children.length === 0) {
      return null;
    }
    if (!this._sortDirty) {
      return this.children.at(0)!.getSortIndex() ?? null;
    }
    let minIndex = this.children[0].getSortIndex()!;
    for (let i = 1; i < this.children.length; i++) {
      const currIndex = this.children[i].getSortIndex();
      if (currIndex < minIndex) {
        minIndex = currIndex;
      }
    }
    return minIndex;
  }

  // 获取当前图形的排序索引位置
  getSortIndex() {
    // 返回图形在父容器中的位置索引
    return this.attrs.parentIndex?.position ?? '';
  }

  getNextSibling() {
    const parent = this.getParent();
    if (!parent) {
      return null;
    }
    const children = parent.getChildren();
    const index = children.findIndex((item) => item === this);
    if (index == -1) {
      console.warn('index should not be -1!');
    }
    return children[index + 1] ?? null;
  }

  // 获取从当前图形节点到根节点的完整排序索引路径
  getSortIndexPath() {
    const path: string[] = [];

    // 从当前节点开始遍历
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: SuikaGraphics | undefined = this;
    // 向上遍历到根节点，收集每个层级的排序索引
    while (node) {
      // 将当前节点的排序索引添加到路径数组
      path.push(node.getSortIndex());
      // 移动到父节点，继续向上遍历
      node = node.getParent();
    }
    // 从根节点到当前节点的顺序排列
    path.reverse();
    return path;
  }

  /* 为什么需要这样处理？

    画板根层级
    ├── 图形A (sortIndex: "a")
    ├── 组1 (sortIndex: "b") 
    │   ├── 图形B (sortIndex: "a1")
    │   └── 图形C (sortIndex: "a2")
    └── 图形D (sortIndex: "c")

  getSortIndexPath() 返回的是从根节点到当前节点的完整路径：
    图形A: ["a"]
    图形B: ["b", "a1"] (组1的索引 + 在组内的索引)
    图形C: ["b", "a2"]

  理由：
  图形的绘制顺序决定了哪些图形显示在前面，哪些被覆盖。排序算法需要确保：
    路径 ["a"] 的图形绘制在路径 ["b", "a1"] 之前
    同组内的 ["b", "a1"] 绘制在 ["b", "a2"] 之前
  

  */

  // 按照图形在层级结构中的排序索引路径对图形数组进行排序
  static sortGraphics(graphics: SuikaGraphics[]) {
    // 将每个图形映射为包含排序路径和图形对象的元素，用于后续排序
    const elements = graphics.map((item) => ({
      path: item.getSortIndexPath(),
      val: item,
    }));

    // 按照排序路径进行比较排序，确保图形按正确的层级顺序排列
    elements.sort((a, b) => {
      // 获取两个路径中的最大长度作为比较循环的上限
      const len = Math.max(a.path.length, b.path.length);
      // 从路径的第一个索引开始逐级比较
      // 父级优先: 如果 ["a"] vs ["b", "x"]，比较第一级 "a" < "b"，直接返回结果
      // 同父级排序: 如果 ["b", "a1"] vs ["b", "a2"]，第一级相同，继续比较第二级
      for (let i = 0; i < len; i++) {
        const sortIdxA = a.path[i];
        const sortIdxB = b.path[i];
        // 如果当前级别的排序索引相等，继续比较下一级别
        if (sortIdxA === sortIdxB) {
          continue;
        }
        // 返回较小排序索引的元素优先排列
        return sortIdxA < sortIdxB ? -1 : 1;
      }
      // 如果所有级别的排序索引都相等，则路径较短的元素优先排列
      // 当所有级别的索引都相同时，路径较短的元素优先。这确保了：
      // 父级容器始终排在子元素之前
      // 避免了排序的不确定性
      return a.path.length < b.path.length ? -1 : 1;
    });
    // 返回排序后的图形对象数组，丢弃临时创建的路径信息
    return elements.map((item) => item.val);
  }

  containAncestor(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: SuikaGraphics | undefined = this;
    while (node) {
      if (node.attrs.id === id) {
        return true;
      }
      node = node.getParent();
    }
    return false;
  }

  forEachParent(
    callback: (
      graphics: SuikaGraphics,
      breakLoop: () => void,
    ) => boolean | void,
  ) {
    let breakFlag = false;
    const breakLoop = () => {
      breakFlag = true;
    };

    let node = this.getParent();
    while (node) {
      callback(node, breakLoop);
      if (breakFlag) break;
      node = node.getParent();
    }
  }

  getParentIds() {
    const ids: string[] = [];
    this.forEachParent((node) => {
      ids.push(node.attrs.id);
    });
    return ids;
  }

  getFrameParentIds() {
    const ids: string[] = [];
    this.forEachParent((node, breakLoop) => {
      if (node.type === GraphicsType.Canvas) {
        breakLoop();
        return;
      }
      ids.push(node.attrs.id);
    });
    return ids;
  }

  setWorldTransform(worldTf: IMatrixArr) {
    const parentTf = this.getParentWorldTransform();
    const localTf = multiplyMatrix(invertMatrix(parentTf), worldTf);
    this.updateAttrs({
      transform: localTf,
    });
  }

  forEachVisibleChildNode(callback: (graphics: SuikaGraphics) => void) {
    if (!this.isVisible()) {
      return;
    }
    for (const child of this.children) {
      child.forEachVisibleChildNode(callback);
    }
    callback(this);
  }
}
