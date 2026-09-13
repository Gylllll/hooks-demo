import { useState, useEffect, useCallback } from 'react';

/**
 * useCache 的配置选项
 *
 * @template T - 缓存数据的类型
 */
interface CacheOptions<T> {
  /** 缓存的键名（localStorage / sessionStorage 的 key） */
  key: string;
  /**
   * 使用哪种 Storage，默认为 `'local'`
   * - `'local'`   → localStorage：同源共享、关闭浏览器后仍保留
   * - `'session'` → sessionStorage：仅当前标签页可见、关闭标签页即清除
   */
  storageType?: 'local' | 'session';
  /** 有效期（毫秒），默认 1 小时（3600000）。读取时超过该时长即视为过期并自动删除 */
  expireTime?: number;
  /** 兜底值：缓存不存在 / 已过期 / JSON 解析失败时返回该值 */
  initialValue?: T;                           
}

/**
 * 自定义 Hook —— 带过期时间与跨标签页同步的本地缓存。
 *
 * 功能要点：
 * 1. 读写 `localStorage` / `sessionStorage`，数据自动序列化为 JSON。
 * 2. 存储结构为 `{ value, timestamp }`，读取时用 `timestamp` 判断是否超过 `expireTime`；
 *    过期则顺手删除该条缓存，并回落 `initialValue`（惰性清理，无需定时器）。
 * 3. 返回三元组 `[data, setCache, clearCache]`，语义与 `useState` 保持一致。
 * 4. 监听 `window` 的 `storage` 事件，其他标签页修改同一个 key 时本标签页自动同步。
 * 5. 解析失败（脏数据 / 非本 Hook 写入的内容）时不抛错，安静地返回 `initialValue`。
 *
 * @template T - 缓存数据的类型
 * @param options - 配置项 {@link CacheOptions}
 * @returns `[data, setCache, clearCache]`
 * - `data`       —— 当前缓存值，初始为缓存中的值或 `initialValue`
 * - `setCache`   —— 写入并立即更新 `data`
 * - `clearCache` —— 删除该 key 并把 `data` 重置为 `initialValue`
 *
 * @example 基础用法 —— 持久化表单草稿
 * ```tsx
 * import useCache from './hooks/useCache';
 *
 * function DraftEditor() {
 *   // 第二个参数是写方法，命名习惯上与 useState 保持一致
 *   const [draft, setDraft] = useCache<string>({
 *     key: 'user:draft',
 *     initialValue: '',
 *   });
 *
 *   return (
 *     <textarea
 *       value={draft}
 *       onChange={(e) => setDraft(e.target.value)}
 *     />
 *   );
 * }
 * ```
 *
 * @example 自定义有效期 —— 10 分钟
 * ```tsx
 * const [token, , clearToken] = useCache<string>({
 *   key: 'auth:token',
 *   expireTime: 10 * 60 * 1000,
 * });
 * ```
 *
 * @example 仅当前标签页有效 —— sessionStorage
 * ```tsx
 * useCache<TabState>({ key: 'tab:filters', storageType: 'session' });
 * ```
 *
 * @remarks 使用须知
 * - `key` / `storageType` 变化**不会**自动重新读取缓存：`useState` 的初始值只在首次挂载时求值。
 *   若需要换 key 重新读取，请通过 `key` 属性让组件重新挂载，
 *   或改用两套 Hook 实例。
 * - 过期判断只发生在「读取」时，且仅作用于当前 key，不会清理其他过期缓存。
 * - `storage` 事件只在**其他**标签页触发，本标签页内的写入不会触发自身监听（浏览器行为）。
 * - `sessionStorage` 每个标签页独立，因此该模式下跨标签页同步不会生效。
 * - 存储的值必须可被 `JSON.stringify` 序列化（函数、Date 会丢失类型，Map/Set 会变成 `{}`）。
 * - `initialValue` 如果传入字面量对象 / 数组 `initialValue={{}}`，每次调用 hook 都会生成新引用，会造成 `getCache`、`clearCache` 函数频繁重建，
 *  建议使用 `useMemo` 或 `useRef` 包裹，或直接传入常量引用。
 */
function useCache<T>(options: CacheOptions<T>): [T | undefined, (value: T) => void, () => void] {
  const { key, storageType = 'local', expireTime = 3600000, initialValue } = options;

  // localStorage / sessionStorage 是全局单例对象，引用稳定，
  // 可以安全地放进下面的 useCallback / useEffect 依赖数组。
  const storage = storageType === 'local' ? localStorage : sessionStorage;

  /**
   * 读取缓存。三种情况都返回 `initialValue`：key 不存在、已过期、JSON 解析失败。
   *
   * 注意：写成 useCallback 只是为了给下面的 useEffect 提供稳定依赖，
   * 它本身并没有「响应 key 变化而重新读取」的能力 ——
   * `useState(getCache)` 的惰性初始值仅在首次挂载时执行一次。
   */
  const getCache = useCallback((): T | undefined => {
    const raw = storage.getItem(key);
    if (!raw) return initialValue;
    try {
      const { value, timestamp } = JSON.parse(raw) as { value: T; timestamp: number };
      const isExpired = Date.now() - timestamp > expireTime;
      if (isExpired) {
        // 惰性清理：读到期数据时顺手删掉，避免脏数据长期占用空间
        storage.removeItem(key);
        return initialValue;
      }
      return value;
    } catch {
      // 脏数据（例如被其他代码手动写入的非 JSON 内容）不应让页面崩溃
      return initialValue;
    }
  }, [key, storage, expireTime, initialValue]);

  // 惰性初始化：只在首次渲染读取一次 storage，后续更新完全依赖 setCache / clearCache。
  const [data, setData] = useState<T | undefined>(getCache);

  /** 写入缓存，同时把内存中的 `data` 更新为同一个值（保持界面与存储同步）。 */
  const setCache = useCallback(
    (value: T) => {
      const cacheData = { value, timestamp: Date.now() };
      storage.setItem(key, JSON.stringify(cacheData));
      setData(value);
    },
    [key, storage]
  );

  /** 删除缓存并把 `data` 重置为 `initialValue`（而非 `undefined`），便于调用方直接渲染。 */
  const clearCache = useCallback(() => {
    storage.removeItem(key);
    setData(initialValue);
  }, [key, storage, initialValue]);

  // 跨标签页同步：另一个标签页修改同一 key 时，本标签页重新读取。
  // 注意 storage 事件不会在触发写入的那个标签页里触发，所以本页写入不会导致重复 setState。
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      // e.storageArea 用来区分事件来自 localStorage 还是 sessionStorage；
      // e.key 为 null 表示调用了 clear()，此时也一并重读（会回落 initialValue）。
      if ((e.key === key || e.key === null) && e.storageArea === storage) {
        setData(getCache());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key, storage, getCache]);

  return [data, setCache, clearCache];
}

export default useCache;
