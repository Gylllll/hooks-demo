import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <>
      <h1>自定义 Hooks — 示例集</h1>
      <p>选择要查看的 Hook：</p>
      <ul className="hook-list">
        <li>
          <Link to="/use-request">useRequest</Link>
          <span>异步请求状态管理：loading / error / data 三态、手动触发、回调、乐观更新</span>
        </li>
        <li>
          <Link to="/use-cache">useCache</Link>
          <span>带过期时间的本地缓存：读写、有效期、local/session、跨标签页同步</span>
        </li>
      </ul>
    </>
  );
}
