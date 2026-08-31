import { useState } from 'react';
import useRequest from './hooks/useRequest';
import './App.css';

// ── Mock API（模拟异步请求）──────────────────────────────────────────

/** 模拟获取用户列表（成功） */
async function fetchUsers(): Promise<string[]> {
  await delay(800);
  return ['Alice', 'Bob', 'Charlie'];
}

/** 模拟获取数据（可能失败） */
async function fetchMaybeFail(shouldFail: boolean): Promise<string> {
  await delay(600);
  if (shouldFail) throw new Error('请求失败：网络异常');
  return `数据加载成功 @ ${new Date().toLocaleTimeString()}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 子组件 ──────────────────────────────────────────────────────────

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
          {data.map((name) => (
            <li key={name}>{name}</li>
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
    try {
      const res = await run(false);
      setResult(`run() 返回值: ${res}`);
    } catch {
      setResult('捕获到异常');
    }
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

// ── 总入口 ──────────────────────────────────────────────────────────

function App() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>useRequest Hook — 示例集</h1>
      <AutoFetchDemo />
      <ManualTriggerDemo />
      <CallbackDemo />
      <InitialDataDemo />
      <AwaitRunDemo />
    </main>
  );
}

export default App;
