import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section className="page" aria-labelledby="not-found-heading">
      <p className="eyebrow">404</p>
      <h1 id="not-found-heading">Page not found</h1>
      <p className="page__lede">The page you requested is not part of the ChargeWise shell.</p>
      <Link className="text-link" to="/">
        Return home
      </Link>
    </section>
  );
}
