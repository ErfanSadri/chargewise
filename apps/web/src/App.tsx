import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router";

import "./App.css";
import { authenticationQueryKey, logoutUser } from "./api/auth-client.ts";
import { getApiErrorMessage } from "./api/api-client.ts";
import { chargingSessionsQueryKey } from "./api/charging-session-client.ts";
import { favoritesQueryKey } from "./api/favorite-client.ts";
import { vehiclesQueryKey } from "./api/vehicle-client.ts";
import { useCurrentUser } from "./auth/use-current-user.ts";

function getNavigationClassName(isActive: boolean): string {
  return isActive ? "navigation__link navigation__link--active" : "navigation__link";
}

function App() {
  const currentUserQuery = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      queryClient.setQueryData(authenticationQueryKey, null);

      queryClient.removeQueries({
        queryKey: vehiclesQueryKey,
      });
      queryClient.removeQueries({
        queryKey: favoritesQueryKey,
      });
      queryClient.removeQueries({
        queryKey: chargingSessionsQueryKey,
      });

      navigate("/login", {
        replace: true,
      });
    },
  });

  const user = currentUserQuery.data;

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

          {user !== null && user !== undefined && (
            <>
              <NavLink className={({ isActive }) => getNavigationClassName(isActive)} to="/routes">
                Plan route
              </NavLink>
              <NavLink
                className={({ isActive }) => getNavigationClassName(isActive)}
                to="/vehicles"
              >
                Vehicles
              </NavLink>
              <NavLink
                className={({ isActive }) => getNavigationClassName(isActive)}
                to="/sessions"
              >
                Charging history
              </NavLink>
            </>
          )}

          {import.meta.env.DEV && (
            <NavLink
              className={({ isActive }) => getNavigationClassName(isActive)}
              to="/diagnostics"
            >
              Diagnostics
            </NavLink>
          )}

          {!currentUserQuery.isPending &&
            (user === null ? (
              <>
                <NavLink className={({ isActive }) => getNavigationClassName(isActive)} to="/login">
                  Sign in
                </NavLink>
                <NavLink className="navigation__action" to="/register">
                  Get started
                </NavLink>
              </>
            ) : user !== undefined ? (
              <button
                className="navigation__button"
                disabled={logoutMutation.isPending}
                onClick={() => {
                  logoutMutation.mutate();
                }}
                type="button"
              >
                {logoutMutation.isPending ? "Signing out…" : "Sign out"}
              </button>
            ) : null)}
        </nav>
      </header>

      {logoutMutation.isError && (
        <p className="page-shell__notice" role="alert">
          {getApiErrorMessage(logoutMutation.error, "ChargeWise could not sign you out.")}
        </p>
      )}

      <main className="page-shell__content">
        <Outlet />
      </main>

      <footer className="page-shell__footer">ChargeWise application shell</footer>
    </div>
  );
}

export default App;
