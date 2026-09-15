import { useCallback, useState } from 'react';

/**
 * useModal 管理的弹窗状态
 *
 * @template T - 弹窗携带的业务数据类型（如「当前编辑的那一行」）
 */
interface ModalState<T> {
  /** 弹窗是否可见，直接透传给组件的 visible 属性 */
  visible: boolean;
  /**
   * 打开弹窗时携带的数据。
   *
   * 注意：关闭弹窗（`close` / `cancel` / `toggle`）**不会**清空它，
   * 只有当再次 `open(newData)` 或显式调用 `setData` 时才会变化。
   * 保留数据是为了让弹窗在退场动画期间仍能渲染出正确内容。
   */
  data?: T;
}

/**
 * useModal 的配置选项
 *
 * @template T - `data` 与 `confirm` 回传数据的类型
 */
interface UseModalOptions<T> {
  /** 初始是否可见，默认为 false（绝大多数场景下弹窗初始都应是关闭的） */
  initialVisible?: boolean;
  /** 点「确定」时的回调，参数为 `confirm(result)` 回传的结果 */
  onConfirm?: (result?: T) => void;
  /** 点「取消」/ 点遮罩时的回调，无参数 */
  onCancel?: () => void;
}

/**
 * 自定义 Hook —— 管理单个弹窗的可见性与业务数据。
 *
 * 功能要点：
 * 1. 用「可见性 + 数据」两个状态代替散落的 `useState(false)` 和 `useState(null)`，
 *    打开时一并携带数据，避免「先 setVisible 再 setData」导致的两次渲染。
 * 2. `open` / `close` / `toggle` 负责可见性，`confirm` / `cancel` 是带语义的关闭方式：
 *    前者会回传结果并触发 `onConfirm`，后者触发 `onCancel`。
 * 3. 关闭时**不清空** `data`，弹窗在退场动画期间依然能拿到内容正常渲染，
 *    避免出现「内容先变空、再淡出」的闪烁。
 * 4. 重复调用 `close` / `cancel` 时返回原 state 引用，跳过无意义的重渲染。
 * 5. 所有方法都用 `useCallback` 包裹，可安全地放进依赖数组或传给 memo 组件。
 *
 * @template T - 弹窗携带的业务数据类型
 * @param options - 可选配置项 {@link UseModalOptions}
 * @returns `{ visible, data, open, close, toggle, confirm, cancel, setData }`
 * - `visible`   —— 是否可见
 * - `data`      —— 打开时携带的数据
 * - `open`      —— `open(data?)` 打开弹窗（可选携带数据）
 * - `close`     —— 单纯关闭，不触发 `onCancel`
 * - `toggle`    —— 切换可见性，供无数据的简单弹窗使用
 * - `confirm`   —— `confirm(result?)` 关闭并触发 `onConfirm(result)`
 * - `cancel`    —— 关闭并触发 `onCancel`，建议直接绑到弹窗的取消 / 遮罩事件
 * - `setData`   —— 更新携带的数据，不影响可见性
 *
 * @example 基础用法 —— 编辑弹窗
 * ```tsx
 * import useModal from './hooks/useModal';
 *
 * function UserPage() {
 *   const { visible, data, open, cancel } = useModal<User>({
 *     onCancel: () => console.log('用户放弃了编辑'),
 *   });
 *
 *   return (
 *     <>
 *       <Button onClick={() => open(row)}>编辑</Button>
 *       <Modal visible={visible} onCancel={cancel}>
 *         <EditForm user={data} />
 *       </Modal>
 *     </>
 *   );
 * }
 * ```
 *
 * @example 确认弹窗 —— 回传用户的选择
 * ```tsx
 * function DeleteConfirm() {
 *   const { visible, open, confirm, cancel } = useModal<'yes' | 'no'>({
 *     onConfirm: (result) => result === 'yes' && doDelete(),
 *   });
 *
 *   return (
 *     <>
 *       <Button onClick={() => open()}>删除</Button>
 *       <Modal visible={visible} onCancel={cancel}>
 *         <p>确定要删除吗？</p>
 *         <Button onClick={() => confirm('yes')}>确定</Button>
 *         <Button onClick={() => confirm('no')}>取消</Button>
 *       </Modal>
 *     </>
 *   );
 * }
 * ```
 *
 * @example 无数据的简单弹窗
 * ```tsx
 * const { visible, toggle } = useModal();
 * // <Modal visible={visible} onCancel={toggle}>...</Modal>
 * ```
 *
 * @remarks 使用须知
 * - 一个 `useModal` 实例只管理**一个**弹窗；页面上有多个弹窗时应分别调用。
 * - `data` 的生命周期独立于 `visible`：弹窗关闭后 `data` 仍是上次 `open` 的值，
 *   渲染弹窗内容前请用 `visible` 做判断（或接受退场动画期间显示旧数据）。
 * - `data` 在打开前是 `undefined`，模板里取值请做兜底（`data?.name`）。
 * - `onConfirm` / `onCancel` 建议用 `useCallback` 包裹，否则每次渲染都会生成新函数，
 *   导致 `confirm` / `cancel` 引用变化，进而让 memo 化的弹窗组件重复渲染。
 * - 本 Hook 只描述状态，不负责渲染，可搭配任意 UI 库的 Modal 组件使用。
 */
function useModal<T = any>(options: UseModalOptions<T> = {}) {
  const { initialVisible = false, onConfirm, onCancel } = options;

  const [state, setState] = useState<ModalState<T>>({ visible: initialVisible });

  /**
   * 关闭弹窗的统一实现。
   *
   * 两个细节：
   * 1. 保留 `prev.data`，让弹窗在退场动画期间还能渲染出内容；
   * 2. 已经关闭时直接返回 `prev`，React 会跳过这次更新，避免多余的重渲染。
   */
  const hide = useCallback(() => {
    setState(prev => (prev.visible ? { visible: false, data: prev.data } : prev));
  }, []);

  /** 打开弹窗，可携带本次要展示的数据；数据与可见性在同一次更新中写入，只触发一次渲染。 */
  const open = useCallback((data?: T) => {
    setState({ visible: true, data });
  }, []);

  /** 单纯关闭弹窗，不触发 `onCancel`（用于「提交成功后自动关闭」等非用户取消的场景）。 */
  const close = hide;

  /** 切换可见性，适合没有业务数据的简单弹窗；`data` 保持不变。 */
  const toggle = useCallback(() => {
    setState(prev => ({ visible: !prev.visible, data: prev.data }));
  }, []);

  /**
   * 确定并关闭：把结果回传给 `onConfirm`。
   * 结果不写进 `data`，避免覆盖掉打开时携带的业务数据。
   *
   * @param result - 需要回传给调用方的结果，可选
   */
  const confirm = useCallback(
    (result?: T) => {
      hide();
      onConfirm?.(result);
    },
    [hide, onConfirm]
  );

  /** 取消并关闭：触发 `onCancel`，建议直接绑定到弹窗的取消按钮和遮罩点击事件。 */
  const cancel = useCallback(() => {
    hide();
    onCancel?.();
  }, [hide, onCancel]);

  /** 直接更新携带的数据，不影响可见性（如弹窗内表单异步加载完成后回填）。 */
  const setData = useCallback((data?: T) => {
    setState(prev => ({ ...prev, data }));
  }, []);

  return {
    visible: state.visible,
    data: state.data,
    open,
    close,
    toggle,
    confirm,
    cancel,
    setData,
  };
}

export default useModal;
