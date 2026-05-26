import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Search,
  RefreshCw,
  Download,
  FileText,
  User,
  Clock,
  ChevronRight,
  Loader2,
  AlertCircle,
  Settings2,
} from "lucide-react";
import { Card, Button, Badge, Modal } from "../components/ui";

import { useGoogleAuth } from "../components/GoogleAuthProvider";

import { gmailService, EmailMessage } from "../services/gmail.service";
import { useToast } from "../ToastContext";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { readStorageJson, readStorageJsonSafe, writeStorageJson } from "../services/storage";
import {
  getDefaultGmailWhitelist,
  normalizeGmailWhitelist,
} from "../services/gmailWhitelist";

export const GmailHub: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken, isAuthenticated } = useGoogleAuth();
  const { toast } = useToast();
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [senderFilter, setSenderFilter] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);

  // Track which emails have been opened locally
  const [openedEmailIds, setOpenedEmailIds] = useState<string[]>(() => {
    return readStorageJson<string[]>(STORAGE_KEYS.gmailOpenedIds, []);
  });

  useEffect(() => {
    writeStorageJson(STORAGE_KEYS.gmailOpenedIds, openedEmailIds);
  }, [openedEmailIds]);

  // Sender Whitelist - Only emails from these addresses will be shown
  const [whitelist, _setWhitelist] = useState<string[]>(() => {
    return normalizeGmailWhitelist(
      readStorageJsonSafe<unknown>(
        STORAGE_KEYS.gmailWhitelist,
        getDefaultGmailWhitelist(),
      ),
    );
  });

  useEffect(() => {
    writeStorageJson(STORAGE_KEYS.gmailWhitelist, normalizeGmailWhitelist(whitelist, []));
  }, [whitelist]);

  const handleSelectEmail = (email: EmailMessage) => {
    setSelectedEmail(email);
    if (!openedEmailIds.includes(email.id)) {
      setOpenedEmailIds((prev) => [...prev, email.id]);
    }
  };

  const fetchEmails = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      // Construct query based on whitelist and manual filter
      let query = "";
      if (whitelist.length > 0) {
        query = `from:(${whitelist.join(" OR ")})`;
      }

      if (senderFilter) {
        query += ` from:${senderFilter}`;
      }

      const messages = await gmailService.listMessages(accessToken, query);
      const details = await Promise.all(
        messages.map((m: any) => gmailService.getMessage(accessToken, m.id)),
      );
      setEmails(details);
    } catch (err: any) {
      setError(
        "Failed to fetch emails. Please check your connection or sign in again.",
      );
      console.error(err);
    } finally {
      setLoading(false);
      if (isAuthenticated) toast("success", "Emails synced with Gmail");
    }
  }, [accessToken, isAuthenticated, senderFilter, toast, whitelist]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchEmails();
    }
  }, [fetchEmails, isAuthenticated]);

  const handleDownloadAttachment = async (
    emailId: string,
    attachmentId: string,
    filename: string,
  ) => {
    if (!accessToken) return;
    try {
      const data = await gmailService.getAttachment(
        accessToken,
        emailId,
        attachmentId,
      );
      const blob = new Blob(
        [
          Uint8Array.from(
            atob(data.replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0),
          ),
        ],
        { type: "application/octet-stream" },
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err) {
      console.error("Failed to download attachment", err);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-[32px] flex items-center justify-center text-blue-600 mb-8 shadow-xl shadow-blue-500/10">
          <Mail size={48} />
        </div>
        <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-2 tracking-tight">
          Gmail Disconnected
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mb-10 text-sm font-medium leading-relaxed">
          Account connection and approved sender lists are now managed in the
          system settings.
        </p>
        <Button
          variant="blue"
          onClick={() => navigate("/settings?tab=gmail")}
          className="px-10 h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-500/20"
        >
          Go to Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Gmail Hub
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="info" className="!px-3 py-1 font-bold">
              Connected
            </Badge>
            <span className="text-zinc-400 dark:text-zinc-500 text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 ml-1">
              <Clock size={12} /> Last synced: Just now
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchEmails}
            disabled={loading}
            className="h-11 rounded-xl"
          >
            {loading ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <RefreshCw size={14} className="mr-2" />
            )}
            Sync Inbox
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/settings?tab=gmail")}
            className="h-11 w-11 p-0 rounded-xl bg-zinc-100 dark:bg-zinc-900"
          >
            <Settings2 size={18} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Email List */}
        <div className="xl:col-span-12">
          <Card
            title="Incoming Messages"
            description="Automatic stream from Aurora Provincial senders"
            action={
              <div className="relative w-full sm:w-64">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  size={14}
                />
                <input
                  type="text"
                  placeholder="Filter by sender email..."
                  value={senderFilter}
                  onChange={(e) => setSenderFilter(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchEmails()}
                  className="w-full pl-9 pr-4 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            }
          >
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl flex gap-3 text-red-600 dark:text-red-400 mb-6">
                <AlertCircle size={18} />
                <p className="text-xs font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              {loading && emails.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-400">
                  <Loader2 size={32} className="animate-spin mb-4" />
                  <p className="text-sm font-medium">Fetching messages...</p>
                </div>
              ) : emails.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">
                  <p className="text-sm">No messages found for this sender.</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-5 sm:mx-0">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800">
                        <th className="pb-4 px-5 sm:px-0 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          Sender
                        </th>
                        <th className="pb-4 px-5 sm:px-0 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          Subject
                        </th>
                        <th className="pb-4 px-5 sm:px-0 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          Attachments
                        </th>
                        <th className="pb-4 px-5 sm:px-0 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="pb-4 px-5 sm:px-0 text-[11px] font-bold text-zinc-400 uppercase tracking-wider text-right">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                      {emails.map((email) => {
                        const isUnread = !openedEmailIds.includes(email.id);
                        return (
                          <tr
                            key={email.id}
                            className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
                          >
                            <td className="py-4 px-5 sm:px-0">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-full ${isUnread ? "bg-blue-600 text-white" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"} flex items-center justify-center transition-colors`}
                                >
                                  <User size={14} />
                                </div>
                                <div className="max-w-[150px] truncate">
                                  <div className="flex items-center gap-2">
                                    <p
                                      className={`text-sm ${isUnread ? "font-black text-zinc-900 dark:text-white" : "font-semibold text-zinc-900 dark:text-white"} leading-none truncate`}
                                    >
                                      {email.from.split(" <")[0]}
                                    </p>
                                    {isUnread && (
                                      <Badge
                                        variant="blue"
                                        className="!px-1.5 !py-0 text-[9px] h-4"
                                      >
                                        NEW
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-zinc-500 mt-1 truncate">
                                    {email.from.includes("<")
                                      ? email.from
                                          .split("<")[1]
                                          .replace(">", "")
                                      : email.from}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-5 sm:px-0">
                              <p
                                className={`text-sm ${isUnread ? "font-bold text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-400 font-medium"} max-w-[250px] truncate`}
                              >
                                {email.subject}
                              </p>
                              <p className="text-[11px] text-zinc-400 truncate max-w-[250px]">
                                {email.snippet}
                              </p>
                            </td>
                            <td className="py-4 px-5 sm:px-0">
                              {email.attachments.length > 0 ? (
                                <div className="flex items-center gap-1">
                                  <Badge variant="info" className="!px-2">
                                    {email.attachments.length} files
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-[11px] text-zinc-400">
                                  None
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-5 sm:px-0">
                              <span className="text-[11px] text-zinc-500 font-medium">
                                {email.date
                                  .split(",")[1]
                                  ?.trim()
                                  .split(" ")
                                  .slice(0, 3)
                                  .join(" ") || email.date}
                              </span>
                            </td>
                            <td className="py-4 px-5 sm:px-0 text-right">
                              <Button
                                variant="ghost"
                                onClick={() => handleSelectEmail(email)}
                                className="!p-2 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
                              >
                                <ChevronRight size={18} />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Email Detail Modal */}
      <Modal
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
        title={selectedEmail?.subject || "Email Details"}
        maxWidth="max-w-4xl"
      >
        {selectedEmail && (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <Badge variant="info" className="shrink-0">
                  From
                </Badge>
                <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                  {selectedEmail.from}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="default" className="shrink-0">
                  Date
                </Badge>
                <span className="text-xs text-zinc-500 font-medium">
                  {selectedEmail.date}
                </span>
              </div>
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none p-6 rounded-[24px] bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 text-sm overflow-x-auto min-h-[200px]">
              <div
                dangerouslySetInnerHTML={{
                  __html: selectedEmail.body || selectedEmail.snippet,
                }}
              />
            </div>

            {selectedEmail.attachments.length > 0 && (
              <div className="space-y-3 pb-4">
                <h4 className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Download size={14} /> Attachments (
                  {selectedEmail.attachments.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedEmail.attachments.map((file) => (
                    <div
                      key={file.id}
                      className="p-4 rounded-[20px] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600">
                          <FileText size={18} />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate pr-2">
                            {file.filename}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          handleDownloadAttachment(
                            selectedEmail.id,
                            file.id,
                            file.filename,
                          )
                        }
                        className="!p-2 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <Download size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
