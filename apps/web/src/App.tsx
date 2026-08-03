import { NavLink, Outlet } from "react-router";

import "./App.css";

function getNavigationClassName(isActive: boolean): string {
  return isActive ? "navigation__link navigation__link--active" : "navigation__link";
}

function App() {
  return (
    <div className="page-shell">
      <header className="page-shell__header">
        <NavLink className="brand" to="/">
          ChargeWise
        </NavLink>
        <nav aria-label="Primary navigation" className="navigation">
          <NavLink className={({ isActive }) => getNavigationClassName(isActive)} end to="/">
            Home
          </NavLink>
          {import.meta.env.DEV && (
            <NavLink
              className={({ isActive }) => getNavigationClassName(isActive)}
              to="/diagnostics"
            >
              Diagnostics
            </NavLink>
          )}
        </nav>
      </header>

      <main className="page-shell__content">
        <Outlet />
      </main>

      <footer className="page-shell__footer">ChargeWise application shell</footer>
    </div>
  );
}

export default App;
