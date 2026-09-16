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
  /** 请求失败后的回调，被取消 / 已过期的请求不会触发 */
  onError?: (err: Error) => void;
}

/**
 * 请求函数的签名。
 *
 * `signal` 由 Hook 注入在最前面，透传给 `fetch(url, { signal })` 或自己的延迟函数，
 * 取消才会真正生效；`...args` 是调用 `run(...)` 时透传进来的参数。
 */
type RequestFn<T> = (signal: AbortSignal, ...args: any[]) => Promise<T>;

/** 把任何抛出物归一化成 Error —— 用户代码可能 throw 字符串或 reject 非 Error 值 */
function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * 自定义 Hook —— 管理异步请求的完整生命周期。
 *
 * 功能要点：
 * 1. 自动追踪 `loading` / `error` / `data` 三种状态，默认挂载后立即请求（`immediate: false` 关闭）。
 * 2. 返回 `run`（手动触发，参数透传给 `requestFn`）、`cancel`（主动取消）、`setData`（直接改写数据）。
 * 3. **竞态防护**：每次 `run` 认领一个自增序号，响应回来时若序号已过期，整个结果被丢弃——
 *    不写 `data` / `error`，也不碰 `loading`。这一层不依赖 `requestFn` 配合，是数据正确性的底线。
 * 4. **主动取消**：发起新请求前 abort 掉上一次，并提供 `cancel()` 让请求真正中止，
 *    而不只是把响应丢掉（掐断网络、省流量）。
 *
 * 第 3、4 条是两层互补的防护，不是二选一：序号守卫保证「结果一定是对的」，
 * AbortController 保证「真的别再请求了」。
 *
 * @template T - 请求返回的数据类型
 * @param requestFn - 签名应为 `(signal, ...args) => Promise<T>`
 * @param options - 可选配置项 {@link UseRequestOptions}
 * @returns `{ data, loading, error, run, cancel, setData }`
 * - `data`    —— 最新一次成功请求的数据
 * - `loading` —— 是否有请求在飞（由最新一次请求掌管）
 * - `error`   —— 最新一次失败请求的错误；被取消 / 已过期的请求不会写入
 * - `run`     —— 手动触发请求，返回 Promise；失败、被取代或被取消时 resolve `undefined`
 * - `cancel`  —— 取消当前在飞的请求，只让 `loading` 立刻归位，不算失败
 * - `setData` —— 直接修改 `data`（乐观更新、缓存回填等场景）
 *
 * @example 搜索框 —— 竞态防护的典型场景
 * ```tsx
 * // 接口耗时随机，「ab」的慢响应完全可能后于「abcd」的快响应到达。
 * // 每次 run 都会取消上一次，过期响应会被安静地丢掉，结果永远属于最后的输入。
 * const { data, run } = useRequest(
 *   (signal, keyword: string) =>
 *     fetch(`/api/search?q=${keyword}`, { signal }).then((res) => res.json()),
 *   { immediate: false }
 * );
 *
 * return <Input onChange={(e) => run(e.target.value)} />;
 * ```
 *
 * @remarks 使用须知
 * - `signal` 由 Hook 自动注入，调用 `run(...)` 时**不需要**自己传：`run(id)` 实际调用的是
 *   `requestFn(signal, id)`。无参请求函数（`() => Promise<T>`）可以直接传入，不必改写签名。
 * - `requestFn` 若忽略 `signal`，取消只会让结果被丢弃（序号守卫仍然保证数据正确），
 *   但网络请求不会被真正掐断——服务端照常处理完，流量照常消耗。
 * - `run()` 不会 rethrow：请求失败、被取代、被取消一律 resolve `undefined`，错误只通过
 *   `error` 与 `onError` 暴露，以免每个「点火即忘」的调用点都要补 `.catch`。
 *   因此 `await run()` 拿到 `undefined` 的语义是「没成功」，而非「没有数据」。
 * - `onSuccess` / `onError` 中抛出的异常不会被当作请求失败，会原样抛出。
 * - `loading` 是单个布尔值，由最新一次请求掌管。若某次请求的 `requestFn` 永不 settle，
 *   `loading` 会一直停在 `true`，只能靠新的 `run()` 或 `cancel()` 解除。
 * - `run` 与 `cancel` 的身份是稳定的（内部用 ref 读最新的 `requestFn` 与回调），
 *   可以安全地放进 `useEffect` 依赖；`immediate` 只在挂载时生效一次，
 *   `requestFn` 引用变化不会触发重新请求。
 */
