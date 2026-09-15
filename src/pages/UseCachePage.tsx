import { useEffect, useState } from 'react';
import useCache from '../hooks/useCache';

/** 直接读取原始的存储内容，仅用于示例中观察 `{ value, timestamp }` 结构 */
function readRaw(storage: Storage, key: string) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const { value, timestamp } = JSON.parse(raw) as { value: unknown; timestamp: number };
    return { value, timestamp, age: Date.now() - timestamp };
  } catch {
    // 非本 Hook 写入的脏数据
    return { value: raw, timestamp: 0, age: -1 };
  }
}

/** 每秒触发一次重渲染，示例 2 用来实时显示缓存已存在多久（仅演示需要） */
function useTicker(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

/** 示例 1：基础读写（localStorage） */
function CacheBasicDemo() {
  const [draft, setDraft] = useState('');
  // 返回值语义与 useState 一致：[值, 写入方法, 清除方法]
  const [name, setName, clearName] = useCache<string>({
    key: 'demo:name',
    initialValue: '（暂无缓存）',
  });

  return (
    <section className="demo-card">
      <h2>示例 1：基础读写（localStorage，默认 1 小时过期）</h2>
      <p>
        写入后刷新页面，数据依然存在；也可以在 DevTools → Application → Local Storage
        里看到实际存储结构 {'{ value, timestamp }'}。
      </p>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="输入要缓存的内容"
      />
      <button
        onClick={() => {
          setName(draft);
          setDraft('');
        }}
        disabled={!draft}
      >
        💾 写入缓存
      </button>
      <button onClick={clearName}>🗑 清除缓存</button>
      <p className="status success">当前缓存值：{name}</p>
    </section>
  );
}

/** 示例 2：expireTime 有效期 —— 拆成独立组件，便于用 key 强制重新挂载 */
function ExpireReader() {
  useTicker(); // 仅为了让倒计时 / 过期状态实时刷新
  const [value, setValue] = useCache<string>({
    key: 'demo:temp',
    expireTime: 3000, // 3 秒有效期
    initialValue: '（缓存不存在或已过期）',
  });
  const raw = readRaw(localStorage, 'demo:temp');

  return (
    <>
      <p className="status success">Hook 返回的值：{value}</p>
      <p className="status loading">
        {raw
          ? `存储中的原始数据：已存在 ${(raw.age / 1000).toFixed(1)} 秒${
              raw.age > 3000 ? '（已超期，但要等下次读取时才会被删除）' : ''
            }`
          : '存储中的原始数据：不存在（已被清理）'}
      </p>
      <button onClick={() => setValue(`数据 @ ${new Date().toLocaleTimeString()}`)}>
        💾 写入缓存（重新计算 3 秒有效期）
      </button>
    </>
  );
}

/** 示例 2 外壳：通过改变 React 的 key 强制子组件重新挂载，从而触发重新读取 */
function CacheExpireDemo() {
  const [round, setRound] = useState(0);

  return (
    <section className="demo-card">
      <h2>示例 2：expireTime 有效期（3 秒）</h2>
      <p>
        过期判断发生在「读取」时：useState 的初始值只在首次挂载时求值，所以需要重新挂载组件
        才会重新读取 —— 这正是下面这个按钮的作用（改变 key 让 React 重建子组件）。
      </p>
      <button onClick={() => setRound((r) => r + 1)}>🔄 重新挂载并读取缓存（第 {round + 1} 次）</button>
      <ExpireReader key={round} />
    </section>
  );
}

/** 示例 3：同一个 key 分别写入两种 Storage，互不影响 */
function CacheStorageTypeDemo() {
  const [localValue, setLocalValue, clearLocal] = useCache<string>({
    key: 'demo:shared-key',
    storageType: 'local',
    initialValue: '（local 为空）',
  });
  const [sessionValue, setSessionValue, clearSession] = useCache<string>({
    key: 'demo:shared-key',
    storageType: 'session',
    initialValue: '（session 为空）',
  });

  return (
    <section className="demo-card">
      <h2>示例 3：storageType（local vs session）</h2>
      <p>
        两个 Hook 使用完全相同的 key，但读写的是不同的 Storage 对象，因此互不覆盖。
        sessionStorage 仅当前标签页可见，新开标签页或关闭后即为空。
      </p>
      <p className="status success">localStorage：{localValue}</p>
      <p className="status loading">sessionStorage：{sessionValue}</p>
      <button onClick={() => setLocalValue(`local @ ${new Date().toLocaleTimeString()}`)}>
        💾 写入 localStorage
      </button>
      <button onClick={clearLocal}>🗑 清除 localStorage</button>
      <br />
      <button onClick={() => setSessionValue(`session @ ${new Date().toLocaleTimeString()}`)}>
        💾 写入 sessionStorage
      </button>
      <button onClick={clearSession}>🗑 清除 sessionStorage</button>
    </section>
  );
}

/** 示例 4：跨标签页同步（storage 事件） */
function CacheSyncDemo() {
  const [value, setValue, clearValue] = useCache<string>({
    key: 'demo:sync',
    initialValue: '（暂无数据）',
  });
  const [logs, setLogs] = useState<string[]>([]);

  // Hook 内部已经自己在同步数据，这里只是额外挂一个监听把事件打印出来，方便观察
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'demo:sync' && e.storageArea === localStorage) {
        setLogs((prev) =>
          [`收到 storage 事件 @ ${new Date().toLocaleTimeString()}`, ...prev].slice(0, 5)
        );
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const openNewTab = () => window.open(window.location.href, '_blank');

  return (
    <section className="demo-card">
      <h2>示例 4：跨标签页同步</h2>
      <p>
        点击「新标签页」打开第二个页面，在那边写入同一个 key，回到本页即可看到值自动更新。
        注意：storage 事件只在<strong>其他</strong>标签页触发，本页写入不会触发自己的监听。
      </p>
      <p className="status success">当前值：{value}</p>
      <button onClick={() => setValue(`本页写入 @ ${new Date().toLocaleTimeString()}`)}>
        💾 在本页写入
      </button>
      <button onClick={clearValue}>🗑 清除</button>
      <button onClick={openNewTab}>🪟 打开新标签页</button>
      <h4>storage 事件日志：</h4>
      <ul className="log-list">
        {logs.length === 0 && <li>暂无事件（试试在另一个标签页写入）</li>}
        {logs.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
    </section>
  );
}

// ── 页面 ────────────────────────────────────────────────────────────

export default function UseCachePage() {
  return (
    <>
      <h2>useCache：带过期时间的本地缓存</h2>
      <CacheBasicDemo />
      <CacheExpireDemo />
      <CacheStorageTypeDemo />
      <CacheSyncDemo />
    </>
  );
}
