import { Link } from "react-router";

export function HomePage() {
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
