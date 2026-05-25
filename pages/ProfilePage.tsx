import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Mail,
  ShieldCheck,
  PenTool,
  Save,
  Lock,
  ChevronRight,
  Info,
  Upload,
  Trash2,
} from "lucide-react";
import { useUsers } from "../UserContext";
import { useDialog } from "../DialogContext";
import {
  Button,
  Input,
  Card,
  Modal,
  UploadProgressInline,
} from "../components/ui";
import { useToast } from "../ToastContext";
import { useTheme } from "../theme-context";
import { Theme } from "../types";
import { getRoleBadgeStyle } from "../utils/roleBadges";

type SignaturePoint = {
  x: number;
  y: number;
};

type SignatureStroke = {
  points: SignaturePoint[];
};

type UploadNoticeState = {
  visible: boolean;
  tone: "success" | "error";
  message: string;
};

type SaveStatusState = {
  status: "idle" | "saving" | "success" | "error";
  message: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getSignatureStrokeWidth = (width: number, height: number) =>
  Math.max(2.4, Math.min(width, height) * 0.005);

const renderSignatureStrokes = (
  ctx: CanvasRenderingContext2D,
  strokes: SignatureStroke[],
  width: number,
  height: number,
  strokeColor: string,
) => {
  ctx.clearRect(0, 0, width, height);
  if (strokes.length === 0) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = getSignatureStrokeWidth(width, height);

  strokes.forEach((stroke) => {
    const points = stroke.points.map((point) => ({
      x: point.x * width,
      y: point.y * height,
    }));

    if (points.length === 0) return;

    if (points.length === 1) {
      const radius = ctx.lineWidth / 2;
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      return;
    }

    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }

    const lastPoint = points[points.length - 1];
    ctx.lineTo(lastPoint.x, lastPoint.y);
    ctx.stroke();
  });

  ctx.restore();
};

const appendSignaturePoints = (
  target: SignaturePoint[],
  incoming: SignaturePoint[],
) => {
  incoming.forEach((point) => {
    const normalizedPoint = {
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    };
    const previous = target[target.length - 1];
    if (
      !previous ||
      Math.hypot(
        normalizedPoint.x - previous.x,
        normalizedPoint.y - previous.y,
      ) >= 0.0004
    ) {
      target.push(normalizedPoint);
    }
  });
};

