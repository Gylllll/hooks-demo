import { useState } from 'react';
import useRequest from '../hooks/useRequest';

// ── Mock API（模拟异步请求）──────────────────────────────────────────

/** 模拟获取用户列表（成功） */
async function fetchUsers(signal: AbortSignal): Promise<string[]> {
  await delay(800, signal);
  return ['Alice', 'Bob', 'Charlie'];
}

/** 模拟获取数据（可能失败）。signal 是第一个参数，由 useRequest 注入 */
async function fetchMaybeFail(signal: AbortSignal, shouldFail: boolean): Promise<string> {
  await delay(600, signal);
  if (shouldFail) throw new Error('请求失败：网络异常');
  return `数据加载成功 @ ${new Date().toLocaleTimeString()}`;
}

const ALL_USERS = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank'];

/**
 * 模拟按关键词搜索，耗时在 300~1500ms 之间**随机**——刻意为之：
 * 只有延迟随机，「先发出的请求后返回」才会成为常态。
 */
async function searchUsers(
  signal: AbortSignal,
  keyword: string
): Promise<{ keyword: string; items: string[] }> {
  const cost = Math.round(300 + Math.random() * 1200);
  await delay(cost, signal);
  return {
    keyword,
    items: ALL_USERS.filter((name) =>
      name.toLowerCase().includes(keyword.toLowerCase())
    ),
  };
}

