import { EventEmitter } from '@suika/common';

import { type SuikaEditor } from '../editor';
import { type ICommand } from './type';

export interface IHistoryStatus {
  canRedo: boolean;
  canUndo: boolean;
}

interface Events {
  change(status: IHistoryStatus): void;
  beforeExecCmd(): void;
}

interface ICommandItem {
  command: ICommand;
  /** consider the continue commands marked "isBatched" as one macro command */
  isBatched?: boolean;
  hooks?: {
    beforeRedo?: () => void;
    beforeUndo?: () => void;
  };
}

/**
 * Command Manager
 *
 * reference: https://mp.weixin.qq.com/s/JBhXeFPTw8O34vOtk05cQg
 */
export class CommandManager {
  private redoStack: ICommandItem[] = [];
  private undoStack: ICommandItem[] = [];
  /**
   * 是否启用撤销/重做功能
   */
  private isEnableRedoUndo = true;
  private emitter = new EventEmitter<Events>();
  private isBatching = false;

  constructor(private editor: SuikaEditor) {}
  /**
   * 重做
   * @returns
   */
  redo() {
    // 如果撤销/重做功能被禁用，则返回
    if (!this.isEnableRedoUndo) {
      return;
    }
    // 如果重做栈不为空，则重做
    if (this.redoStack.length > 0) {
      // 获取重做栈顶命令
      const topCmdItem = this.redoStack.pop()!;
      // 获取是否批量执行
      const isBatched = topCmdItem.isBatched;
      // 创建命令项数组
      const cmdItems: ICommandItem[] = [topCmdItem];
      // 如果命令是批量执行，则重做所有连续的批量命令
      if (isBatched) {
        // if the command is batched, redo all the commands marked "isBatched"
        // 从重做栈中弹出所有连续的批量命令
        while (this.redoStack.length > 0 && this.redoStack.at(-1)!.isBatched) {
          // 获取当前命令项
          const currCmdItem = this.redoStack.pop()!;
          // 将当前命令项添加到命令项数组中
          cmdItems.push(currCmdItem);
        }
        // 打印批量重做开始
        console.log('------- [redo] batched start -----');
      }

      // 遍历命令项数组
      for (const cmdItem of cmdItems) {
        // 获取命令
        const command = cmdItem.command;
        // 打印重做命令
        console.log(
          `%c Redo %c [${command.desc}]`,
          'background: #f04; color: #ee0',
          '',
        );
        // 将命令项添加到撤销栈中
        this.undoStack.push(cmdItem);
        // 执行命令前的钩子函数
        cmdItem.hooks?.beforeRedo?.();
        // 执行命令
        command.redo();
      }

      if (isBatched) {
        console.log('------- [redo] batched end -----');
      }

      this.editor.render();
      this.emitStatusChange();
    }
  }
  /**
   * 撤销
   */
  undo() {
    // 如果撤销/重做功能被禁用，则返回
    if (!this.isEnableRedoUndo) {
      return;
    }
    // 如果撤销栈不为空，则撤销
    if (this.undoStack.length > 0) {
      // 获取撤销栈顶命令
      const topCmdItem = this.undoStack.pop()!;
      // 获取是否批量执行
      const isBatched = topCmdItem.isBatched;
      // 创建命令项数组
      const cmdItems: ICommandItem[] = [topCmdItem];
      // 如果命令是批量执行，则撤销所有连续的批量命令
      if (isBatched) {
        // if the command is batched, undo all the commands marked "isBatched"
        // 从撤销栈中弹出所有连续的批量命令
        while (this.undoStack.length > 0 && this.undoStack.at(-1)!.isBatched) {
          // 获取当前命令项
          const currCmdItem = this.undoStack.pop()!;
          // 将当前命令项添加到命令项数组中
          cmdItems.push(currCmdItem);
        }
        console.log('------- [undo] batched start -----');
      }
      // 遍历命令项数组
      for (const cmdItem of cmdItems) {
        // 获取命令
        const command = cmdItem.command;
        // 打印撤销命令
        console.log(
          `%c Undo %c [${command.desc}]`,
          'background: #40f; color: #eee',
          '',
        );
        // 将命令项添加到重做栈中
        this.redoStack.push(cmdItem);
        // 执行命令前的钩子函数
        cmdItem.hooks?.beforeUndo?.();
        // 执行命令
        command.undo();
      }
      // 如果命令是批量执行，则打印批量撤销结束
      if (isBatched) {
        console.log('------- [undo] batched end -----');
      }
      // 渲染编辑器
      this.editor.render();
      // 发出状态变化事件
      this.emitStatusChange();
    }
  }
  enableRedoUndo() {
    this.isEnableRedoUndo = true;
  }
  disableRedoUndo() {
    this.isEnableRedoUndo = false;
  }
  batchCommandStart() {
    this.isBatching = true;
  }
  batchCommandEnd() {
    this.isBatching = false;
  }
  pushCommand(
    command: ICommand,
    hooks?: {
      beforeRedo?: () => void;
      beforeUndo?: () => void;
    },
  ) {
    this.emitter.emit('beforeExecCmd');
    console.log(
      `%c Exec %c [${command.desc}]`,
      'background: #222; color: #bada55',
      '',
    );
    const commandItem: ICommandItem = { command };
    if (this.isBatching) {
      commandItem.isBatched = true;
    }
    if (hooks) {
      commandItem.hooks = hooks;
    }
    this.undoStack.push(commandItem);
    this.redoStack = [];
    this.emitStatusChange();
  }
  /**
   * 发出状态变化事件
   */
  private emitStatusChange() {
    // 发出状态变化事件
    this.emitter.emit('change', {
      // 是否可以重做
      canRedo: this.redoStack.length > 0,
      // 是否可以撤销
      canUndo: this.undoStack.length > 0,
    });
  }
  on<T extends keyof Events>(eventName: T, listener: Events[T]) {
    this.emitter.on(eventName, listener);
  }
  off<T extends keyof Events>(eventName: T, listener: Events[T]) {
    this.emitter.off(eventName, listener);
  }
  clearRecords() {
    this.redoStack = [];
    this.undoStack = [];
    this.emitStatusChange();
  }
}
