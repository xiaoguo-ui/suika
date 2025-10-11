import './Editor.scss';

import { pick, throttle } from '@suika/common';
import { type SettingValue, SuikaEditor } from '@suika/core';
import { type FC, useEffect, useRef, useState } from 'react';

import { EditorContext } from '../context';
import { AutoSaveGraphics } from '../store/auto-save-graphs';
import { ContextMenu } from './ContextMenu';
import { Header } from './Header';
import { InfoPanel } from './InfoPanel';
import { LayerPanel } from './LayerPanel';

const topMargin = 48;
const leftRightMargin = 240 * 2;

const USER_PREFERENCE_KEY = 'suika-user-preference';
const storeKeys: Partial<keyof SettingValue>[] = [
  'enablePixelGrid',
  'snapToGrid',
  'enableRuler',

  'keepToolSelectedAfterUse',
  'invertZoomDirection',
  'highlightLayersOnHover',
  'flipObjectsWhileResizing',
  'snapToObjects',
];

const Editor: FC = () => {
  /**
   * 画板容器
   */
  const containerRef = useRef<HTMLDivElement>(null);

  const [editor, setEditor] = useState<SuikaEditor | null>(null);

  useEffect(() => {
    // 容器初始化成功
    if (containerRef.current) {
      // 获取用户偏好设置
      const userPreferenceEncoded = localStorage.getItem(USER_PREFERENCE_KEY);
      const userPreference = userPreferenceEncoded
        ? (JSON.parse(userPreferenceEncoded) as Partial<SettingValue>)
        : undefined;
      // 创建编辑器
      const editor = new SuikaEditor({
        containerElement: containerRef.current, // 画板容器
        width: document.body.clientWidth - leftRightMargin, // 画板宽度
        height: document.body.clientHeight - topMargin, // 画板高度
        offsetY: 48, // 画板偏移量
        offsetX: 240, // 画板偏移量
        showPerfMonitor: false, // 是否显示性能监控
        userPreference: userPreference, // 用户偏好设置
      });
      // 监听设置的更新
      editor.setting.on(
        'update',
        (value: SettingValue, changedKey: keyof SettingValue) => {
          // 如果设置的 key 不在 storeKeys 中，则不更新
          if (!storeKeys.includes(changedKey)) return;

          // 更新 localStorage
          localStorage.setItem(
            USER_PREFERENCE_KEY,
            JSON.stringify(pick(value, storeKeys)),
          );
        },
      );
      // 将编辑器实例挂载到 window 上
      (window as any).editor = editor;
      // 初始化自动保存
      new AutoSaveGraphics(editor);
      // 监听画板大小变化
      const changeViewport = throttle(
        () => {
          editor.viewportManager.setViewport({
            width: document.body.clientWidth - leftRightMargin,
            height: document.body.clientHeight - topMargin,
          });
          editor.render();
        },
        10,
        { leading: false },
      );
      // 监听浏览器大小变化
      window.addEventListener('resize', changeViewport);
      // 设置编辑器实例
      setEditor(editor);

      return () => {
        editor.destroy(); // 注销事件
        // 移除监听画板大小变化
        window.removeEventListener('resize', changeViewport);
        changeViewport.cancel();
      };
    }
  }, [containerRef]);

  return (
    <div>
      <EditorContext.Provider value={editor}>
        <Header title="suika" />
        {/* body */}
        <div className="body">
          {/* 左边图层面板 */}
          <LayerPanel />
          {/* 画板 */}
          <div
            ref={containerRef}
            style={{ position: 'absolute', left: 240, top: 0 }}
          />
          {/* 右边信息面板 */}
          <InfoPanel />
          {/* 右边右键菜单 */}
          <ContextMenu />
        </div>
      </EditorContext.Provider>
    </div>
  );
};

export default Editor;