/** 可被取消的延时：被 abort 时立刻结束等待，而不是傻等定时器走完 */
function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    // 进门前就已经被取消的情况：addEventListener 不会再补发事件，必须自己判断
    if (signal?.aborted) {
      reject(new DOMException('请求已取消', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('请求已取消', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ── 示例 ────────────────────────────────────────────────────────────

/** 示例 1：自动请求 + loading / error / data 三态 */
function AutoFetchDemo() {
  const { data, loading, error, run } = useRequest(fetchUsers);

  return (
    <section className="demo-card">
      <h2>示例 1：自动请求（immediate: true，默认）</h2>
      {loading && <p className="status loading">⏳ 加载中...</p>}
      {error && <p className="status error">❌ {error.message}</p>}
      {data && (
        <ul>
          {data.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
      <button onClick={() => run()}>🔄 重新请求</button>
    </section>
  );
}

/** 示例 2：手动触发（immediate: false，带参数） */
function ManualTriggerDemo() {
  const [shouldFail, setShouldFail] = useState(false);
  const { data, loading, error, run } = useRequest(fetchMaybeFail, {
    immediate: false,
  });

  return (
    <section className="demo-card">
      <h2>示例 2：手动触发（immediate: false）</h2>
      <label>
        <input
          type="checkbox"
          checked={shouldFail}
          onChange={(e) => setShouldFail(e.target.checked)}
        />
        模拟请求失败
      </label>
      <button onClick={() => run(shouldFail)} disabled={loading}>
        {loading ? '⏳ 请求中...' : '📤 发起请求'}
      </button>
      {error && <p className="status error">❌ {error.message}</p>}
      {data && <p className="status success">✅ {data}</p>}
    </section>
  );
}

/** 示例 3：onSuccess / onError 回调 */
function CallbackDemo() {
  const [logs, setLogs] = useState<string[]>([]);
  const { data, loading, error, run } = useRequest(fetchMaybeFail, {
    immediate: false,
    onSuccess: (result) =>
      setLogs((prev) => [...prev, `[成功] ${result}`]),
    onError: (err) =>
      setLogs((prev) => [...prev, `[失败] ${err.message}`]),
  });

  return (
    <section className="demo-card">
      <h2>示例 3：onSuccess / onError 回调</h2>
      <button onClick={() => run(true)} disabled={loading}>
        ❌ 请求失败
      </button>{' '}
      <button onClick={() => run(false)} disabled={loading}>
        ✅ 请求成功
      </button>
      {loading && <p className="status loading">⏳ 请求中...</p>}
      {error && <p className="status error">❌ {error.message}</p>}
      {data && <p className="status success">✅ {data}</p>}
      <h4>回调日志：</h4>
      <ul className="log-list">
        {logs.length === 0 && <li>暂无日志</li>}
        {logs.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
    </section>
  );
}

/** 示例 4：initialData + setData 乐观更新 */
function InitialDataDemo() {
  const { data, loading, run, setData } = useRequest(fetchUsers, {
    immediate: false,
    initialData: ['初始用户A', '初始用户B'],
  });

  const handleAdd = () => {
    const name = prompt('输入用户名');
    if (name) setData((prev) => [...(prev ?? []), name]);
  };

  return (
    <section className="demo-card">
      <h2>示例 4：initialData + setData 乐观更新</h2>
      <p>
        initialData 在请求完成前展示，setData 支持乐观更新（无需等待接口返回）。
      </p>
      {loading && <p className="status loading">⏳ 加载中...</p>}
      {data && (
        <ul>
          {/* 用下标而非 name 做 key：本地添加允许重名，纯 name 会产生重复 key */}
          {data.map((name, i) => (
            <li key={`${name}-${i}`}>{name}</li>
          ))}
        </ul>
      )}
      <button onClick={() => run()} disabled={loading}>
        🔄 请求服务端数据
      </button>{' '}
      <button onClick={handleAdd}>➕ 本地添加（乐观更新）</button>
    </section>
  );
}

/** 示例 5：run 返回 Promise，支持 await */
function AwaitRunDemo() {
  const { loading, run } = useRequest(fetchMaybeFail, {
    immediate: false,
  });
  const [result, setResult] = useState<string | null>(null);

  const handleRunAndAwait = async () => {
    const res = await run(false);
    // run() 失败时不会 rethrow，而是 resolve undefined，所以这里用 undefined 判失败
    setResult(
      res === undefined
        ? '⚠️ 请求失败或被取消（run() resolve 出 undefined）'
        : `run() 返回值: ${res}`
    );
  };

  return (
    <section className="demo-card">
      <h2>示例 5：await run() 获取返回值</h2>
      <p>run() 会透传 requestFn 的返回值，调用方可以直接 await 拿结果。</p>
      <button onClick={handleRunAndAwait} disabled={loading}>
        {loading ? '⏳ 请求中...' : '▶ 执行并 await'}
      </button>
      {result && <p className="status success">{result}</p>}
    </section>
  );
}

/** 示例 6：竞态防护（请求序号 + AbortController） */
function RaceConditionDemo() {
  const [keyword, setKeyword] = useState('');
  /** 上一次「落定」是不是用户主动取消 —— 取消留下的旧结果不算竞态 */
  const [cancelled, setCancelled] = useState(false);
  const { data, loading, error, run, cancel } = useRequest(searchUsers, {
    immediate: false,
  });

  const handleChange = (value: string) => {
    setKeyword(value);
    setCancelled(false); // 新输入开启新一轮判定
    // 故意不做防抖：每次输入都发一次请求，让竞态必然发生
    run(value);
  };

  // 取消只是让在飞请求作废，屏幕上留着的仍是上一次的旧结果
  const handleCancel = () => {
    cancel();
    setCancelled(true);
  };

  /**
   * 空转时（没有请求在飞）才有定论：data 所属的关键词与输入框对不上，说明这份结果过期了。
   * 基准必须是输入框里的 keyword —— 另开一份 state 去同步它，就多一条漂移路径。
   */
  const isStale = !loading && !!data && data.keyword !== keyword;

  /**
   * 结果框的措辞。
   * 请求在飞时屏幕上必然还是上一次的结果，取消又是用户主动的，
   * 这两者都不等于「竞态没防住」——只有第三种才是本示例要演示的失败。
   */
  const verdict = loading
    ? { className: 'status', text: '⏳ 请求中，以下是上一次的结果：' }
    : !isStale
      ? { className: 'status success', text: '✅ 结果对应最新输入：' }
      : cancelled
        ? {
            className: 'status',
            text: `⛔ 已取消「${keyword}」的请求，屏幕上保留的是上一次的结果：`,
          }
        : { className: 'status error', text: '⚠️ 竞态未防住，显示的是旧结果：' };

  return (
    <section className="demo-card">
      <h2>示例 6：竞态防护（请求序号 + AbortController）</h2>
      <p>
        每次输入都会发一次请求，接口耗时在 300~1500ms 之间<b>随机</b>——
        所以「a」的慢响应完全可能后于「alic」的快响应到达。
        没有防护时它会把新结果覆盖掉；现在旧请求会被 abort，过期响应会被直接丢弃。
      </p>
      <input
        value={keyword}
        placeholder="输入关键词：a / al / ali / alic"
        onChange={(e) => handleChange(e.target.value)}
      />{' '}
      <button onClick={handleCancel} disabled={!loading}>
        ⛔ 取消当前请求
      </button>
      {loading && <p className="status loading">⏳ 请求中...</p>}
      {error && <p className="status error">❌ {error.message}</p>}
      {data && (
        <p className={verdict.className}>
          {verdict.text}「{data.keyword}」匹配到 {data.items.length} 条
          {data.items.length > 0 && `（${data.items.join('、')}）`}
        </p>
      )}
      {!data && !loading && (
        <p className="status">
          {cancelled ? '⛔ 已取消请求，暂无结果' : '尚未发起请求'}
        </p>
      )}
    </section>
  );
}

// ── 页面 ────────────────────────────────────────────────────────────

export default function UseRequestPage() {
  return (
    <>
      <h2>useRequest：异步请求状态管理</h2>
      <AutoFetchDemo />
      <ManualTriggerDemo />
      <CallbackDemo />
      <InitialDataDemo />
      <AwaitRunDemo />
      <RaceConditionDemo />
    </>
  );
}
