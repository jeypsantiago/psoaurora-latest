import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Eye,
  EyeOff,
  Info,
  Lock,
  Shield,
  User,
} from "lucide-react";
import { useUsers } from "../UserContext";
import { useLandingConfig } from "../LandingConfigContext";
import { BACKEND_URL } from "../services/backend";
import { PublicBrand } from "../components/public/PublicBrand";
import { PublicButton } from "../components/public/PublicButton";
import { PublicCard } from "../components/public/PublicCard";
import { PublicFooter } from "../components/public/PublicFooter";

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const warmBackendConnection = () => {
  try {
    const backendOrigin = new URL(BACKEND_URL).origin;
    const existingPreconnect = document.querySelector(
      `link[rel="preconnect"][href="${backendOrigin}"]`,
    );
    if (!existingPreconnect) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = backendOrigin;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }

    void fetch(`${backendOrigin}/api/health`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
    }).catch(() => {
      // Warming is best-effort; login handles real auth errors.
    });
  } catch {
    // Invalid backend URLs are handled by the auth request itself.
  }
};

const preloadPostLoginRoute = () => {
  void Promise.all([
    import("../components/ProtectedShell"),
    import("../components/ProtectedRoute"),
    import("./Dashboard"),
  ]).catch(() => {
    // Non-critical speculative preload.
  });
};

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [isPageVisible, setIsPageVisible] = useState(false);
  const { login, requestPasswordReset, currentUser, isReady } = useUsers();
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useLandingConfig();

  const redirectTarget = useMemo(() => {
    const from = (
      location.state as {
        from?: { pathname?: string; search?: string; hash?: string };
      } | null
    )?.from;
    if (!from?.pathname || from.pathname === "/login") {
      return "/dashboard";
    }

    return `${from.pathname}${from.search || ""}${from.hash || ""}`;
  }, [location.state]);

  useEffect(() => {
    if (isReady && currentUser) {
      navigate(redirectTarget, { replace: true });
    }
  }, [currentUser, isReady, navigate, redirectTarget]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsPageVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(warmBackendConnection, 250);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!isValidEmail(email) || password.length < 8) return;

    const browserWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof browserWindow.requestIdleCallback === "function") {
      const idleId = browserWindow.requestIdleCallback(preloadPostLoginRoute, {
        timeout: 1500,
      });
      return () => browserWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(preloadPostLoginRoute, 500);
    return () => window.clearTimeout(timeoutId);
  }, [email, password]);

  const fieldErrors = useMemo(() => {
    const errs = { email: "", password: "" };
    if (!email.trim()) errs.email = "Email address is required.";
    else if (!isValidEmail(email))
      errs.email = "Please enter a valid email format.";

    if (!password) errs.password = "Password is required.";
    else if (password.length < 8)
      errs.password = "Password must be at least 8 characters.";

    return errs;
  }, [email, password]);

  const isFormValid = !fieldErrors.email && !fieldErrors.password;

  const passwordStrength = useMemo(() => {
    if (!password) return { label: "", score: 0 };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 1) return { label: "Weak", score };
    if (score <= 3) return { label: "Moderate", score };
    return { label: "Strong", score };
  }, [password]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!isFormValid) {
      setTouched({ email: true, password: true });
      return;
    }

    setIsLoading(true);
    warmBackendConnection();
    try {
      await login(email.trim(), password);
      navigate(redirectTarget, { replace: true });
    } catch {
      setError("Invalid email address or password.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!isValidEmail(email)) {
      setTouched((prev) => ({ ...prev, email: true }));
      setError(
        "Enter your account email first, then try password reset again.",
      );
      return;
    }

    setIsSendingReset(true);
    try {
      await requestPasswordReset(email);
      setNotice("Password reset email sent. Check your inbox and spam folder.");
    } catch (resetError: any) {
      setError(resetError?.message || "Unable to send password reset email.");
    } finally {
      setIsSendingReset(false);
    }
  };

  const inputBaseClass =
    "w-full border rounded-lg pl-4 pr-10 py-3 text-sm bg-white text-slate-900 placeholder-slate-400 dark:bg-[#0f0f0f] dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2";

  return (
    <div
      className={`min-h-screen bg-gradient-to-b from-white via-slate-100 to-white dark:from-[#030303] dark:via-[#050505] dark:to-[#030303] text-slate-800 dark:text-slate-100 overflow-x-hidden flex flex-col transform-gpu transition-all duration-300 ease-out ${isPageVisible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-2 blur-[1.5px]"}`}
    >
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(15,23,42,0.10),transparent_42%),radial-gradient(circle_at_85%_0%,rgba(51,65,85,0.08),transparent_30%),radial-gradient(circle_at_80%_85%,rgba(71,85,105,0.10),transparent_35%)] dark:bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.08),transparent_40%),radial-gradient(circle_at_90%_8%,rgba(255,255,255,0.05),transparent_30%),radial-gradient(circle_at_82%_90%,rgba(255,255,255,0.06),transparent_34%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(255,255,255,0.90),rgba(255,255,255,0.90)),repeating-linear-gradient(90deg,rgba(51,65,85,0.05)_0,rgba(51,65,85,0.05)_1px,transparent_1px,transparent_82px)] dark:bg-[linear-gradient(0deg,rgba(3,3,3,0.84),rgba(3,3,3,0.84)),repeating-linear-gradient(90deg,rgba(212,212,212,0.05)_0,rgba(212,212,212,0.05)_1px,transparent_1px,transparent_96px)]" />
      </div>

      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/94 dark:bg-[#060606]/92 backdrop-blur-md border-b border-psa-line dark:border-zinc-800 py-3"
            : "bg-transparent py-5"
        }`}
      >
        <div className="public-container flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 text-left hover:opacity-90 transition-opacity"
          >
            <PublicBrand />
          </button>

          <div className="flex items-center gap-3 sm:gap-6">
            <button
              onClick={() => navigate("/")}
              className="hidden sm:flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-psa-blue dark:hover:text-blue-300"
            >
              <Compass className="w-4 h-4" /> Home
            </button>
            <a
              href="#contact"
              className="hidden sm:flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-psa-blue dark:hover:text-blue-300"
            >
              <Info className="w-4 h-4" /> Contact
            </a>
            <span className="psa-elevate inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full bg-psa-blue dark:bg-zinc-800 text-white text-xs sm:text-sm font-semibold">
              <Shield className="w-4 h-4" /> Secure Access
            </span>
          </div>
        </div>
      </nav>

      <main className="public-container flex-1 flex items-center justify-center pt-32 public-section-bottom">
        <div className="w-full max-w-[1040px] grid lg:grid-cols-2 gap-8 items-stretch">
          <section className="hidden lg:flex flex-col justify-between rounded-3xl border border-psa-line dark:border-zinc-800 bg-white dark:bg-[#090909] p-8 shadow-[0_22px_50px_rgba(0,51,102,0.10)] dark:shadow-[0_24px_52px_rgba(0,0,0,0.40)]">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-psa-navy dark:text-slate-100 bg-psa-surfaceAlt dark:bg-[#121212] border border-psa-line dark:border-zinc-700 rounded-full px-4 py-2">
                Philippine Statistics Authority
              </p>
              <h1 className="mt-5 font-serif text-4xl leading-tight text-psa-ink dark:text-slate-100">
                Staff Portal Authentication
              </h1>
              <p className="mt-4 text-slate-700 dark:text-slate-300 leading-relaxed">
                Sign in with your official account to access dashboards,
                records, inventory tools, and provincial statistical reports.
              </p>
            </div>

            <div className="space-y-3">
              {[
                "Encrypted staff session and monitored authentication attempts",
                "Role-based access controls for internal modules",
                "Province-wide systems integration with central records",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-psa-line dark:border-zinc-700 bg-psa-surfaceAlt dark:bg-[#101010] px-4 py-3 flex items-center gap-3"
                >
                  <Shield className="w-4 h-4 text-psa-blue dark:text-slate-300 shrink-0" />
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <PublicCard
            elevated
            className="rounded-3xl p-6 sm:p-8 shadow-[0_24px_54px_rgba(0,51,102,0.14)] dark:shadow-[0_28px_60px_rgba(0,0,0,0.46)]"
          >
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400 font-semibold">
                  Secure Sign-In
                </p>
                <h2 className="font-serif text-3xl text-psa-navy dark:text-slate-100 mt-1">
                  Login
                </h2>
              </div>
              <img
                src="/PSA.webp"
                alt="PSA Logo"
                className="w-14 h-14 object-contain"
              />
            </div>

            <form className="space-y-5" onSubmit={handleLogin} noValidate>
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-lg flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      warmBackendConnection();
                    }}
                    onFocus={warmBackendConnection}
                    onKeyDown={warmBackendConnection}
                    onBlur={() =>
                      setTouched((prev) => ({ ...prev, email: true }))
                    }
                    className={`${inputBaseClass} ${
                      touched.email && fieldErrors.email
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-slate-300 dark:border-zinc-700 focus:border-psa-blue dark:focus:border-zinc-500 focus:ring-psa-blue/20 dark:focus:ring-zinc-500/20"
                    }`}
                    placeholder="Enter your registered email"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {touched.email && !fieldErrors.email ? (
                      <CheckCircle2
                        className="h-[18px] w-[18px] text-emerald-600"
                        strokeWidth={1.8}
                      />
                    ) : (
                      <User
                        className="h-[18px] w-[18px] text-slate-400 dark:text-slate-500"
                        strokeWidth={1.7}
                      />
                    )}
                  </div>
                </div>
                {touched.email && fieldErrors.email ? (
                  <p className="mt-1.5 text-xs text-red-600">
                    {fieldErrors.email}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Use your official PSA Aurora account.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider"
                  >
                    Password
                  </label>
                  <a
                    href="/reset-password"
                    onClick={handleForgotPassword}
                    className="text-xs font-semibold text-psa-blue dark:text-slate-200 hover:text-psa-navy dark:hover:text-white"
                  >
                    {isSendingReset ? "Sending reset..." : "Forgot password?"}
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      warmBackendConnection();
                    }}
                    onFocus={warmBackendConnection}
                    onKeyDown={warmBackendConnection}
                    onBlur={() =>
                      setTouched((prev) => ({ ...prev, password: true }))
                    }
                    onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                    className={`${inputBaseClass} ${
                      touched.password && fieldErrors.password
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-slate-300 dark:border-zinc-700 focus:border-psa-blue dark:focus:border-zinc-500 focus:ring-psa-blue/20 dark:focus:ring-zinc-500/20"
                    }`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.7} />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" strokeWidth={1.7} />
                    )}
                  </button>
                </div>

                {touched.password && fieldErrors.password ? (
                  <p className="mt-1.5 text-xs text-red-600">
                    {fieldErrors.password}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Minimum of 8 characters required.
                  </p>
                )}
                {capsLock && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Caps Lock is on.
                  </p>
                )}

                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        Password strength
                      </span>
                      <span
                        className={`font-semibold ${
                          passwordStrength.score >= 4
                            ? "text-emerald-700"
                            : passwordStrength.score >= 2
                              ? "text-amber-700"
                              : "text-red-700"
                        }`}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`h-1.5 rounded-full ${
                            passwordStrength.score >= level
                              ? passwordStrength.score >= 4
                                ? "bg-emerald-500"
                                : passwordStrength.score >= 2
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                              : "bg-slate-200 dark:bg-zinc-800"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 text-sm">
                <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-zinc-600 bg-white dark:bg-[#0f0f0f] text-psa-blue focus:ring-psa-blue/30"
                  />
                  Keep me signed in
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Secured session
                </p>
              </div>

              <PublicButton
                type="submit"
                disabled={isLoading}
                variant="primary"
                size="lg"
                fullWidth
                className="font-bold"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Login <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                  </>
                )}
              </PublicButton>
            </form>
          </PublicCard>
        </div>
      </main>

      <PublicFooter
        footer={config.footer}
        rightCaption="Secure Staff Access"
        leadText="Official provincial gateway for statistics, registration support, and institutional data services."
      />
    </div>
  );
};
