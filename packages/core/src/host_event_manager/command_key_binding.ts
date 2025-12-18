import { type SuikaEditor } from '../editor';
import {
  isFrameGraphics,
  type SuikaGraphics,
  SuikaPath,
  SuikaText,
} from '../graphics';
import {
  alignAndRecord,
  arrangeAndRecord,
  flipHorizontalAndRecord,
  flipVerticalAndRecord,
  MutateGraphsAndRecord,
  ungroupAndRecord,
} from '../service';
import { groupAndRecord } from '../service/group_and_record';
import { AlignType, ArrangeType } from '../type';

export class CommandKeyBinding {
  // 判断是否绑定
  private isBound = false;

  constructor(private editor: SuikaEditor) {}

  bindKey() {
    // 判断是否已经绑定
    if (this.isBound) {
      console.warn('CommandKeyBinding has been bound, please destroy it first');
      return;
    }
    // 设置绑定状态：绑定过！
    this.isBound = true;
    const editor = this.editor;

    // undo 撤销快捷键 快捷键：Command + Z (Mac) / Ctrl + Z (Windows)
    const undoAction = () => editor.commandManager.undo();
    editor.keybindingManager.register({
      key: { metaKey: true, keyCode: 'KeyZ' }, // Command + Z (Mac)
      winKey: { ctrlKey: true, keyCode: 'KeyZ' }, // Ctrl + Z (Windows)
      when: (ctx) => !ctx.isToolDragging, // 非拖拽状态下生效
      actionName: 'Undo', // 撤销
      action: undoAction, // 撤销操作
    });

    // redo 重做快捷键 快捷键：Command + Shift + Z (Mac) / Ctrl + Shift + Z (Windows)
    const redoAction = () => editor.commandManager.redo();
    editor.keybindingManager.register({
      key: { metaKey: true, shiftKey: true, keyCode: 'KeyZ' }, // Command + Shift + Z (Mac)
      winKey: { ctrlKey: true, shiftKey: true, keyCode: 'KeyZ' }, // Ctrl + Shift + Z (Windows)
      when: (ctx) => !ctx.isToolDragging, // 非拖拽状态下生效
      actionName: 'Redo', // 重做
      action: redoAction, // 重做操作
    });

    // delete 删除快捷键 快捷键：Backspace (Mac) / Delete (Windows)
    const deleteAction = () => {
      // TODO: 一些情况要考虑是否允许删除操作，以及允许删除的处理方案
      // 绘制图形中、对图形旋转或缩放时
      if (editor.hostEventManager.isEnableDelete) {
        editor.selectedElements.removeFromScene();
      }
    };
    editor.keybindingManager.register({
      key: [{ keyCode: 'Backspace' }, { keyCode: 'Delete' }], // Backspace (Mac) / Delete (Windows)
      when: (ctx) => !ctx.isToolDragging, // 非拖拽状态下生效
      actionName: 'Delete', // 删除
      action: deleteAction, // 删除操作
    });

    // select all 全选快捷键 快捷键：Command + A (Mac) / Ctrl + A (Windows)
    const selectAllAction = () => {
      editor.selectedElements.selectAll();
      editor.render();
    };
    editor.keybindingManager.register({
      key: { metaKey: true, keyCode: 'KeyA' }, // Command + A (Mac) / Ctrl + A (Windows)
      winKey: { ctrlKey: true, keyCode: 'KeyA' }, // Ctrl + A (Windows)
      actionName: 'Select All', // 全选
      action: selectAllAction, // 全选操作
    });

    // switch to default select tool 切换到默认选择工具 快捷键：Escape
    // or cancel select(when in select tool)
    const setDefaultToolOrCancelSelectAction = () => {
      // 如果当前工具是选择工具，则取消选择
      if (this.editor.toolManager.getActiveToolName() === 'select') {
        editor.selectedElements.clear();
      } else {
        // 如果当前工具不是选择工具，则切换到选择工具
        this.editor.toolManager.setActiveTool('select');
      }
      // 渲染编辑器
      editor.render();
    };
    editor.keybindingManager.register({
      key: { keyCode: 'Escape' }, // Escape
      when: (ctx) => !ctx.isToolDragging, // 非拖拽状态下生效
      actionName: 'Back to Select Tool or Cancel Select', // 返回选择工具或取消选择
      action: setDefaultToolOrCancelSelectAction, // 返回选择工具或取消选择操作
    });

    /********** Ruler **********/
    // toggle ruler
    const toggleRulersAction = () => {
      // 切换标尺
      editor.setting.set('enableRuler', !editor.setting.get('enableRuler'));
      // 渲染编辑器
      editor.render();
    };
    editor.keybindingManager.register({
      key: { shiftKey: true, keyCode: 'KeyR' }, // Shift + R
      actionName: 'Toggle Rulers', // 切换标尺
      action: toggleRulersAction, // 切换标尺操作
    });

    /*************** Zoom **************/
    // zoom to fit
    const zoomToFitAction = () => {
      editor.zoomManager.zoomToFit(); // 缩放到适合
      // 渲染编辑器
      editor.render();
    };
    editor.keybindingManager.register({
      key: { shiftKey: true, keyCode: 'Digit1' }, // Shift + 1
      actionName: 'Zoom To Fit', // 缩放到适合
      action: zoomToFitAction, // 缩放到适合
    });

    // zoom to selection
    const zoomToSelectionAction = () => {
      // 缩放到选中
      editor.zoomManager.zoomToSelection();
      // 渲染编辑器
      editor.render();
    };
    editor.keybindingManager.register({
      key: { shiftKey: true, keyCode: 'Digit2' }, // Shift + 2
      actionName: 'Zoom To Selection', // 缩放到选中
      action: zoomToSelectionAction, // 缩放到选中操作
    });

    // zoom in
    const zoomInAction = () => {
      editor.zoomManager.zoomIn({ isLevelZoom: true });
      editor.render();
    };
    editor.keybindingManager.register({
      key: [{ metaKey: true, keyCode: 'Equal' }, { keyCode: 'Equal' }],
      winKey: { ctrlKey: true, keyCode: 'Equal' },
      actionName: 'Zoom In',
      action: zoomInAction,
    });

    // zoom out
    const zoomOutAction = () => {
      editor.zoomManager.zoomOut({ isLevelZoom: true });
      editor.render();
    };
    editor.keybindingManager.register({
      key: [{ metaKey: true, keyCode: 'Minus' }, { keyCode: 'Minus' }],
      winKey: { ctrlKey: true, keyCode: 'Minus' },
      actionName: 'Zoom Out',
      action: zoomOutAction,
    });

    // zoom to 100%
    const zoomTo100 = () => {
      editor.zoomManager.setZoomAndUpdateViewport(1);
      editor.render();
    };
    editor.keybindingManager.register({
      key: [
        { metaKey: true, keyCode: 'Digit0' },
        { shiftKey: true, keyCode: 'Digit0' },
      ],
      winKey: [
        { ctrlKey: true, keyCode: 'Digit0' },
        { shiftKey: true, keyCode: 'Digit0' },
      ],
      actionName: 'Zoom To 100%',
      action: zoomTo100,
    });

    /*************** Grid **************/
    // toggle grid
    const toggleGridAction = () => {
      editor.setting.set(
        'enablePixelGrid',
        !editor.setting.get('enablePixelGrid'),
      );
      editor.render();
    };
    editor.keybindingManager.register({
      key: { metaKey: true, keyCode: 'Quote' },
      winKey: { ctrlKey: true, keyCode: 'Quote' },
      actionName: 'Toggle Grid',
      action: toggleGridAction,
    });

    // snap to grid
    const snapToGridAction = () => {
      editor.setting.set('snapToGrid', !editor.setting.get('snapToGrid'));
      editor.render();
    };
    editor.keybindingManager.register({
      key: { shiftKey: true, metaKey: true, keyCode: 'Quote' },
      winKey: { shiftKey: true, ctrlKey: true, keyCode: 'Quote' },
      actionName: 'Snap To Grid',
      action: snapToGridAction,
    });

    /********** Arrange *******/
    // front
    const frontAction = () => {
      arrangeAndRecord(editor, ArrangeType.Front);
      editor.render();
    };
    editor.keybindingManager.register({
      key: { keyCode: 'BracketRight' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'Front',
      action: frontAction,
    });

    // back
    const backAction = () => {
      arrangeAndRecord(editor, ArrangeType.Back);
      editor.render();
    };
    editor.keybindingManager.register({
      key: { keyCode: 'BracketLeft' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'Back',
      action: backAction,
    });

    // forward
    const forwardAction = () => {
      arrangeAndRecord(editor, ArrangeType.Forward);
      editor.render();
    };
    editor.keybindingManager.register({
      key: { metaKey: true, keyCode: 'BracketRight' },
      winKey: { ctrlKey: true, keyCode: 'BracketRight' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'Forward',
      action: forwardAction,
    });

    // backward
    const backwardAction = () => {
      arrangeAndRecord(editor, ArrangeType.Backward);
      editor.render();
    };
    editor.keybindingManager.register({
      key: { metaKey: true, keyCode: 'BracketLeft' },
      winKey: { ctrlKey: true, keyCode: 'BracketLeft' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'Backward',
      action: backwardAction,
    });

    /*************** align **************/
    editor.keybindingManager.register({
      key: { altKey: true, keyCode: 'KeyA' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'AlignLeft',
      action: () => {
        alignAndRecord(editor, AlignType.Left);
      },
    });

    editor.keybindingManager.register({
      key: { altKey: true, keyCode: 'KeyH' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'AlignHorizontalCenters',
      action: () => {
        alignAndRecord(editor, AlignType.HCenter);
      },
    });

    editor.keybindingManager.register({
      key: { altKey: true, keyCode: 'KeyD' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'AlignRight',
      action: () => {
        alignAndRecord(editor, AlignType.Right);
      },
    });

    editor.keybindingManager.register({
      key: { altKey: true, keyCode: 'KeyW' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'AlignTop',
      action: () => {
        alignAndRecord(editor, AlignType.Top);
      },
    });

    editor.keybindingManager.register({
      key: { altKey: true, keyCode: 'KeyV' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'AlignVerticalCenters',
      action: () => {
        alignAndRecord(editor, AlignType.VCenter);
      },
    });

    editor.keybindingManager.register({
      key: { altKey: true, keyCode: 'KeyS' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'AlignBottom',
      action: () => {
        alignAndRecord(editor, AlignType.Bottom);
      },
    });

    /*************** group **************/
    // 编组
    const groupAction = () => {
      groupAndRecord(this.editor.selectedElements.getItems(), editor);
      editor.render();
    };
    editor.keybindingManager.register({
      key: { metaKey: true, keyCode: 'KeyG' },
      winKey: { ctrlKey: true, keyCode: 'KeyG' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'Group',
      action: groupAction,
    });

    // ungroup
    const ungroupAction = () => {
      ungroupAndRecord(this.editor.selectedElements.getItems(), editor);
      editor.render();
    };
    editor.keybindingManager.register({
      key: { metaKey: true, keyCode: 'Backspace' },
      winKey: { ctrlKey: true, keyCode: 'Backspace' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'Ungroup',
      action: ungroupAction,
    });

    /******* show/hide *****/
    const showOrHideAction = () => {
      MutateGraphsAndRecord.toggleVisible(
        editor,
        editor.selectedElements.getItems(),
      );
      editor.render();
    };
    editor.keybindingManager.register({
      key: { metaKey: true, shiftKey: true, keyCode: 'KeyH' },
      winKey: { ctrlKey: true, shiftKey: true, keyCode: 'KeyH' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'Show/Hide',
      action: showOrHideAction,
    });

    /******* lock/unlock *****/
    const lockOrUnlockAction = () => {
      MutateGraphsAndRecord.toggleLock(
        editor,
        editor.selectedElements.getItems(),
      );
      editor.render();
    };
    editor.keybindingManager.register({
      key: { metaKey: true, shiftKey: true, keyCode: 'KeyL' },
      winKey: { ctrlKey: true, shiftKey: true, keyCode: 'KeyL' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'Lock/Unlock',
      action: lockOrUnlockAction,
    });

    /******* flip vertical *****/
    const flipVerticalAction = () => {
      flipVerticalAndRecord(editor, editor.selectedElements.getItems());
      editor.render();
    };
    editor.keybindingManager.register({
      key: { shiftKey: true, keyCode: 'KeyV' },
      winKey: { shiftKey: true, keyCode: 'KeyV' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'FlipVertical',
      action: flipVerticalAction,
    });

    /******* flip horizontal *****/
    const flipHorizontalAction = () => {
      flipHorizontalAndRecord(editor, editor.selectedElements.getItems());
      editor.render();
    };
    editor.keybindingManager.register({
      key: { shiftKey: true, keyCode: 'KeyH' },
      winKey: { shiftKey: true, keyCode: 'KeyH' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'FlipHorizontal',
      action: flipHorizontalAction,
    });

    /******** enter path edit *******/
    const enterGraphicsEditWithGroup = () => {
      const items = editor.selectedElements.getItems();
      const newItems: SuikaGraphics[] = [];
      let hasGroup = false;
      for (const item of items) {
        if (isFrameGraphics(item) && item.isGroup()) {
          newItems.push(...item.getChildren());
          hasGroup = true;
        } else {
          newItems.push(item);
        }
      }
      if (hasGroup) {
        editor.selectedElements.setItems(newItems);
        editor.render();
      }
    };
    const enterGraphicsEdit = () => {
      const selectedCount = editor.selectedElements.size();
      if (editor.pathEditor.isActive() || selectedCount === 0) return;

      if (selectedCount === 1) {
        const graphics = editor.selectedElements.getItems()[0];
        if (graphics instanceof SuikaPath) {
          editor.pathEditor.active(graphics);
        } else if (graphics instanceof SuikaText) {
          editor.textEditor.active({
            textGraphics: graphics,
            pos: graphics.getWorldPosition(),
            range: {
              start: 0,
              end: graphics.getContentLength(),
            },
          });
        } else if (isFrameGraphics(graphics) && graphics.isGroup()) {
          enterGraphicsEditWithGroup();
        }
      } else {
        // 如果有 group，取消 group 的选中，改为选中其下的 children
        enterGraphicsEditWithGroup();
      }
    };
    editor.keybindingManager.register({
      key: { keyCode: 'Enter' },
      when: (ctx) => !ctx.isToolDragging,
      actionName: 'EnterGraphEdit',
      action: enterGraphicsEdit,
    });
  }

  destroy() {
    this.isBound = false;
    //  KeyBindingManager will destroy all keybindings when editor destroy
  }
}
