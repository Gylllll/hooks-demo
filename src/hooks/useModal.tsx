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
   * 只有再次 `open(newData)` 或调用 `setData` 时才会变化 ——
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
  /** 初始是否可见，默认为 false */
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
 * 1. 用「可见性 + 数据」一个 state 代替散落的 `useState(false)` 和 `useState(null)`，
 *    `open(data)` 时同一次更新写入，避免两次渲染。
 * 2. 区分几组同义方法：`confirm` / `cancel` 是带语义的关闭（触发对应回调），
 *    `close` 只关闭、不触发回调，`toggle` 供无数据的简单弹窗使用。
 * 3. 关闭时不清空 `data`，且已关闭时重复关闭会返回原 state 引用，跳过无意义的重渲染。
 *
 * 注意 `onCancel`（回调）与 `cancel`（方法）不是一回事：需要通知调用方就用 `cancel()`，
 * 不需要就用 `close()`。弹窗的遮罩 / ✕ / 取消按钮绑 `cancel` 即可间接触发 `onCancel`。
 *
 * @template T - 弹窗携带的业务数据类型
 * @param options - 可选配置项 {@link UseModalOptions}
 * @returns `{ visible, data, open, close, toggle, confirm, cancel, setData }`，均用
 * `useCallback` 包裹，可安全写入依赖数组或传给 memo 组件
 *
 * @example 基础用法 —— 编辑弹窗
 * ```tsx
 * const { visible, data, open, cancel } = useModal<User>({
 *   onCancel: () => console.log('用户放弃了编辑'),
 * });
 *
 * <Button onClick={() => open(row)}>编辑</Button>
 * <Modal open={visible} onCancel={cancel}>
 *   <EditForm user={data} />
 * </Modal>
 * ```
 *
 * @remarks 使用须知
 * - 一个 `useModal` 实例只管理**一个**弹窗；页面上有多个弹窗时应分别调用。
 * - `data` 的生命周期独立于 `visible`，且首次 `open` 前是 `undefined`，
 *   模板里取值请做兜底（`data?.name`）。
 * - `onConfirm` / `onCancel` 建议用 `useCallback` 包裹，否则每次渲染都会生成新函数，
 *   导致 `confirm` / `cancel` 引用变化，让 memo 化的弹窗组件重复渲染。
 * - 本 Hook 只描述状态，不负责渲染，可搭配任意 UI 库的 Modal 组件使用。
 */
function useModal<T = any>(options: UseModalOptions<T> = {}) {
  const { initialVisible = false, onConfirm, onCancel } = options;
  const [state, setState] = useState<ModalState<T>>({ visible: initialVisible });

  /** 单纯关闭弹窗，不触发任何回调；重复关闭时返回原引用，React 会跳过这次更新。 */
  const close = useCallback(() => {
    setState((prev) => (prev.visible ? { visible: false, data: prev.data } : prev));
  }, []);

  /** 打开弹窗并携带本次要展示的数据；数据与可见性在同一次更新中写入，只渲染一次。 */
  const open = useCallback((data?: T) => {
    setState({ visible: true, data });
  }, []);

  /** 切换可见性，适合没有业务数据的简单弹窗；`data` 保持不变。 */
  const toggle = useCallback(() => {
    setState((prev) => ({ visible: !prev.visible, data: prev.data }));
  }, []);

  /**
   * 确定并关闭：把结果回传给 `onConfirm`。
   * 结果不写进 `data`，避免覆盖掉打开时携带的业务数据。
   */
  const confirm = useCallback(
    (result?: T) => {
      close();
      onConfirm?.(result);
    },
    [close, onConfirm]
  );

  /** 取消并关闭：触发 `onCancel`，建议直接绑定到弹窗的取消按钮和遮罩点击事件。 */
  const cancel = useCallback(() => {
    close();
    onCancel?.();
  }, [close, onCancel]);

  /** 直接更新携带的数据，不影响可见性（如弹窗内表单异步加载完成后回填）。 */
  const setData = useCallback((data?: T) => {
    setState((prev) => (Object.is(prev.data, data) ? prev : { ...prev, data }));
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
