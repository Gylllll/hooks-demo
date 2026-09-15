import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import UseRequestPage from './pages/UseRequestPage';
import UseCachePage from './pages/UseCachePage';
import './App.css';

// ── 总入口 ──────────────────────────────────────────────────────────

function App() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <nav className="nav">
        <NavLink to="/" end>
          🏠 首页
        </NavLink>
        <NavLink to="/use-request">useRequest</NavLink>
        <NavLink to="/use-cache">useCache</NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/use-request" element={<UseRequestPage />} />
        <Route path="/use-cache" element={<UseCachePage />} />
        <Route path="*" element={<p className="status error">404：页面不存在</p>} />
      </Routes>
    </main>
  );
}

export default App;