function useRequest<T>(requestFn: RequestFn<T>, options: UseRequestOptions<T> = {}) {
  const { immediate = true, initialData, onSuccess, onError } = options;

  // ---- 状态 ----
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // ---- 竞态防护：两个 ref 职责分开 ----

  /** 请求序号 —— 正确性守卫。每次 `run` 自增，响应回来时对不上就说明已被更新的请求取代 */
  const requestIdRef = useRef(0);

  /** 在飞请求的控制器 —— 取消手段。发起新请求前先 abort 掉旧的 */
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 挂载哨兵。React 18 起 setState 到已卸载组件已不再告警，它现在的职责是：
   * 卸载后不再调用 `onSuccess` / `onError`——对不理会 `signal` 的 `requestFn`，
   * 序号守卫拦不住（它的 Promise 仍会正常 resolve），只能靠这个哨兵。
   */
  const isMounted = useRef(true);

  /**
   * 用 ref 持有最新的 `requestFn` 与两个回调，使 `run` / `cancel` 的身份恒定。
   * 否则内联的 `requestFn`（每次渲染都是新引用）会让 `run` 每次渲染都变，
   * 调用方一旦把它写进 `useEffect` 依赖，就是一个收不住的无限请求循环。
   */
  const latestRef = useRef({ requestFn, onSuccess, onError });
  useEffect(() => {
    latestRef.current = { requestFn, onSuccess, onError };
  });

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // 卸载时取消在飞请求，别让它在后台空跑（严格模式的双调用也走这里，
      // 但下面「立即执行」的效应会重新发起一次，最终仍只有一个请求在飞）
      abortRef.current?.abort();
    };
  }, []);

  /**
   * 手动触发请求的核心方法。
   *
   * @param args - 透传给 `requestFn` 的参数（`signal` 由 Hook 自动注入在最前面）
   * @returns 请求结果的 Promise；失败、被取代或被取消时 resolve `undefined`
   */
  const run = useCallback(async (...args: any[]) => {
    // 卸载后不再发起新请求（调用方可能仍持有 run，例如防抖回调里）
    if (!isMounted.current) return;

    // 1) 先取消上一次仍在飞的请求。abort() 不会同步 reject，它只是把 AbortError
    //    排进微任务队列，所以下面这整段同步代码一定先跑完——旧请求随后 reject 时读到的已是新序号。
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 2) 认领本次的序号，必须在 await 之前取号：挪到 await 之后再读 requestIdRef.current，
    //    下面的守卫会退化成恒真，防护直接失效。
    const currentId = ++requestIdRef.current;

    // 本次请求是否已「过期」——被更新的一次 run 取代，或组件已卸载。
    // 闭包捕获的是本次的 currentId 与 controller，绝不能改读 abortRef.current（那已是新请求的）。
    const isStale = () => currentId !== requestIdRef.current || !isMounted.current;

    setLoading(true);
    setError(null);

    let result: T;
    try {
      result = await latestRef.current.requestFn(controller.signal, ...args);
    } catch (err) {
      // 3) 主动取消（cancel / 卸载 / 被新请求取代）不是错误，静默丢弃，
      //    否则每次输入都会弹一个「假的」失败。
      //    判 signal.aborted 而非 err.name === 'AbortError'：前者只可能由我们自己置位，
      //    后者可能来自用户代码抛出的同名错误。
      if (controller.signal.aborted || isStale()) return;
      const e = toError(err);
      setError(e);
      setLoading(false);
      latestRef.current.onError?.(e);
      return;
    }

    // 4) 过期响应：不写 state，也不返回给 await 的调用方——把旧数据交出去正是本次要消灭的 bug
    if (isStale()) return;

    setLoading(false);
    setData(result);
    // 5) onSuccess 放在 try 之外：回调自身抛错不该被当成「请求失败」，
    //    否则同一个错误会同时写入 error 并触发 onError。
    latestRef.current.onSuccess?.(result);
    return result;
  }, []);

  /**
   * 取消当前在飞的请求。
   *
   * 取消不算失败：不写入 `error`、不触发 `onError`，只让 `loading` 立刻回到 `false`，
   * 并让在飞的 `run()` resolve `undefined`。
   */
  const cancel = useCallback(() => {
    // 推高序号，让在飞请求当场「过期」：它的结果与错误随后都会被丢弃
    requestIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    // 原请求的收尾逻辑已因序号过期而不再执行，loading 必须在这里清掉，否则会永远停在 true
    if (isMounted.current) setLoading(false);
  }, []);

  /** immediate 为 true 时（默认值），组件挂载后自动执行一次请求 */
  useEffect(() => {
    if (immediate) run();
  }, [immediate, run]);

  return { data, loading, error, run, cancel, setData };
}

export default useRequest;
