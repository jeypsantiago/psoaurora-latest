import React, { useEffect, useRef, useState } from "react";
import { User, X } from "lucide-react";
import { RevealSection } from "./RevealSection";
import { resolveMediaSource } from "../../services/mediaAssets";
import type { LandingConfig } from "../../LandingConfigContext";

type TeamMember = LandingConfig["team"]["members"][number];
type TeamEntry = { member: TeamMember; index: number };
type TeamPanelLayout = {
  top: number;
  left: number;
  width: number;
};

interface LandingTeamSectionProps {
  teamTitle: string;
  teamSubtitle: string;
  teamEntries: TeamEntry[];
  pinnedTeamMemberId: string | null;
  setPinnedTeamMemberId: React.Dispatch<React.SetStateAction<string | null>>;
  hoveredTeamMemberId: string | null;
  setHoveredTeamMemberId: React.Dispatch<React.SetStateAction<string | null>>;
  teamCardRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  teamCardButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  resetTeamCardStyle: (memberId: string) => void;
}

const TEAM_CARD_BASE_SHADOW = "0 12px 28px rgba(0,51,102,0.07)";
const TEAM_CARD_ACTIVE_SHADOW =
  "0 18px 34px rgba(0,51,102,0.15), 0 8px 16px rgba(2,6,23,0.10)";
const TEAM_IMAGE_RETRY_LIMIT = 2;
const TEAM_IMAGE_RETRY_DELAY_MS = 350;
const TEAM_HOVER_CLOSE_DELAY_MS = 120;
const TEAM_PANEL_GAP = 24;
const TEAM_PANEL_MIN_WIDTH = 320;
const TEAM_PANEL_MAX_WIDTH = 360;
const TEAM_PANEL_MIN_TOP = 132;

const TeamMemberPortrait: React.FC<{
  alt: string;
  initials: string;
  primarySrc: string;
  fallbackSrc: string;
  className: string;
  style: React.CSSProperties;
}> = ({ alt, initials, primarySrc, fallbackSrc, className, style }) => {
  const [resolvedSrc, setResolvedSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    let retryTimeoutId: number | null = null;

    const preloadImage = (
      src: string,
      attempt: number,
      fallbackAttempted: boolean,
    ) => {
      if (!src) {
        setResolvedSrc("");
        return;
      }

      const image = new window.Image();
      image.decoding = "async";

      image.onload = () => {
        if (!cancelled) {
          setResolvedSrc(src);
        }
      };

      image.onerror = () => {
        if (cancelled) return;

        if (src === primarySrc && attempt < TEAM_IMAGE_RETRY_LIMIT) {
          retryTimeoutId = window.setTimeout(() => {
            preloadImage(src, attempt + 1, fallbackAttempted);
          }, TEAM_IMAGE_RETRY_DELAY_MS * (attempt + 1));
          return;
        }

        if (fallbackSrc && !fallbackAttempted && fallbackSrc !== src) {
          preloadImage(fallbackSrc, 0, true);
          return;
        }

        setResolvedSrc("");
      };

      image.src = src;
    };

    setResolvedSrc("");
    preloadImage(primarySrc || fallbackSrc, 0, false);

    return () => {
      cancelled = true;
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [fallbackSrc, primarySrc]);

  if (!resolvedSrc) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-psa-line bg-white text-2xl font-bold text-psa-navy shadow-md dark:border-zinc-700 dark:bg-[#121212]">
          {initials}
        </span>
      </div>
    );
  }

  return <img src={resolvedSrc} alt={alt} className={className} style={style} />;
};

