import { Link, isRouteErrorResponse, useRouteError } from "react-router";

function getErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return "The requested page could not be found.";
  }

  return "The page could not be displayed. Please try again.";
}

export function RouteErrorPage() {
  const error = useRouteError();

  return (
    <main className="route-error">
      <section className="page" aria-labelledby="route-error-heading">
        <p className="eyebrow">Application error</p>
        <h1 id="route-error-heading">Something went wrong</h1>
        <p className="page__lede">{getErrorMessage(error)}</p>
        <Link className="text-link" to="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
