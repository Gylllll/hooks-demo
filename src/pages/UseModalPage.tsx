import { useCallback, useState } from 'react';
import { Button, Modal } from 'antd';
import useModal from '../hooks/useModal';

// ── 弹窗组件统一使用 antd 的 Modal ───────────────────────────────────
//
// useModal 只管「可见性 + 数据」，渲染交给 UI 库，三处对接：
//   open={visible}     —— hook 的 visible，v5 起 antd 用 open 而非 visible
//   onCancel={cancel}  —— 点遮罩 / ✕ /「取消」按钮都会走到这里，
//                         于是顺带触发 hook 的 onCancel 回调
//   onOk={close}       —— 「确定」只关闭，不触发回调（要用 cancel 才通知你）
//
// 注意 hook 返回的方法也叫 open，别和 Modal 的 open 属性搞混：属性收布尔值，
// hook 的 open 是「打开弹窗」的函数。

// ── 示例 1：基础开 / 关 ──────────────────────────────────────────────

/** 示例 1：区分 onCancel（回调）/ cancel() / close() 三个名字 */
function BasicDemo() {
  const [log, setLog] = useState<string[]>([]);
  const record = useCallback(
    (msg: string) => setLog((prev) => [msg, ...prev].slice(0, 6)),
    []
  );

  const { visible, open, close, cancel, toggle } = useModal({
    // 回调用 useCallback 包裹，hook 返回的 cancel 引用才不会被频繁重建
    // 只有 cancel() 会走到这里；close() 不会，所以日志里看不到这行
    onCancel: useCallback(() => record(`✅ onCancel 回调被触发（说明走的是 cancel）- ${new Date().toLocaleTimeString()}`), [record]),
  });

  return (
    <section className="demo-card">
      <h2>示例 1：基础开 / 关（close 与 cancel 的区别）</h2>
      <p>
        <code>onCancel</code> 是你传给 hook 的<strong>回调</strong>，
        <code>cancel()</code> / <code>close()</code> 是 hook 返回的<strong>方法</strong>。
        两者都关弹窗，区别只在于要不要通知你一声：antd Modal 的遮罩、✕、「取消」绑的是{' '}
        <code>cancel</code>，会多出一行回调日志；「静默关闭」和「确定」走{' '}
        <code>close</code>，不会。
      </p>

      <p className="status success">
        当前 visible：<strong>{String(visible)}</strong>
      </p>

      {/* 注意写成箭头函数：直接 onClick={open} 会把点击事件当成 data 传进去 */}
      <button onClick={() => open()}>🔓 open()</button>
      <button onClick={close} disabled={!visible}>
        🔇 close()（静默关闭，无回调）
      </button>
      <button onClick={toggle}>🔁 toggle()</button>

      <h4>操作日志：</h4>
      <ul className="log-list">
        {log.length === 0 && <li>暂无操作</li>}
        {log.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>

      <Modal
        open={visible}
        title="基础弹窗"
        onCancel={cancel}
        onOk={close}
        okText="确定"
      >
        <p>在这里点遮罩、✕ 或「取消」走的都是 cancel()，会触发 onCancel 回调。</p>
      </Modal>
    </section>
  );
}

// ── 示例 2：携带业务数据 ─────────────────────────────────────────────

interface User {
  id: number;
  name: string;
  email: string;
}

const USERS: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
];

