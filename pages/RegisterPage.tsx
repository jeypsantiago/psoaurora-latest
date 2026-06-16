import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Eye,
  EyeOff,
  FilePlus2,
  Info,
  Shield,
  UserPlus,
} from "lucide-react";
import { useLandingConfig } from "../LandingConfigContext";
import { PublicBrand } from "../components/public/PublicBrand";
import { PublicButton } from "../components/public/PublicButton";
import { PublicCard } from "../components/public/PublicCard";
import { PublicFooter } from "../components/public/PublicFooter";
import { useUsers } from "../UserContext";

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const RegisterPage: React.FC = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    position: "",
    gender: "Male",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(false);
  const { register, currentUser, isReady } = useUsers();
  const { config } = useLandingConfig();
  const navigate = useNavigate();

  const [inviteCode, setInviteCode] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [showInviteCode, setShowInviteCode] = useState(false);

  const handleVerifyInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    if (inviteCode.trim() === "psoaurora@2026") {
      setIsUnlocked(true);
    } else {
      setInviteError("Invalid invitation code. Please try again.");
    }
  };

  useEffect(() => {
    if (isReady && currentUser) {
      navigate("/reports?action=new-project", { replace: true });
    }
  }, [currentUser, isReady, navigate]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsPageVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Full name is required.";
    if (!form.email.trim()) errors.email = "Email address is required.";
    else if (!isValidEmail(form.email)) errors.email = "Enter a valid email address.";
    if (!form.password) errors.password = "Password is required.";
    else if (form.password.length < 8) errors.password = "Password must be at least 8 characters.";
    if (!form.confirmPassword) errors.confirmPassword = "Confirm your password.";
    else if (form.confirmPassword !== form.password) errors.confirmPassword = "Passwords do not match.";
    return errors;
  }, [form]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const markTouched = (field: keyof typeof form) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!isFormValid) {
      setTouched({
        name: true,
        email: true,
        password: true,
        confirmPassword: true,
      });
      return;
    }

    setIsLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        position: form.position.trim(),
        gender: form.gender,
        password: form.password,
      });
      navigate("/reports?action=new-project", { replace: true });
    } catch (registrationError: any) {
      setError(registrationError?.message || "Unable to create account.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputBaseClass =
    "w-full border rounded-lg px-4 py-3 text-sm bg-white text-slate-900 placeholder-slate-400 dark:bg-[#0f0f0f] dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2";
  const iconInputClass = `${inputBaseClass} pr-10`;
  const fieldClass = (field: keyof typeof form) =>
    touched[field] && fieldErrors[field]
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-slate-300 dark:border-zinc-700 focus:border-psa-blue dark:focus:border-zinc-500 focus:ring-psa-blue/20 dark:focus:ring-zinc-500/20";

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
            <button
              onClick={() => navigate("/login")}
              className="psa-elevate inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full bg-psa-blue dark:bg-zinc-800 text-white text-xs sm:text-sm font-semibold"
            >
              <Shield className="w-4 h-4" /> Sign In
            </button>
          </div>
        </div>
      </nav>

      <main className="public-container flex-1 flex items-center justify-center pt-32 public-section-bottom">
        <div className="w-full max-w-[1080px] grid lg:grid-cols-[0.9fr_1.1fr] gap-8 items-stretch">
          <section className="hidden lg:flex flex-col justify-between rounded-3xl border border-psa-line dark:border-zinc-800 bg-white dark:bg-[#090909] p-8 shadow-[0_22px_50px_rgba(0,51,102,0.10)] dark:shadow-[0_24px_52px_rgba(0,0,0,0.40)]">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-psa-navy dark:text-slate-100 bg-psa-surfaceAlt dark:bg-[#121212] border border-psa-line dark:border-zinc-700 rounded-full px-4 py-2">
                Report Monitoring Access
              </p>
              <h1 className="mt-5 font-serif text-4xl leading-tight text-psa-ink dark:text-slate-100">
                Create your account and start your activity tracker.
              </h1>
              <p className="mt-4 text-slate-700 dark:text-slate-300 leading-relaxed">
                New accounts receive report contributor access for creating owned projects, deadlines, and report schedules.
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Create your Project/Activity after registration",
                "Add report schedules under your own project",
                "Track deadlines and submission status from Report Monitoring",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-psa-line dark:border-zinc-700 bg-psa-surfaceAlt dark:bg-[#101010] px-4 py-3 flex items-center gap-3"
                >
                  <FilePlus2 className="w-4 h-4 text-psa-blue dark:text-slate-300 shrink-0" />
                  <p className="text-sm text-slate-700 dark:text-slate-300">{item}</p>
                </div>
              ))}
            </div>
          </section>

          {isUnlocked ? (
            <PublicCard
              elevated
              className="rounded-3xl p-6 sm:p-8 shadow-[0_24px_54px_rgba(0,51,102,0.14)] dark:shadow-[0_28px_60px_rgba(0,0,0,0.46)]"
            >
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400 font-semibold">
                    Self Registration
                  </p>
                  <h2 className="font-serif text-3xl text-psa-navy dark:text-slate-100 mt-1">
                    Create Account
                  </h2>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-psa-blue text-white flex items-center justify-center">
                  <UserPlus className="w-7 h-7" />
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-300 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <input
                      id="name"
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      onBlur={() => markTouched("name")}
                      className={`${inputBaseClass} ${fieldClass("name")}`}
                      placeholder="Enter your full name"
                    />
                    {touched.name && fieldErrors.name && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.name}</p>}
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      onBlur={() => markTouched("email")}
                      className={`${inputBaseClass} ${fieldClass("email")}`}
                      placeholder="Enter your email"
                    />
                    {touched.email && fieldErrors.email && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="position" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Position / Designation
                    </label>
                    <input
                      id="position"
                      value={form.position}
                      onChange={(event) => updateField("position", event.target.value)}
                      onBlur={() => markTouched("position")}
                      className={`${inputBaseClass} ${fieldClass("position")}`}
                      placeholder="e.g. focal person, statistician"
                    />
                    {touched.position && fieldErrors.position && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.position}</p>}
                  </div>
                  <div>
                    <label htmlFor="gender" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Gender
                    </label>
                    <select
                      id="gender"
                      value={form.gender}
                      onChange={(event) => updateField("gender", event.target.value)}
                      className="w-full border border-slate-300 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm bg-white text-slate-900 placeholder-slate-400 dark:bg-[#0f0f0f] dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-psa-blue dark:focus:border-zinc-500 focus:ring-psa-blue/20 dark:focus:ring-zinc-500/20"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(event) => updateField("password", event.target.value)}
                        onBlur={() => markTouched("password")}
                        className={`${iconInputClass} ${fieldClass("password")}`}
                        placeholder="Minimum 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                    {touched.password && fieldErrors.password && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.password}</p>}
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        onChange={(event) => updateField("confirmPassword", event.target.value)}
                        onBlur={() => markTouched("confirmPassword")}
                        className={`${iconInputClass} ${fieldClass("confirmPassword")}`}
                        placeholder="Repeat password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                      >
                        {showConfirmPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                    {touched.confirmPassword && fieldErrors.confirmPassword ? (
                      <p className="mt-1.5 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
                    ) : form.confirmPassword && !fieldErrors.confirmPassword ? (
                      <p className="mt-1.5 text-xs text-emerald-700 inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Passwords match
                      </p>
                    ) : null}
                  </div>
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
                      Create Account <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                    </>
                  )}
                </PublicButton>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="font-bold text-psa-blue dark:text-blue-300 hover:text-psa-navy dark:hover:text-white"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            </PublicCard>
          ) : (
            <PublicCard
              elevated
              className="rounded-3xl p-6 sm:p-8 shadow-[0_24px_54px_rgba(0,51,102,0.14)] dark:shadow-[0_28px_60px_rgba(0,0,0,0.46)] flex flex-col justify-center"
            >
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400 font-semibold">
                    Access Code Required
                  </p>
                  <h2 className="font-serif text-3xl text-psa-navy dark:text-slate-100 mt-1">
                    Enter Invite Code
                  </h2>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center">
                  <Shield className="w-7 h-7" />
                </div>
              </div>

              <p className="text-slate-600 dark:text-slate-350 text-sm leading-relaxed mb-6">
                Registration is limited to authorized focal persons and statisticians of PSA Aurora. Please enter the invitation code provided by the administrator to unlock the registration form.
              </p>

              <form onSubmit={handleVerifyInvite} className="space-y-4">
                {inviteError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-300 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{inviteError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="invite-code" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Invitation Code
                  </label>
                  <div className="relative">
                    <input
                      id="invite-code"
                      type={showInviteCode ? "text" : "password"}
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className="w-full border border-slate-300 dark:border-zinc-700 rounded-lg pl-4 pr-10 py-3 text-sm bg-white text-slate-900 placeholder-slate-400 dark:bg-[#0f0f0f] dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-psa-blue dark:focus:border-zinc-500 focus:ring-psa-blue/20 dark:focus:ring-zinc-500/20"
                      placeholder="Enter security invite code"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowInviteCode((value) => !value)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                    >
                      {showInviteCode ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>
                </div>

                <PublicButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="font-bold mt-2"
                >
                  Unlock Registration <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </PublicButton>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
                  Back to portal?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="font-bold text-psa-blue dark:text-blue-300 hover:text-psa-navy dark:hover:text-white"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            </PublicCard>
          )}
        </div>
      </main>

      <PublicFooter
        footer={config.footer}
        rightCaption="Report Monitoring Access"
        leadText="Official provincial gateway for statistics, registration support, and institutional data services."
      />
    </div>
  );
};

