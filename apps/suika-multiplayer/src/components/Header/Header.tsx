import './Header.scss';

import { type FC } from 'react';

import { LocaleSelector } from '../LocaleSelector';
import { ZoomActions } from '../ZoomActions';
import Title from './components/Title';
import { ToolBar } from './components/Toolbar';

interface IProps {
  title: string;
}

export const Header: FC<IProps> = ({ title }) => {
  return (
    <div className="sk-header">
      {/* 工具栏 */}
      <ToolBar />
      {/* 标题 */}
      <Title value={title} />
      {/* 右侧区域 */}
      <div className="sk-right-area">
        {/* 语言选择器 */}
        <LocaleSelector />
        {/* 缩放操作 */}
        <ZoomActions />
      </div>
    </div>
  );
};
