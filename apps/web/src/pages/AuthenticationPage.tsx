import {
  authenticationCredentialsSchema,
  type AuthenticationCredentials,
} from "@chargewise/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { authenticationQueryKey, loginUser, registerUser } from "../api/auth-client.ts";
import { getApiErrorMessage } from "../api/api-client.ts";
import { vehiclesQueryKey } from "../api/vehicle-client.ts";

import "./AuthenticationPage.css";

export interface AuthenticationPageProps {
  mode: "login" | "register";
}

function getDestination(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) {
    return "/vehicles";
  }

  const from = (state as { from?: unknown }).from;

  return typeof from === "string" && from.startsWith("/") ? from : "/vehicles";
}

export function AuthenticationPage({ mode }: AuthenticationPageProps) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const isLogin = mode === "login";

  const authenticationMutation = useMutation({
    mutationFn: (credentials: AuthenticationCredentials) =>
      isLogin ? loginUser(credentials) : registerUser(credentials),

    onSuccess: (user) => {
      queryClient.setQueryData(authenticationQueryKey, user);

      queryClient.removeQueries({
        queryKey: vehiclesQueryKey,
      });

      navigate(getDestination(location.state), {
        replace: true,
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setValidationMessage(null);
    authenticationMutation.reset();

    const formData = new FormData(event.currentTarget);

    const validation = authenticationCredentialsSchema.safeParse({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });

    if (!validation.success) {
      setValidationMessage(
        validation.error.issues[0]?.message ?? "Please review your email and password.",
      );
      return;
    }

    authenticationMutation.mutate(validation.data);
  }

  const serverMessage = authenticationMutation.isError
    ? getApiErrorMessage(
        authenticationMutation.error,
        isLogin ? "ChargeWise could not sign you in." : "ChargeWise could not create your account.",
      )
    : null;

  const message = validationMessage ?? serverMessage;

  return (
    <section aria-labelledby="authentication-heading" className="authentication-page">
      <div className="authentication-page__intro">
        <p className="eyebrow">{isLogin ? "Welcome back" : "Create your account"}</p>
        <h1 id="authentication-heading">
          {isLogin
            ? "Continue planning with your saved vehicles."
            : "Start building your personal charging profile."}
        </h1>
        <p>
          Your session is stored securely by the ChargeWise API and restored when you refresh the
          page.
        </p>
      </div>

      <form className="authentication-form" noValidate onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor={`${mode}-email`}>Email address</label>
          <input
            autoComplete="email"
            id={`${mode}-email`}
            maxLength={320}
            name="email"
            required
            type="email"
          />
        </div>

        <div className="form-field">
          <label htmlFor={`${mode}-password`}>Password</label>
          <input
            aria-describedby={`${mode}-password-hint`}
            autoComplete={isLogin ? "current-password" : "new-password"}
            id={`${mode}-password`}
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
          <p className="form-field__hint" id={`${mode}-password-hint`}>
            Passwords must contain 12–128 characters.
          </p>
        </div>

        {message !== null && (
          <p className="form-message form-message--error" role="alert">
            {message}
          </p>
        )}

        <button
          className="button button--primary authentication-form__submit"
          disabled={authenticationMutation.isPending}
          type="submit"
        >
          {authenticationMutation.isPending
            ? isLogin
              ? "Signing in…"
              : "Creating account…"
            : isLogin
              ? "Sign in"
              : "Create account"}
        </button>

        <p className="authentication-form__alternate">
          {isLogin ? "New to ChargeWise?" : "Already have an account?"}{" "}
          <Link to={isLogin ? "/register" : "/login"}>
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </form>
    </section>
  );
}
