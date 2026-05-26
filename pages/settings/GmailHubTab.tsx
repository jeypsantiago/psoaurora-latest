import React, { useCallback, useMemo } from "react";
import { AlertTriangle, LogOut, Mail, Plus, Trash2 } from "lucide-react";
import { useGoogleLogin } from "@react-oauth/google";
import { Button, Card } from "../../components/ui";
import { useGoogleAuth } from "../../components/GoogleAuthProvider";
import { normalizeGmailWhitelist } from "../../services/gmailWhitelist";

interface GmailHubTabProps {
  whitelist: string[];
  onAddSender: () => void;
  onRemoveSender: (email: string) => void;
}

export const GmailHubTab: React.FC<GmailHubTabProps> = ({
  whitelist,
  onAddSender,
  onRemoveSender,
}) => {
  const { setAccessToken, isAuthenticated } = useGoogleAuth();
  const normalizedWhitelist = useMemo(
    () => normalizeGmailWhitelist(whitelist, []),
    [whitelist],
  );
  const oauthUnavailable = typeof window === "undefined";
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setAccessToken(tokenResponse.access_token);
    },
    onError: (errorResponse) => {
      console.warn("Gmail OAuth sign-in failed.", errorResponse);
    },
    scope: "https://www.googleapis.com/auth/gmail.readonly",
  });
  const signInButtonLabel = useMemo(
    () => (oauthUnavailable ? "Google Sign-In Unavailable" : "Sign in with Google"),
    [oauthUnavailable],
  );
  const handleSignIn = useCallback(() => {
    if (oauthUnavailable) {
      console.warn("Gmail OAuth is unavailable in this environment.");
      return;
    }

    login();
  }, [login, oauthUnavailable]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
      <Card
        title="Gmail Hub Integration"
        description="Manage Google account connection and email filtering rules"
      >
        <div className="space-y-8">
          <div className="p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div
                  className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-xl ${
                    isAuthenticated
                      ? "bg-emerald-500 text-white shadow-emerald-500/20"
                      : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                  }`}
                >
                  <Mail size={32} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-zinc-900 dark:text-white">
                    Google Workspace Status
                  </h4>
                  <p className="text-xs text-zinc-500 font-medium">
                    {isAuthenticated
                      ? "System is connected to Google Services"
                      : "No account currently connected"}
                  </p>
                </div>
              </div>
              {isAuthenticated ? (
                <Button
                  variant="ghost"
                  className="bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 !px-6 h-12 rounded-2xl text-xs font-bold"
                  onClick={() => setAccessToken(null)}
                >
                  <LogOut size={16} className="mr-2" /> Disconnect Account
                </Button>
              ) : (
                <Button
                  variant="blue"
                  className="!px-8 h-12 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-500/20"
                  onClick={handleSignIn}
                  disabled={oauthUnavailable}
                >
                  {signInButtonLabel}
                </Button>
              )}
            </div>
            {oauthUnavailable && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p className="text-xs font-semibold leading-relaxed">
                  Google sign-in is not available in this browser context. You
                  can still manage approved senders below.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">
                Approved Senders Whitelist
              </h4>
              <Button
                variant="outline"
                className="!py-1.5 !px-3 h-auto text-[10px]"
                onClick={onAddSender}
              >
                <Plus size={14} className="mr-1" /> Add Sender
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {normalizedWhitelist.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 group hover:border-blue-400 transition-all"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white truncate pr-2">
                      {email}
                    </span>
                    <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-tighter">
                      Verified Provider
                    </span>
                  </div>
                  <button
                    onClick={() => onRemoveSender(email)}
                    className="p-2 text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
