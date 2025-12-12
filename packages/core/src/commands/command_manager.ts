import { EventEmitter } from '@suika/common';

import { type SuikaEditor } from '../editor';
import { type ICommand } from './type';

export interface IHistoryStatus {
  canRedo: boolean; // 是否可以重做
  canUndo: boolean; // 是否可以撤销
}

interface Events {
  change(status: IHistoryStatus): void;
  beforeExecCmd(): void;
}

interface ICommandItem {
  command: ICommand; // 命令
  /** consider the continue commands marked "isBatched" as one macro command */
  isBatched?: boolean; // 是否批量命令
  // 钩子函数
  hooks?: { beforeRedo?: () => void; beforeUndo?: () => void };
}

// 命令管理器
export class CommandManager {
  // 重做栈
  private redoStack: ICommandItem[] = [];
  // 撤销栈
  private undoStack: ICommandItem[] = [];
  // 是否启用撤销/重做功能
  private isEnableRedoUndo = true;
  // 是否正在批量执行命令
  private isBatching = false;

  private emitter = new EventEmitter<Events>();
  constructor(private editor: SuikaEditor) {}
  // 重做
  redo() {
    if (!this.isEnableRedoUndo) return;

    // 重做栈不为空
    if (this.redoStack.length > 0) {
      // 获取操作命令
      const topCmdItem = this.redoStack.pop()!;
      // 获取是否批量执行
      const isBatched = topCmdItem.isBatched;
      // 创建命令项数组
      const cmdItems: ICommandItem[] = [topCmdItem];
      // 命令是批量执行
      if (isBatched) {
        while (this.redoStack.length > 0 && this.redoStack.at(-1)!.isBatched) {
          const currCmdItem = this.redoStack.pop()!;
          cmdItems.push(currCmdItem);
        }
        console.log('------- [redo] batched start -----');
      }
      // 遍历命令,执行响应的重做命令
      for (const cmdItem of cmdItems) {
        const command = cmdItem.command;
        console.log(
          `%c Redo %c [${command.desc}]`,
          'background: #f04; color: #ee0',
          '',
        );
        // 将命令添加到撤销栈中
        this.undoStack.push(cmdItem);
        // 执行命令前的钩子函数
        cmdItem.hooks?.beforeRedo?.();
        // 执行命令
        command.redo();
      }
      if (isBatched) console.log('------- [redo] batched end -----');
      // 渲染编辑器
      this.editor.render();
      // 发出状态变化事件
      this.emitStatusChange();
    }
  }
  // 撤销
  undo() {
    if (!this.isEnableRedoUndo) return;

    // 撤销栈不为空
    if (this.undoStack.length > 0) {
      // 获取操作命令
      const topCmdItem = this.undoStack.pop()!;
      // 命令是否批量执行
      const isBatched = topCmdItem.isBatched;
      // 创建命令数组
      const cmdItems: ICommandItem[] = [topCmdItem];
      // 命令是批量执行
      if (isBatched) {
        while (this.undoStack.length > 0 && this.undoStack.at(-1)!.isBatched) {
          const currCmdItem = this.undoStack.pop()!;
          cmdItems.push(currCmdItem);
        }
      }
      // 遍历命令,执行响应的撤销命令
      for (const cmdItem of cmdItems) {
        const command = cmdItem.command;
        console.log(
          `%c Undo %c [${command.desc}]`,
          'background: #40f; color: #eee',
          '',
        );
        // 将命令添加到重做栈中
        this.redoStack.push(cmdItem);
        // 执行命令前的钩子函数
        cmdItem.hooks?.beforeUndo?.();
        // 执行命令
        command.undo();
      }
      // 命令是批量执行
      if (isBatched) console.log('------- [undo] batched end -----');
      // 渲染编辑器
      this.editor.render();
      // 发出状态变化事件
      this.emitStatusChange();
    }
  }
  // 启用撤销/重做功能
  enableRedoUndo() {
    this.isEnableRedoUndo = true;
  }
  // 禁用撤销/重做功能
  disableRedoUndo() {
    this.isEnableRedoUndo = false;
  }
  // 开始批量执行命令
  batchCommandStart() {
    this.isBatching = true;
  }
  // 结束批量执行命令
  batchCommandEnd() {
    this.isBatching = false;
  }
  // 推入命令
  pushCommand(
    command: ICommand,
    hooks?: { beforeRedo?: () => void; beforeUndo?: () => void },
  ) {
    // 发出开始执行命令事件
    this.emitter.emit('beforeExecCmd');
    // 执行命令
    console.log(
      `%c Exec %c [${command.desc}]`,
      'background: #222; color: #bada55',
      '',
    );
    // 创建命令项
    const commandItem: ICommandItem = { command };
    // 如果正在批量执行命令，则将命令标记为批量命令
    if (this.isBatching) commandItem.isBatched = true;
    // 如果钩子函数存在，则添加到命令项中
    if (hooks) commandItem.hooks = hooks;
    // 将命令项添加到撤销栈中
    this.undoStack.push(commandItem);
    // 清空重做栈
    this.redoStack = [];
    // 发出状态变化事件
    this.emitStatusChange();
  }
  // 发出状态变化事件
  private emitStatusChange() {
    this.emitter.emit('change', {
      canRedo: this.redoStack.length > 0,
      canUndo: this.undoStack.length > 0,
    });
  }
  on<T extends keyof Events>(eventName: T, listener: Events[T]) {
    this.emitter.on(eventName, listener);
  }
  off<T extends keyof Events>(eventName: T, listener: Events[T]) {
    this.emitter.off(eventName, listener);
  }
  // 清除撤销/重做记录
  clearRecords() {
    this.redoStack = [];
    this.undoStack = [];
    this.emitStatusChange();
  }
}