export const LandingTeamSection: React.FC<LandingTeamSectionProps> = ({
  teamTitle,
  teamSubtitle,
  teamEntries,
  pinnedTeamMemberId,
  setPinnedTeamMemberId,
  hoveredTeamMemberId,
  setHoveredTeamMemberId,
  teamCardRefs,
  teamCardButtonRefs,
  resetTeamCardStyle,
}) => {
  const leadEntry = teamEntries[0];
  const staffEntries = teamEntries.slice(1);
  const activeTeamMemberId = pinnedTeamMemberId ?? hoveredTeamMemberId;
  const activeTeamMember =
    teamEntries.find((entry) => entry.member.id === activeTeamMemberId)?.member ??
    null;
  const sectionCardRef = useRef<HTMLDivElement | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const hoverCloseTimeoutRef = useRef<number | null>(null);
  const [desktopPanelLayout, setDesktopPanelLayout] =
    useState<TeamPanelLayout | null>(null);

  const localTeamSamples = [
    "/PSA.webp",
    "/PSA.webp",
    "/PSA.webp",
    "/PSA.webp",
  ];

  const clearHoverCloseTimeout = () => {
    if (hoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  };

  const scheduleHoverClose = (memberId: string) => {
    if (pinnedTeamMemberId === memberId) return;
    clearHoverCloseTimeout();
    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      setHoveredTeamMemberId((current) => (current === memberId ? null : current));
      resetTeamCardStyle(memberId);
      hoverCloseTimeoutRef.current = null;
    }, TEAM_HOVER_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      clearHoverCloseTimeout();
    };
  }, []);

  useEffect(() => {
    if (!activeTeamMemberId) {
      setDesktopPanelLayout(null);
      return;
    }

    const updateDesktopPanelLayout = () => {
      if (window.innerWidth < 1024) {
        setDesktopPanelLayout(null);
        return;
      }

      const sectionElement = sectionCardRef.current;
      const cardElement = teamCardRefs.current[activeTeamMemberId];
      if (!sectionElement || !cardElement) {
        setDesktopPanelLayout(null);
        return;
      }

      const sectionRect = sectionElement.getBoundingClientRect();
      const cardRect = cardElement.getBoundingClientRect();
      const sectionPadding = window.innerWidth >= 1280 ? 32 : 16;
      const availableWidth = Math.max(
        TEAM_PANEL_MIN_WIDTH,
        sectionRect.width - sectionPadding * 2,
      );
      const panelWidth = Math.min(TEAM_PANEL_MAX_WIDTH, availableWidth);

      const cardLeft = cardRect.left - sectionRect.left;
      const cardRight = cardRect.right - sectionRect.left;
      const cardTop = cardRect.top - sectionRect.top;
      const cardHeight = cardRect.height;

      const availableRight =
        sectionRect.width - sectionPadding - cardRight - TEAM_PANEL_GAP;
      const availableLeft = cardLeft - sectionPadding - TEAM_PANEL_GAP;

      let left = cardRight + TEAM_PANEL_GAP;
      if (availableRight < panelWidth && availableLeft >= panelWidth) {
        left = cardLeft - TEAM_PANEL_GAP - panelWidth;
      } else if (availableRight < panelWidth) {
        left = sectionRect.width - sectionPadding - panelWidth;
      }

      left = Math.min(
        Math.max(sectionPadding, left),
        Math.max(sectionPadding, sectionRect.width - sectionPadding - panelWidth),
      );

      const estimatedPanelHeight = previewPanelRef.current?.offsetHeight ?? 404;
      const maxTop = Math.max(
        TEAM_PANEL_MIN_TOP,
        sectionRect.height - estimatedPanelHeight - sectionPadding,
      );
      const preferredTop = cardTop + cardHeight / 2 - estimatedPanelHeight / 2;
      const top = Math.min(Math.max(TEAM_PANEL_MIN_TOP, preferredTop), maxTop);

      setDesktopPanelLayout({ top, left, width: panelWidth });
    };

    updateDesktopPanelLayout();
    window.addEventListener("resize", updateDesktopPanelLayout);
    return () => {
      window.removeEventListener("resize", updateDesktopPanelLayout);
    };
  }, [activeTeamMemberId, teamCardRefs]);

  useEffect(() => {
    if (!pinnedTeamMemberId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const cardContainsTarget =
        teamCardRefs.current[pinnedTeamMemberId]?.contains(target) ?? false;
      const panelContainsTarget =
        previewPanelRef.current?.contains(target) ?? false;

      if (!cardContainsTarget && !panelContainsTarget) {
        setPinnedTeamMemberId(null);
        resetTeamCardStyle(pinnedTeamMemberId);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinnedTeamMemberId(null);
      resetTeamCardStyle(pinnedTeamMemberId);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [pinnedTeamMemberId, resetTeamCardStyle, setPinnedTeamMemberId, teamCardRefs]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "PS";
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  };

  const handlePreviewEnter = (memberId: string) => {
    if (pinnedTeamMemberId && pinnedTeamMemberId !== memberId) return;
    clearHoverCloseTimeout();
    setHoveredTeamMemberId(memberId);
  };

  const renderProjectsPanel = (member: TeamMember) => (
    <div
      ref={previewPanelRef}
      className="relative overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(244,248,255,0.58))] shadow-[0_28px_70px_rgba(0,51,102,0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(255,255,255,0.60),rgba(244,248,255,0.44))] dark:border-white/15 dark:bg-[linear-gradient(180deg,rgba(10,20,36,0.70),rgba(8,18,32,0.54))] dark:supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(10,20,36,0.58),rgba(8,18,32,0.42))]"
      onMouseEnter={() => {
        clearHoverCloseTimeout();
        if (!pinnedTeamMemberId) {
          setHoveredTeamMemberId(member.id);
        }
      }}
      onMouseLeave={() => {
        scheduleHoverClose(member.id);
      }}
    >
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-400/95 via-cyan-300/90 to-amber-200/90" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04)_38%,rgba(255,255,255,0.18))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_38%,rgba(255,255,255,0.06))]" />
        <div className="absolute -top-14 right-3 h-28 w-28 rounded-full bg-sky-300/22 blur-3xl dark:bg-sky-400/12" />
        <div className="absolute top-12 left-10 h-24 w-24 rounded-full bg-amber-200/18 blur-3xl dark:bg-amber-300/10" />
        <div className="absolute -bottom-12 left-2 h-28 w-28 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/12" />
        <div className="absolute inset-x-5 top-3 h-px bg-white/70 dark:bg-white/20" />
      </div>

      <div className="relative p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/45 bg-[linear-gradient(180deg,rgba(43,136,255,0.92),rgba(0,173,239,0.76))] text-white shadow-[0_12px_24px_rgba(0,86,179,0.22)]">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                Active Projects
              </p>
              <h3 className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-white">
                {member.name}
              </h3>
              <p className="mt-1 truncate text-sm text-slate-600/95 dark:text-slate-300">
                {member.designation || "PSA Team Member"}
              </p>
            </div>
          </div>
          {pinnedTeamMemberId === member.id ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/60 bg-white/55 text-slate-500 transition-colors hover:text-psa-blue dark:border-white/15 dark:bg-white/5 dark:text-slate-300"
              onClick={() => {
                setPinnedTeamMemberId(null);
                resetTeamCardStyle(member.id);
              }}
              aria-label={`Close project panel for ${member.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold backdrop-blur-md ${pinnedTeamMemberId === member.id ? "border-sky-200/80 bg-sky-100/58 text-sky-700 dark:border-sky-300/25 dark:bg-sky-400/10 dark:text-sky-100" : "border-white/60 bg-white/42 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300"}`}
          >
            {pinnedTeamMemberId === member.id ? "Pinned" : "Preview"}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/60 bg-white/42 px-3 py-1 text-[11px] font-semibold text-slate-600 backdrop-blur-md dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
            {member.projects.length} project{member.projects.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center rounded-full border border-cyan-200/80 bg-cyan-100/52 px-3 py-1 text-[11px] font-semibold text-cyan-700 backdrop-blur-md dark:border-cyan-300/25 dark:bg-cyan-400/10 dark:text-cyan-100">
            {pinnedTeamMemberId === member.id
              ? "Click outside or press Escape"
              : "Hover card or pin"}
          </span>
        </div>

        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Assigned work
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            {pinnedTeamMemberId === member.id
              ? "Connected to selected employee"
              : "Move to the panel to keep preview open"}
          </p>
        </div>

        <div className="space-y-2.5 pr-1">
          {member.projects.length > 0 ? (
            member.projects.map((project, projectIdx) => (
              <div
                key={`${member.id}-${project}`}
                className="group flex items-start gap-3 rounded-2xl border border-white/60 bg-white/42 px-3 py-3 backdrop-blur-md transition-all duration-300 hover:border-sky-300/75 hover:bg-white/58 dark:border-white/12 dark:bg-white/5 dark:hover:border-sky-300/28 dark:hover:bg-white/8"
                style={{ transitionDelay: `${projectIdx * 40}ms` }}
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-white/70 text-[11px] font-black text-psa-blue dark:border-sky-300/25 dark:bg-white/8 dark:text-blue-100">
                  {String(projectIdx + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                    {project}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Active assignment linked to this employee profile
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/60 bg-white/35 px-4 py-5 text-center backdrop-blur-md dark:border-white/12 dark:bg-white/5">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No projects listed yet.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Assign a project in the landing config to show it here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTeamCard = (
    member: TeamMember,
    idx: number,
    delay: number,
    featured = false,
  ) => {
    const isPinned = pinnedTeamMemberId === member.id;
    const isHovered = hoveredTeamMemberId === member.id;
    const isPreviewOpen = isPinned || isHovered;
    const gender = member.gender || "neutral";
    const fallbackStyle: Array<"psa" | "amber" | "mint" | "ocean" | "rose"> = [
      "psa",
      "amber",
      "mint",
      "ocean",
      "rose",
    ];
    const genderDefaultStyle =
      gender === "male"
        ? idx % 2 === 0
          ? "ocean"
          : "mint"
        : gender === "female"
          ? idx % 2 === 0
            ? "amber"
            : "rose"
          : fallbackStyle[idx % fallbackStyle.length];
    const useLogoBackground = member.backgroundMode
      ? member.backgroundMode === "logo"
      : false;
    const visualStyle = useLogoBackground
      ? "psa"
      : member.visualStyle && member.visualStyle !== "psa"
        ? member.visualStyle
        : genderDefaultStyle;
    const imageScale =
      typeof member.imageScale === "number" ? member.imageScale : 1.03;
    const imageOffsetY =
      (typeof member.imageOffsetY === "number" ? member.imageOffsetY : 0) + 8;
    const fallbackImage = resolveMediaSource(
      localTeamSamples[idx % localTeamSamples.length],
    );
    const resolvedPrimaryImage = resolveMediaSource(member.image || fallbackImage);

    return (
      <RevealSection key={member.id} delay={delay}>
        <article
          ref={(element) => {
            teamCardRefs.current[member.id] = element;
          }}
          className={`group relative rounded-2xl border border-psa-line bg-gradient-to-b from-white to-psa-surface transition-all duration-300 dark:border-zinc-800 dark:from-[#121212] dark:to-[#0a0a0a] ${featured ? "max-w-[520px] mx-auto" : ""} ${isPreviewOpen ? "z-20 -translate-y-0.5 border-psa-blue/35 ring-2 ring-psa-blue/25" : "hover:-translate-y-0.5 hover:border-psa-blue/30"}`}
          style={{
            boxShadow: isPreviewOpen
              ? TEAM_CARD_ACTIVE_SHADOW
              : TEAM_CARD_BASE_SHADOW,
          }}
          onMouseEnter={() => {
            handlePreviewEnter(member.id);
          }}
          onMouseLeave={() => {
            scheduleHoverClose(member.id);
          }}
        >
          <button
            ref={(element) => {
              teamCardButtonRefs.current[member.id] = element;
            }}
            type="button"
            className="w-full text-left transition-transform duration-200 ease-out will-change-transform"
            style={{
              transform:
                "perspective(1400px) rotateX(0deg) rotateY(0deg) scale(1)",
              backfaceVisibility: "hidden",
            }}
            onClick={() => {
              clearHoverCloseTimeout();
              setPinnedTeamMemberId((previous) => {
                const nextPinnedId = previous === member.id ? null : member.id;
                if (!nextPinnedId) {
                  resetTeamCardStyle(member.id);
                  setHoveredTeamMemberId(null);
                } else {
                  setHoveredTeamMemberId(member.id);
                }
                return nextPinnedId;
              });
            }}
            onFocus={() => {
              handlePreviewEnter(member.id);
            }}
            onBlur={() => {
              scheduleHoverClose(member.id);
            }}
            aria-expanded={isPreviewOpen}
          >
            <div
              className={`pointer-events-none absolute inset-x-4 top-0 h-12 bg-gradient-to-r from-transparent via-white/80 to-transparent transition-opacity duration-500 dark:via-slate-300/35 ${isPreviewOpen ? "opacity-100" : "opacity-0 group-hover:opacity-70"}`}
            />
            {featured ? (
              <div
                className={`relative h-[12.9rem] overflow-visible rounded-t-2xl bg-white transition-all duration-300 dark:bg-[#0a0a0a] ${isPreviewOpen ? "ring-2 ring-inset ring-psa-blue/35" : ""}`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(0,86,179,0.10),transparent_42%),radial-gradient(circle_at_86%_20%,rgba(206,17,38,0.08),transparent_34%)]" />
                <img
                  src="/PSA.webp"
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 m-auto h-[98%] w-[98%] object-contain opacity-[0.16] saturate-0 contrast-75"
                />
                <div className="absolute bottom-2 left-1/2 h-10 w-[44%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(0,51,102,0.20),transparent_70%)]" />
                <TeamMemberPortrait
                  alt={member.name}
                  initials={getInitials(member.name)}
                  primarySrc={resolvedPrimaryImage}
                  fallbackSrc={fallbackImage}
                  className={`absolute bottom-0 left-1/2 z-10 h-[130%] w-auto max-w-none -translate-x-1/2 object-contain object-bottom drop-shadow-[0_28px_36px_rgba(2,6,23,0.36)] transition-all duration-500 ${isPreviewOpen ? "scale-[1.1] saturate-115 brightness-105 contrast-110" : "scale-[1.02]"}`}
                  style={{
                    transform: `translateX(-50%) translateY(${imageOffsetY}px) scale(${isPreviewOpen ? imageScale + 0.04 : imageScale})`,
                    backfaceVisibility: "hidden",
                  }}
                />
              </div>
            ) : (
              <div
                className={`relative h-[12.7rem] overflow-visible rounded-t-2xl border-b border-psa-line bg-white transition-all duration-300 dark:border-zinc-800 dark:bg-[#0a0a0a] ${isPreviewOpen ? "ring-2 ring-inset ring-psa-blue/35" : ""}`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(0,86,179,0.10),transparent_42%),radial-gradient(circle_at_86%_20%,rgba(206,17,38,0.08),transparent_34%)]" />
                <img
                  src="/PSA.webp"
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 m-auto h-[98%] w-[98%] object-contain opacity-[0.16] saturate-0 contrast-75"
                />
                <div className="absolute bottom-2 left-1/2 h-10 w-[44%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(0,51,102,0.20),transparent_70%)]" />
                <TeamMemberPortrait
                  alt={member.name}
                  initials={getInitials(member.name)}
                  primarySrc={resolvedPrimaryImage}
                  fallbackSrc={fallbackImage}
                  className={`absolute bottom-0 left-1/2 w-auto max-w-none -translate-x-1/2 object-contain object-bottom transition-all duration-500 ${visualStyle === "psa" ? "h-[126%] drop-shadow-[0_22px_26px_rgba(2,6,23,0.28)]" : "h-[121%] drop-shadow-[0_16px_20px_rgba(2,6,23,0.20)]"} ${isPreviewOpen ? "scale-[1.06] saturate-110 brightness-105 contrast-110" : "scale-100"}`}
                  style={{
                    transform: `translateX(-50%) translateY(${imageOffsetY}px) scale(${isPreviewOpen ? imageScale + 0.03 : imageScale})`,
                    backfaceVisibility: "hidden",
                  }}
                />
              </div>
            )}

            <div className={`px-4 py-3.5 ${featured ? "text-center" : ""}`}>
              <p
                className={`whitespace-nowrap text-[clamp(0.88rem,1.05vw,1.03rem)] font-semibold leading-snug text-psa-navy hover:text-psa-blue ${featured ? "mx-auto" : ""}`}
                title={member.name}
              >
                {member.name}
              </p>
              <p
                className={`mt-1 whitespace-nowrap text-[clamp(0.72rem,0.82vw,0.86rem)] font-semibold text-slate-700 dark:text-slate-300 ${featured ? "mx-auto" : ""}`}
                title={member.designation || "PSA Team Member"}
              >
                {member.designation || "PSA Team Member"}
              </p>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-300">
                {member.projects.length} project{member.projects.length === 1 ? "" : "s"} assigned
              </p>
            </div>
          </button>
        </article>
      </RevealSection>
    );
  };

  return (
    <section
      id="team"
      className="public-container relative z-[2] -mt-1 public-section-y-compact"
    >
      <RevealSection>
        <div
          ref={sectionCardRef}
          className="relative rounded-3xl border border-psa-line bg-white p-6 public-shadow-medium dark:border-zinc-800 dark:bg-[#0b0b0b] sm:p-8 lg:p-10"
        >
          <div className="mb-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-psa-blue">
                  Employee Directory
                </p>
                <h2 className="mt-2 font-serif text-3xl text-psa-navy sm:text-4xl">
                  {teamTitle}
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-300 sm:text-base">
                  {teamSubtitle}
                </p>
              </div>
            </div>
          </div>

          {leadEntry ? (
            <div className="mb-7 sm:mb-8">{renderTeamCard(leadEntry.member, leadEntry.index, 0, true)}</div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-5">
            {staffEntries.map((entry, position) =>
              renderTeamCard(entry.member, entry.index, 70 + position * 90),
            )}
          </div>

          {activeTeamMember && desktopPanelLayout ? (
            <div
              className="pointer-events-none absolute z-40 hidden lg:block"
              style={{
                top: `${desktopPanelLayout.top}px`,
                left: `${desktopPanelLayout.left}px`,
                width: `${desktopPanelLayout.width}px`,
              }}
            >
              <div className="pointer-events-auto">{renderProjectsPanel(activeTeamMember)}</div>
            </div>
          ) : null}

          {!activeTeamMember && teamEntries.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-slate-300 lg:hidden">
              Hover a profile to preview assigned projects, or click a card to pin the employee details in place.
            </div>
          ) : null}

          {activeTeamMember ? (
            <div className="mt-5 lg:hidden">{renderProjectsPanel(activeTeamMember)}</div>
          ) : null}
        </div>
      </RevealSection>
    </section>
  );
};