/** 示例 2：open(data) 携带数据 + 关闭后 data 依然保留 */
function EditUserDemo() {
  const [users, setUsers] = useState(USERS);
  // data 就是「当前正在编辑的那一行」，open(row) 时一并传入；
  // 关闭后它不会清空，所以弹窗标题直接用 data?.id 即可，无需额外的 editingId
  const { visible, data, open, close, setData } = useModal<User>();

  const submit = () => {
    if (!data) return;
    setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
    close();
  };

  return (
    <section className="demo-card">
      <h2>示例 2：携带业务数据（open(data) / setData）</h2>
      <p>
        <code>open(row)</code> 把「要编辑的那一行」作为 data 传入，弹窗内直接读{' '}
        <code>data.name</code>；<code>setData</code> 用于改草稿，不影响 visible。
      </p>

      <ul className="hook-list">
        {users.map((u) => (
          <li key={u.id}>
            <span>
              <strong>{u.name}</strong> —— {u.email}
            </span>
            {/* 传副本：弹窗内的编辑是「草稿」，保存前不该污染列表数据 */}
            <button onClick={() => open({ ...u })}>✏️ 编辑</button>
          </li>
        ))}
      </ul>

      <p className="status loading">
        关闭后 hook 里的 data 仍然是：
        {data ? ` ${data.name}` : ' undefined（还没 open 过）'}
        {!visible && data && <em>（弹窗已关闭，但 data 被刻意保留）</em>}
      </p>

      <Modal
        open={visible}
        title={`编辑用户 #${data?.id ?? '-'}`}
        onCancel={close}
        onOk={submit}
        okText="💾 保存"
      >
        {data ? (
          <>
            <p>
              <label>
                姓名
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                />
              </label>
            </p>
            <p>
              <label>
                邮箱
                <input
                  type="text"
                  value={data.email}
                  onChange={(e) => setData({ ...data, email: e.target.value })}
                />
              </label>
            </p>
          </>
        ) : (
          <p>尚未选中的行 —— data 在首次 open 之前是 undefined，模板里记得兜底。</p>
        )}
      </Modal>
    </section>
  );
}

// ── 示例 3：confirm 回传结果 ─────────────────────────────────────────

/** 示例 3：confirm(result) 回传结果 + cancel 触发 onCancel */
function ConfirmDemo() {
  type Answer = 'yes' | 'no';

  const [result, setResult] = useState('（还没有做出选择）');
  const { visible, open, confirm, cancel } = useModal<Answer>({
    onConfirm: useCallback((answer?: Answer) => setResult(`onConfirm 收到：${answer}`), []),
    onCancel: useCallback(() => setResult('onCancel：用户点了取消 / 遮罩 / ✕'), []),
  });

  return (
    <section className="demo-card">
      <h2>示例 3：确认弹窗（confirm 回传结果）</h2>
      <p>
        <code>confirm('yes')</code> 关闭弹窗并把结果交给 <code>onConfirm</code>；
        点「取消」、遮罩或 ✕ 触发的是 <code>onCancel</code>。结果不会写进{' '}
        <code>data</code>，因此不会覆盖打开时携带的业务数据。
        <br />
        这里的两个按钮各有含义，用自带页脚（onOk / onCancel）表达不了，所以自定义{' '}
        <code>footer</code>；遮罩和 ✕ 仍然绑 <code>cancel</code>。
      </p>

      <button
        onClick={() => {
          setResult('（等待用户操作…）');
          open();
        }}
      >
        🗑 删除记录
      </button>
      <p className="status success">{result}</p>

      <Modal
        open={visible}
        title="确认删除"
        onCancel={cancel}
        footer={
          <>
            <Button onClick={() => confirm('no')}>再想想</Button>
            <Button danger type="primary" onClick={() => confirm('yes')}>
              确定删除
            </Button>
          </>
        }
      >
        <p>删除后不可恢复，确定继续吗？</p>
      </Modal>
    </section>
  );
}

// ── 示例 4：无数据的简单弹窗 ─────────────────────────────────────────

/** 示例 4：toggle + initialVisible，弹窗开关不影响页面其它状态 */
function SimpleToggleDemo() {
  const { visible, toggle } = useModal({ initialVisible: true });
  const [count, setCount] = useState(0);

  return (
    <section className="demo-card">
      <h2>示例 4：无数据的简单弹窗（toggle / initialVisible）</h2>
      <p>
        <code>initialVisible: true</code> 让弹窗初始就是打开的。
        下面的计数按钮用来验证：弹窗的开关不会影响页面其它状态。
      </p>

      <button onClick={toggle}>{visible ? '🔒 关闭弹窗' : '🔓 打开弹窗'}</button>
      <button onClick={() => setCount((c) => c + 1)}>➕ 页面计数：{count}</button>

      <Modal
        open={visible}
        title="温馨提示"
        onCancel={toggle}
        footer={<Button type="primary" onClick={toggle}>知道了</Button>}
      >
        <p>这个弹窗不携带任何业务数据，toggle 就够了。</p>
      </Modal>
    </section>
  );
}

// ── 页面 ────────────────────────────────────────────────────────────

export default function UseModalPage() {
  return (
    <>
      <h2>useModal：弹窗的可见性与业务数据</h2>
      <BasicDemo />
      <EditUserDemo />
      <ConfirmDemo />
      <SimpleToggleDemo />
    </>
  );
}
