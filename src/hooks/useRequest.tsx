import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useRequest 的配置选项
 *
 * @template T - 请求返回的数据类型
 */
interface UseRequestOptions<T> {
  /** 是否在组件挂载后立即执行请求，默认为 true */
  immediate?: boolean;
  /** 请求返回之前的初始数据 */
  initialData?: T;
  /** 请求成功后的回调，参数为返回的数据 */
  onSuccess?: (data: T) => void;
  /** 请求失败后的回调，参数为错误对象 */
  onError?: (err: Error) => void;
}

/**
 * 自定义 Hook —— 管理异步请求的完整生命周期。
 *
 * 功能要点：
 * 1. 自动追踪 `loading` / `error` / `data` 三种状态。
 * 2. 默认在组件挂载后立即发起请求（通过 `immediate: false` 关闭）。
 * 3. 返回 `run` 方法支持手动触发，可传入参数透传给 `requestFn`。
 * 4. 通过 `isMounted` 哨兵防止组件卸载后的 setState（避免 React 内存泄漏警告）。
 * 5. 暴露 `setData` 允许外部直接修改数据（乐观更新、缓存回填等场景）。
 *
 * @template T - 请求返回的数据类型
 * @param requestFn  - 异步请求函数，返回值应为 Promise<T>
 * @param options    - 可选配置项 {@link UseRequestOptions}
 * @returns { data, loading, error, run, setData }
 *
 * @example 基础用法 —— 自动请求
 * ```tsx
 * import useRequest from './hooks/useRequest';
 *
 * function UserList() {
 *   const { data, loading, error } = useRequest(() =>
 *     fetch('/api/users').then(res => res.json())
 *   );
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message={error.message} />;
 *   return <List dataSource={data} />;
 * }
 * ```
 *
 * @example 手动触发
 * ```tsx
 * function UserEdit() {
 *   const { loading, error, run } = useRequest(
 *     (id: string) => api.updateUser(id, values),
 *     { immediate: false }
 *   );
 *
 *   const handleSave = async () => {
 *     await run(userId);
 *     message.success('保存成功');
 *   };
 *
 *   return <Button loading={loading} onClick={handleSave}>保存</Button>;
 * }
 * ```
 *
 * @example 带回调
 * ```tsx
 * const { run } = useRequest(api.login, {
 *   immediate: false,
 *   onSuccess: (token) => localStorage.setItem('token', token),
 *   onError:  (err)   => message.error(err.message),
 * });
 * ```
 */
function useRequest<T>(
  requestFn: (...args: any[]) => Promise<T>,
  options: UseRequestOptions<T> = {}
) {
  const { immediate = true, initialData, onSuccess, onError } = options;

  // ---- 状态 ----
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 哨兵 ref —— 追踪组件是否仍然挂载。
   * 异步请求返回时若组件已卸载，跳过 setState 以避免警告：
   * "Can't perform a React state update on an unmounted component."
   */
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * 手动触发请求的核心方法。
   *
   * - 每次调用会将 `loading` 置为 true、`error` 置为 null。
   * - 请求成功时更新 `data` 并调用 `onSuccess`。
   * - 请求失败时更新 `error` 并调用 `onError`。
   * - 所有 setState 均受 `isMounted` 哨兵保护。
   *
   * @param args - 透传给 `requestFn` 的参数
   * @returns 请求结果的 Promise（调用方可 await 获取返回值）
   */
  const run = useCallback(async (...args: any[]) => {
    if (!isMounted.current) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestFn(...args);
      if (isMounted.current) {
        setData(result);
        onSuccess?.(result);
      }
      return result;
    } catch (err) {
      if (isMounted.current) {
        setError(err as Error);
        onError?.(err as Error);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [requestFn, onSuccess, onError]);

  /**
   * immediate 为 true 时（默认值），组件挂载后自动执行一次请求。
   * 注意：依赖数组包含 `run`，若 `requestFn` 引用不稳定，
   * 请在上层使用 useCallback 包裹请求函数，否则会导致重复请求。
   */
  useEffect(() => {
    if (immediate) {
      run();
    }
  }, [immediate, run]);

  return { data, loading, error, run, setData };
}

export default useRequest;