import { Link } from "react-router";

import { getApiErrorMessage } from "../api/api-client.ts";
import { useCurrentUser } from "../auth/use-current-user.ts";

export function HomePage() {
  const currentUserQuery = useCurrentUser();

  if (currentUserQuery.isPending) {
    return (
      <section aria-busy="true" aria-live="polite" className="page">
        <p className="eyebrow">ChargeWise</p>
        <h1>Loading your trip planner…</h1>
      </section>
    );
  }

  if (currentUserQuery.isError) {
    return (
      <section aria-labelledby="home-error-heading" className="page">
        <p className="eyebrow">Connection problem</p>
        <h1 id="home-error-heading">We could not load your home page.</h1>
        <p className="page__lede">
          {getApiErrorMessage(
            currentUserQuery.error,
            "ChargeWise could not restore your account information.",
          )}
        </p>
        <div className="page__actions">
          <button
            className="button button--primary"
            onClick={() => {
              void currentUserQuery.refetch();
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (currentUserQuery.data !== null && currentUserQuery.data !== undefined) {
    return (
      <section aria-labelledby="home-heading" className="page">
        <p className="eyebrow">Welcome back</p>
        <h1 id="home-heading">Where are you driving today?</h1>
        <p className="page__lede">
          Plan a route with your saved EV, compare compatible charging stations, or review your
          vehicle details.
        </p>

        <div className="page__actions">
          <Link className="button button--primary" to="/routes">
            Plan a route
          </Link>
          <Link className="text-link" to="/vehicles">
            View vehicles
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="home-heading" className="page">
      <p className="eyebrow">EV route planning</p>
      <h1 id="home-heading">Plan charging stops with confidence.</h1>
      <p className="page__lede">
        ChargeWise combines route-based charger discovery with your vehicles and charging history.
      </p>

      <div className="page__actions">
        <Link className="button button--primary" to="/register">
          Create your account
        </Link>
        <Link className="text-link" to="/login">
          Sign in
        </Link>
      </div>
    </section>
  );
}
