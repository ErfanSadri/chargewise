import { Navigate, Outlet, useLocation } from "react-router";

import { getApiErrorMessage } from "../api/api-client.ts";
import { useCurrentUser } from "./use-current-user.ts";

export function RequireAuthentication() {
  const location = useLocation();
  const currentUserQuery = useCurrentUser();

  if (currentUserQuery.isPending) {
    return (
      <section aria-busy="true" aria-live="polite" className="route-status">
        <p className="eyebrow">Secure session</p>
        <h1>Restoring your session…</h1>
      </section>
    );
  }

  if (currentUserQuery.isError) {
    return (
      <section aria-labelledby="session-error-heading" className="route-status">
        <p className="eyebrow">Connection problem</p>
        <h1 id="session-error-heading">We could not restore your session.</h1>
        <p>
          {getApiErrorMessage(
            currentUserQuery.error,
            "ChargeWise could not reach the authentication service.",
          )}
        </p>
        <button
          className="button button--primary"
          onClick={() => {
            void currentUserQuery.refetch();
          }}
          type="button"
        >
          Try again
        </button>
      </section>
    );
  }

  if (currentUserQuery.data === null) {
    const from = `${location.pathname}${location.search}${location.hash}`;

    return <Navigate replace state={{ from }} to="/login" />;
  }

  return <Outlet />;
}