export const ProfilePage: React.FC = () => {
  const { currentUser, updateUser, roles } = useUsers();
  const { alert } = useDialog();
  const { toast } = useToast();
  const { theme } = useTheme();
  const [profileFormData, setProfileFormData] = useState({
    name: "",
    email: "",
    gender: "",
    position: "",
    password: "",
  });

  // -- Signature Drawing Logic --
  const [signatureMode, setSignatureMode] = useState<"upload" | "draw">(
    "upload",
  );
  const [isSignatureDrawModalOpen, setIsSignatureDrawModalOpen] =
    useState(false);
  const [hasSignatureInk, setHasSignatureInk] = useState(false);
  const [hasUnsavedSignatureDraft, setHasUnsavedSignatureDraft] =
    useState(false);
  const [avatarUploadNotice, setAvatarUploadNotice] =
    useState<UploadNoticeState | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarSaveStatus, setAvatarSaveStatus] = useState<SaveStatusState>({
    status: "idle",
    message: "",
  });
  const [signatureSaveStatus, setSignatureSaveStatus] =
    useState<SaveStatusState>({
      status: "idle",
      message: "",
    });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarPreviewObjectUrlRef = useRef<string | null>(null);
  const avatarNoticeTimerRef = useRef<number | null>(null);
  const signatureStrokesRef = useRef<SignatureStroke[]>([]);
  const activeStrokeRef = useRef<SignatureStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);
  const renderFrameRef = useRef<number | null>(null);
  const isAvatarSaving = avatarSaveStatus.status === "saving";
  const isSignatureSaving = signatureSaveStatus.status === "saving";

  const clearAvatarUploadNotice = useCallback(() => {
    if (avatarNoticeTimerRef.current !== null) {
      window.clearTimeout(avatarNoticeTimerRef.current);
      avatarNoticeTimerRef.current = null;
    }
  }, []);

  const showAvatarUploadNotice = useCallback(
    (tone: UploadNoticeState["tone"], message: string, timeoutMs = 3200) => {
      clearAvatarUploadNotice();
      setAvatarUploadNotice({ visible: true, tone, message });
      avatarNoticeTimerRef.current = window.setTimeout(() => {
        setAvatarUploadNotice(null);
        avatarNoticeTimerRef.current = null;
      }, timeoutMs);
    },
    [clearAvatarUploadNotice],
  );

  const revokeAvatarPreviewObjectUrl = useCallback(() => {
    if (!avatarPreviewObjectUrlRef.current) return;
    URL.revokeObjectURL(avatarPreviewObjectUrlRef.current);
    avatarPreviewObjectUrlRef.current = null;
  }, []);

  const updateAvatarPreview = useCallback(
    (file: File | null) => {
      revokeAvatarPreviewObjectUrl();

      if (!file) {
        setAvatarPreviewUrl("");
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      avatarPreviewObjectUrlRef.current = objectUrl;
      setAvatarPreviewUrl(objectUrl);
    },
    [revokeAvatarPreviewObjectUrl],
  );

  const renderSignatureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.max(1, Math.round(rect.width * dpr));
    const nextHeight = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderSignatureStrokes(
      ctx,
      signatureStrokesRef.current,
      rect.width,
      rect.height,
      theme === Theme.DARK ? "#f8fafc" : "#111827",
    );
  }, [theme]);

  const scheduleSignatureCanvasRender = useCallback(() => {
    if (renderFrameRef.current !== null) return;

    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      renderSignatureCanvas();
    });
  }, [renderSignatureCanvas]);

  const stopActiveDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    const pointerId = activePointerIdRef.current;

    if (canvas && pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        // Ignore capture-release failures during modal close/unmount.
      }
    }

    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    activeStrokeRef.current = null;
  }, []);

  const getPointerSamples = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): SignaturePoint[] => {
      const canvas = canvasRef.current;
      if (!canvas) return [];

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return [];

      const nativeEvent = event.nativeEvent;
      const coalescedEvents =
        typeof nativeEvent.getCoalescedEvents === "function"
          ? nativeEvent.getCoalescedEvents()
          : [];
      const samples =
        coalescedEvents.length > 0 ? coalescedEvents : [nativeEvent];

      return samples.map((sample) => ({
        x: (sample.clientX - rect.left) / rect.width,
        y: (sample.clientY - rect.top) / rect.height,
      }));
    },
    [],
  );

  const openSignatureDrawModal = useCallback(() => {
    if (isSignatureSaving) return;
    setSignatureMode("draw");
    setIsSignatureDrawModalOpen(true);
  }, [isSignatureSaving]);

  const closeSignatureDrawModal = useCallback(() => {
    stopActiveDrawing();
    setIsSignatureDrawModalOpen(false);
  }, [stopActiveDrawing]);

  const handleSelectUploadMode = useCallback(() => {
    closeSignatureDrawModal();
    setSignatureMode("upload");
  }, [closeSignatureDrawModal]);

  const handleSignaturePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      event.preventDefault();

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail on some device/browser combos; drawing still continues.
      }

      const stroke: SignatureStroke = { points: [] };
      appendSignaturePoints(stroke.points, getPointerSamples(event));
      if (stroke.points.length === 0) return;

      signatureStrokesRef.current = [...signatureStrokesRef.current, stroke];
      activeStrokeRef.current = stroke;
      activePointerIdRef.current = event.pointerId;
      isDrawingRef.current = true;
      setHasSignatureInk(true);
      setHasUnsavedSignatureDraft(true);
      scheduleSignatureCanvasRender();
    },
    [getPointerSamples, scheduleSignatureCanvasRender],
  );

  const handleSignaturePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (
        !isDrawingRef.current ||
        activePointerIdRef.current !== event.pointerId
      )
        return;

      event.preventDefault();

      const activeStroke = activeStrokeRef.current;
      if (!activeStroke) return;

      const previousPointCount = activeStroke.points.length;
      appendSignaturePoints(activeStroke.points, getPointerSamples(event));

      if (activeStroke.points.length !== previousPointCount) {
        setHasUnsavedSignatureDraft(true);
        scheduleSignatureCanvasRender();
      }
    },
    [getPointerSamples, scheduleSignatureCanvasRender],
  );

  const finishSignatureStroke = useCallback(
    (event?: React.PointerEvent<HTMLCanvasElement>) => {
      if (event && activePointerIdRef.current !== event.pointerId) return;
      if (event) {
        event.preventDefault();
      }

      stopActiveDrawing();
      scheduleSignatureCanvasRender();
    },
    [scheduleSignatureCanvasRender, stopActiveDrawing],
  );

  const clearSignature = useCallback(() => {
    stopActiveDrawing();
    signatureStrokesRef.current = [];
    setHasSignatureInk(false);
    setHasUnsavedSignatureDraft(false);
    scheduleSignatureCanvasRender();
  }, [scheduleSignatureCanvasRender, stopActiveDrawing]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file || !currentUser || isAvatarSaving) return;

    updateAvatarPreview(file);
    clearAvatarUploadNotice();
    setAvatarUploadNotice(null);
    setAvatarSaveStatus({
      status: "saving",
      message: "Saving profile picture...",
    });

    try {
      await updateUser(currentUser.id, { avatarFile: file });
      revokeAvatarPreviewObjectUrl();
      setAvatarPreviewUrl("");
      setAvatarSaveStatus({
        status: "success",
        message: "Profile picture updated.",
      });
      showAvatarUploadNotice("success", "Profile picture updated.");
      toast("success", "Profile picture updated successfully.");
      await alert("Profile picture updated successfully!");
    } catch (error: any) {
      revokeAvatarPreviewObjectUrl();
      setAvatarPreviewUrl("");
      const message = error?.message || "Unable to update profile picture.";
      setAvatarSaveStatus({ status: "error", message });
      showAvatarUploadNotice("error", message, 5200);
      toast("error", message);
      await alert(message);
    }
  };

  const saveDrawnSignature = async () => {
    if (!currentUser) return;
    if (isSignatureSaving) return;
    if (signatureStrokesRef.current.length === 0) {
      await alert("Add your signature first before saving.");
      return;
    }

    setSignatureSaveStatus({
      status: "saving",
      message: "Saving signature...",
    });

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 900;
    exportCanvas.height = 360;

    const exportContext = exportCanvas.getContext("2d");
    if (!exportContext) {
      setSignatureSaveStatus({
        status: "error",
        message: "Unable to prepare the signature pad for saving.",
      });
      await alert(
        "Unable to prepare the signature pad for saving. Please try again.",
      );
      return;
    }

    renderSignatureStrokes(
      exportContext,
      signatureStrokesRef.current,
      exportCanvas.width,
      exportCanvas.height,
      "#111827",
    );

    const signatureFile = await new Promise<File | null>((resolve) => {
      exportCanvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(
            new File([blob], `signature-${currentUser.id}-${Date.now()}.png`, {
              type: "image/png",
            }),
          );
        },
        "image/png",
        1,
      );
    });

    if (!signatureFile) {
      setSignatureSaveStatus({
        status: "error",
        message: "Unable to generate signature image.",
      });
      await alert("Unable to generate signature image. Please try again.");
      return;
    }

    try {
      await updateUser(currentUser.id, { signatureFile });
      setHasSignatureInk(signatureStrokesRef.current.length > 0);
      setHasUnsavedSignatureDraft(false);
      closeSignatureDrawModal();
      setSignatureSaveStatus({
        status: "success",
        message: "Signature saved successfully.",
      });
      toast("success", "Signature saved successfully.");
      await alert("Signature saved successfully!");
    } catch (error: any) {
      const message = error?.message || "Unable to save signature.";
      setSignatureSaveStatus({ status: "error", message });
      toast("error", message);
      await alert(message);
    }
  };

  const handleSignatureFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file || !currentUser || isSignatureSaving) return;

    setSignatureSaveStatus({
      status: "saving",
      message: "Saving signature...",
    });

    try {
      await updateUser(currentUser.id, { signatureFile: file });
      setHasSignatureInk(false);
      setHasUnsavedSignatureDraft(false);
      setSignatureSaveStatus({
        status: "success",
        message: "Signature uploaded successfully.",
      });
      toast("success", "Signature uploaded successfully.");
      await alert("Signature uploaded successfully!");
    } catch (error: any) {
      const message = error?.message || "Unable to upload signature.";
      setSignatureSaveStatus({ status: "error", message });
      toast("error", message);
      await alert(message);
    }
  };

  useEffect(() => {
    if (signatureMode !== "draw" || !isSignatureDrawModalOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      renderSignatureCanvas();
    });

    const container = canvasContainerRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && container
        ? new ResizeObserver(() => {
            scheduleSignatureCanvasRender();
          })
        : null;

    resizeObserver?.observe(container as Element);
    window.addEventListener("resize", scheduleSignatureCanvasRender);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSignatureCanvasRender);
    };
  }, [
    isSignatureDrawModalOpen,
    renderSignatureCanvas,
    scheduleSignatureCanvasRender,
    signatureMode,
  ]);

  useEffect(
    () => () => {
      if (renderFrameRef.current !== null) {
        window.cancelAnimationFrame(renderFrameRef.current);
      }
      stopActiveDrawing();
      clearAvatarUploadNotice();
    },
    [clearAvatarUploadNotice, stopActiveDrawing],
  );

  useEffect(() => {
    if (currentUser) {
      setProfileFormData({
        name: currentUser.name,
        email: currentUser.email,
        gender: currentUser.gender,
        position: currentUser.position,
        password: "",
      });
    }
  }, [currentUser]);

  useEffect(
    () => () => {
      revokeAvatarPreviewObjectUrl();
    },
    [revokeAvatarPreviewObjectUrl],
  );

  const handleUpdateProfile = async () => {
    if (currentUser) {
      try {
        await updateUser(currentUser.id, profileFormData);
        await alert("Profile updated successfully!");
      } catch (error: any) {
        await alert(error?.message || "Unable to update profile.");
      }
    }
  };

  const primaryRole = currentUser?.roles?.[0] || "Viewer";
  const userRole = roles.find((r) => r.name === primaryRole);
  const primaryRoleBadgeStyle = getRoleBadgeStyle(userRole?.badgeColor);
  const avatarInitials = currentUser?.name
    ? currentUser.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("")
    : "PS";
  const avatarDisplaySource = avatarPreviewUrl || currentUser?.avatar || "";
  const avatarStatusTextClassName =
    avatarUploadNotice?.tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : avatarUploadNotice?.tone === "error"
        ? "text-red-700 dark:text-red-300"
        : "text-blue-700 dark:text-blue-200";

  return (
    <>
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 max-w-5xl mx-auto">
        <div className="relative p-6 sm:p-8 rounded-[40px] bg-white dark:bg-[#09090b] border border-zinc-200/80 dark:border-zinc-800/50 shadow-sm overflow-hidden group">
          <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full -mr-40 -mt-40 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-500/10 rounded-full -ml-40 -mb-40 blur-3xl" />

          <div className="relative flex flex-col lg:flex-row lg:items-center gap-6 sm:gap-8">
            <div className="mx-auto lg:mx-0 flex flex-col items-center lg:items-start gap-3">
              <div className="relative">
                <input
                  type="file"
                  ref={avatarInputRef}
                  onChange={handleAvatarUpload}
                  accept="image/*"
                  disabled={isAvatarSaving}
                  className="hidden"
                />

                <div className="relative h-40 w-36 sm:h-48 sm:w-44 rounded-[24px] border border-zinc-200/80 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 overflow-hidden shadow-[0_12px_26px_rgba(2,6,23,0.18)]">
                  {avatarDisplaySource ? (
                    <img
                      src={avatarDisplaySource}
                      alt={currentUser.name}
                      className={`h-full w-full object-cover ${isAvatarSaving ? "opacity-80" : ""}`}
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-psa-navy dark:text-white">
                      {avatarInitials}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isAvatarSaving}
                  className="absolute -bottom-1 right-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-zinc-900/85 text-white shadow-[0_10px_22px_rgba(2,6,23,0.42)] backdrop-blur-sm hover:bg-zinc-800 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Camera size={15} />
                </button>
              </div>

              {(isAvatarSaving || avatarUploadNotice?.visible) && (
                <div className="w-36 sm:w-44">
                  {isAvatarSaving ? (
                    <UploadProgressInline
                      visible
                      message={avatarSaveStatus.message}
                      progressPercent={65}
                      tone="neutral"
                      showProgress
                    />
                  ) : (
                    <p
                      className={`text-[11px] font-bold leading-relaxed ${avatarStatusTextClassName}`}
                    >
                      {avatarUploadNotice?.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 text-center lg:text-left">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-2">
                <h1 className="text-3xl sm:text-[2rem] font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                  {currentUser?.name}
                </h1>
                <div
                  style={primaryRoleBadgeStyle}
                  className="w-fit rounded-full border px-4 py-1 text-[10px] font-black uppercase tracking-[0.2em] mx-auto lg:mx-0"
                >
                  {primaryRole}
                </div>
              </div>

              <p className="text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest text-[11px] mb-4">
                {currentUser?.position || "Provincial Staff"}
              </p>

              <div className="flex flex-wrap justify-center lg:justify-start gap-3">
                <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-50/80 dark:bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <Mail size={14} className="text-blue-500" />{" "}
                  {currentUser?.email}
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-50/80 dark:bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <ShieldCheck size={14} className="text-emerald-500" /> PSA
                  Internal Network
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main Info Column */}
          <div className="md:col-span-2 space-y-8">
            <Card
              title="Personal Information"
              description="Update your official contact details and profile preferences"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Input
                  label="Full Name"
                  value={profileFormData.name}
                  onChange={(e) =>
                    setProfileFormData({
                      ...profileFormData,
                      name: e.target.value,
                    })
                  }
                  placeholder="Juan Dela Cruz"
                />
                <Input
                  label="Email Address"
                  value={profileFormData.email}
                  onChange={(e) =>
                    setProfileFormData({
                      ...profileFormData,
                      email: e.target.value,
                    })
                  }
                  placeholder="juan@psa.gov.ph"
                />
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
                    Gender
                  </label>
                  <select
                    value={profileFormData.gender}
                    onChange={(e) =>
                      setProfileFormData({
                        ...profileFormData,
                        gender: e.target.value,
                      })
                    }
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
                <Input
                  label="Position / Designation"
                  value={profileFormData.position}
                  onChange={(e) =>
                    setProfileFormData({
                      ...profileFormData,
                      position: e.target.value,
                    })
                  }
                  placeholder="Provincial Statistician"
                />
              </div>
              <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <Button
                  variant="blue"
                  className="px-8 shadow-lg shadow-blue-500/20"
                  onClick={handleUpdateProfile}
                >
                  <Save size={16} className="mr-2" /> Save Profile Changes
                </Button>
              </div>
            </Card>

            <Card
              title="Security & Authentication"
              description="Manage your account password and security settings"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Input
                  label="New Password"
                  type="password"
                  value={profileFormData.password}
                  onChange={(e) =>
                    setProfileFormData({
                      ...profileFormData,
                      password: e.target.value,
                    })
                  }
                  placeholder="Enter new password (optional)"
                />
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/20">
                  <div className="flex items-center gap-2 text-amber-600 mb-1">
                    <Info size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Password Tip
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-600/70 font-medium">
                    Use at least 8 characters with numbers and symbols for
                    better security.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-8">
            <Card
              title="Digital Signature"
              description="Used for authenticating RIS documents"
            >
              {/* Toggle Mode */}
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl mb-4">
                <button
                  onClick={handleSelectUploadMode}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    signatureMode === "upload"
                      ? "bg-white dark:bg-zinc-700 text-blue-600 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  <Upload size={14} /> Upload
                </button>
                <button
                  onClick={openSignatureDrawModal}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    signatureMode === "draw"
                      ? "bg-white dark:bg-zinc-700 text-blue-600 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  <PenTool size={14} /> Draw
                </button>
              </div>

              {signatureMode === "upload" ? (
                <div className="relative aspect-video rounded-2xl bg-white border border-dashed border-zinc-300 flex flex-col items-center justify-center p-6 text-center group cursor-pointer hover:border-blue-500 transition-colors overflow-hidden ring-4 ring-zinc-50 dark:ring-white/5">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isSignatureSaving}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={(event) => {
                      void handleSignatureFileUpload(event);
                    }}
                  />
                  {currentUser?.signature ? (
                    <img
                      src={currentUser.signature}
                      alt="Digital Signature"
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <>
                      <div className="p-4 bg-zinc-50 rounded-3xl shadow-sm mb-4 border border-zinc-200 text-zinc-400 group-hover:text-blue-500 transition-colors">
                        <Upload size={32} />
                      </div>
                      <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest leading-relaxed">
                        Click to Upload Signature
                      </p>
                      <p className="text-[9px] text-zinc-400 mt-2 italic">
                        Will be used for RIS generation
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[28px] border border-zinc-200 dark:border-zinc-800 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,251,0.96))] dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
                    <div className="flex items-start gap-3">
                      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-500/10 dark:text-blue-300">
                        <PenTool size={18} />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-900 dark:text-zinc-100">
                          Focused Drawing Pad
                        </p>
                        <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                          Open a centered signature canvas with more room for
                          tablet, stylus, and touch input. Upload stays
                          unchanged.
                        </p>
                      </div>
                    </div>

                    {currentUser?.signature && !hasUnsavedSignatureDraft && (
                      <div className="mt-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/70 bg-white overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                        <img
                          src={currentUser.signature}
                          alt="Current saved signature"
                          className="h-24 w-full object-contain bg-white p-3 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]"
                        />
                      </div>
                    )}

                    <div className="mt-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/60 px-4 py-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {hasUnsavedSignatureDraft
                        ? "You have an unsaved signature draft on this device. Reopen the drawing pad to continue, save, or clear it."
                        : hasSignatureInk
                          ? "Your latest drawn signature is ready to reopen. Saving again will replace the signature currently on file."
                          : currentUser?.signature
                            ? "A saved signature is already on file. Drawing a new one will replace it after you save from the larger pad."
                            : "Open the larger drawing pad to create a signature comfortably before saving it to your profile."}
                    </div>

                    <Button
                      variant="blue"
                      onClick={openSignatureDrawModal}
                      className="mt-4 w-full text-xs uppercase tracking-[0.16em]"
                    >
                      <PenTool size={14} className="mr-2" />{" "}
                      {hasSignatureInk
                        ? "Reopen Drawing Pad"
                        : "Open Drawing Pad"}
                    </Button>
                  </div>
                </div>
              )}
              <UploadProgressInline
                visible={signatureSaveStatus.status !== "idle"}
                message={signatureSaveStatus.message}
                progressPercent={isSignatureSaving ? 65 : 100}
                tone={
                  signatureSaveStatus.status === "error"
                    ? "error"
                    : signatureSaveStatus.status === "success"
                      ? "success"
                      : "neutral"
                }
                showProgress={isSignatureSaving}
                className="mt-3"
              />
            </Card>

            <div className="p-6 rounded-[32px] bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <ShieldCheck size={80} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <Lock size={16} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Access Control
                  </span>
                </div>
                <h4 className="text-xl font-bold mb-2 tracking-tight">
                  Level: {primaryRole}
                </h4>
                <p className="text-xs text-blue-100/80 leading-relaxed font-medium">
                  You have administrative privileges to manage provincial
                  records and inventory. All activity is audited by PSA central
                  office.
                </p>
                <button className="mt-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:gap-3 transition-all">
                  View Access Permissions <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Modal
        isOpen={isSignatureDrawModalOpen}
        onClose={closeSignatureDrawModal}
        title="Draw Digital Signature"
        maxWidth="max-w-4xl"
        className="min-h-[78vh]"
        bodyClassName="p-0 overflow-hidden"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeSignatureDrawModal}
              disabled={isSignatureSaving}
              className="min-w-[112px] uppercase tracking-[0.12em] text-[11px]"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={clearSignature}
              disabled={!hasSignatureInk || isSignatureSaving}
              className="min-w-[112px] uppercase tracking-[0.12em] text-[11px]"
            >
              <Trash2 size={14} className="mr-2" /> Clear
            </Button>
            <Button
              variant="blue"
              onClick={() => {
                void saveDrawnSignature();
              }}
              disabled={!currentUser || !hasSignatureInk || isSignatureSaving}
              className="min-w-[148px] uppercase tracking-[0.12em] text-[11px] shadow-lg shadow-blue-500/20"
            >
              <Save size={14} className="mr-2" />{" "}
              {isSignatureSaving ? "Saving..." : "Save Signature"}
            </Button>
          </>
        }
      >
        <div className="flex h-full flex-col bg-zinc-50/70 dark:bg-zinc-950/60">
          <div className="border-b border-zinc-200/80 dark:border-zinc-800 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-sm font-medium leading-relaxed text-zinc-600 dark:text-zinc-300">
                Sign with mouse, finger, or stylus. Your draft stays here until
                saved or cleared.
              </p>
              <span
                className={`inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                  hasUnsavedSignatureDraft
                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                    : hasSignatureInk
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                }`}
              >
                {hasUnsavedSignatureDraft
                  ? "Unsaved Draft"
                  : hasSignatureInk
                    ? "Ready To Save"
                    : "Blank Pad"}
              </span>
            </div>
          </div>

          <div className="flex-1 p-4 sm:p-6">
            <div
              ref={canvasContainerRef}
              className="relative h-[58vh] min-h-[340px] overflow-hidden rounded-[30px] border-2 border-zinc-200/90 bg-white shadow-[0_26px_70px_-36px_rgba(15,23,42,0.35)] dark:border-zinc-700/70 dark:bg-[#050505]"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.05]"
                style={{
                  backgroundImage:
                    "radial-gradient(currentColor 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                }}
              />
              <div className="pointer-events-none absolute inset-x-6 top-5 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300 dark:text-zinc-700">
                <span>Sign Naturally</span>
                <span>Centered Signature Pad</span>
              </div>
              <div className="pointer-events-none absolute inset-x-10 bottom-10 border-b border-dashed border-zinc-200 dark:border-zinc-800" />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={handleSignaturePointerDown}
                onPointerMove={handleSignaturePointerMove}
                onPointerUp={finishSignatureStroke}
                onPointerCancel={finishSignatureStroke}
                onLostPointerCapture={() => {
                  if (isDrawingRef.current) {
                    stopActiveDrawing();
                    scheduleSignatureCanvasRender();
                  }
                }}
              />
              {!hasSignatureInk && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-zinc-300 dark:text-zinc-700">
                  <PenTool size={34} />
                  <div className="space-y-1">
                    <p className="text-lg font-semibold tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
                      Sign Here
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em]">
                      Larger pad for tablet and stylus input
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
