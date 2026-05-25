import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { STORAGE_KEYS } from "./constants/storageKeys";
import { backend } from "./services/backend";
import { upsertAppStateFromStorageValue } from "./services/appState";
import { readStorageJsonSafe, writeStorageJson } from "./services/storage";

export interface LandingTeamMember {
  id: string;
  name: string;
  designation: string;
  gender?: "male" | "female" | "neutral";
  backgroundMode?: "logo" | "color";
  image: string;
  projects: string[];
  visualStyle?: "psa" | "amber" | "mint" | "ocean" | "rose";
  imageScale?: number;
  imageOffsetY?: number;
}

export interface LandingConfig {
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    buttonText: string;
    backgroundImage: string;
    backgroundPosition: string;
  };
  highlights: {
    title: string;
    yearTabs: string[];
    metrics: {
      id: string;
      value: string;
      label: string;
      subtext: string;
      icon:
        | "Home"
        | "Users"
        | "Building"
        | "Globe"
        | "MapPin"
        | "BarChart3"
        | "Shield";
    }[];
  };
  footer: {
    relatedLinks: { label: string; url: string }[];
    aboutLinks: { label: string; url: string }[];
    contactInfo: { label: string; value: string }[];
    copyright: string;
  };
  team: {
    title: string;
    subtitle: string;
    firstCardBackgroundMode: "psa" | "color";
    members: LandingTeamMember[];
  };
}

const defaultConfig: LandingConfig = {
  hero: {
    eyebrow: "PHILIPPINE STATISTICS AUTHORITY",
    headline: "Provincial Statistical\nOffice - Aurora",
    subheadline:
      "Your one-stop hub for provincial data management, records tracking, supply monitoring, and employment services.",
    buttonText: "EXPLORE PROVINCIAL DATA",
    backgroundImage: "/PSA.webp",
    backgroundPosition: "center center",
  },
  highlights: {
    title: "Census & Surveys Highlights",
    yearTabs: ["2023", "2022", "2021"],
    metrics: [
      {
        id: "1",
        value: "439,300",
        label: "Total number of households responded",
        subtext: "Based on recent surveys",
        icon: "Home",
      },
      {
        id: "2",
        value: "1,719,307",
        label: "Total household members enumerated",
        subtext: "Province-wide demographic count",
        icon: "Users",
      },
      {
        id: "3",
        value: "1,012",
        label: "Total barangays covered",
        subtext: "Comprehensive municipal reach",
        icon: "Building",
      },
    ],
  },
  footer: {
    relatedLinks: [
      { label: "PSA Official Website", url: "#" },
      { label: "PSA OpenSTAT", url: "#" },
      { label: "PSADA", url: "#" },
    ],
    aboutLinks: [
      { label: "CBMS Act (RA 11315)", url: "#" },
      { label: "Press releases", url: "#" },
      { label: "Privacy notice", url: "#" },
      { label: "Directory", url: "#" },
    ],
    contactInfo: [
      { label: "Contact info", value: "(042) 724-4389" },
      { label: "Feedback", value: "aurora@psa.gov.ph" },
      { label: "FAQs", value: "Help Center" },
    ],
    copyright: "© PSO Aurora 2025 - present • Portal v2.0",
  },
  team: {
    title: "Meet Our Provincial Team",
    subtitle:
      "Hover to preview projects and click each profile to explore assignments and focus areas.",
    firstCardBackgroundMode: "psa",
    members: [
      {
        id: "member-1",
        name: "Maria Dela Cruz",
        designation: "Provincial Statistician",
        gender: "female",
        backgroundMode: "logo",
        image: "/PSA.webp",
        projects: [
          "CBMS 2026 Validation",
          "Municipal Data Harmonization",
          "Provincial Dashboard Oversight",
        ],
        visualStyle: "psa",
        imageScale: 1.04,
        imageOffsetY: 0,
      },
      {
        id: "member-2",
        name: "Jose Antonio Reyes",
        designation: "Statistical Specialist II",
        gender: "male",
        backgroundMode: "color",
        image: "/PSA.webp",
        projects: [
          "Civil Registration Data Quality",
          "Records Digitization Program",
          "LGU Analytics Support",
        ],
        visualStyle: "mint",
        imageScale: 1.03,
        imageOffsetY: 0,
      },
      {
        id: "member-3",
        name: "Angela Mae Santos",
        designation: "Information Systems Analyst",
        gender: "female",
        backgroundMode: "color",
        image: "/PSA.webp",
        projects: [
          "Portal Experience Improvements",
          "Service Monitoring Dashboard",
          "Data Security Coordination",
        ],
        visualStyle: "ocean",
        imageScale: 1.05,
        imageOffsetY: 0,
      },
    ],
  },
};

const quoted = (value: string) =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const PUBLIC_LANDING_FILTER = `scope = ${quoted("global")} && key = ${quoted(STORAGE_KEYS.landingConfig)}`;

const sanitizeConfig = (value: unknown): LandingConfig => {
  if (!value || typeof value !== "object") return defaultConfig;

  const source = value as Partial<LandingConfig>;
  const hero = source.hero ?? defaultConfig.hero;
  const highlights = source.highlights ?? defaultConfig.highlights;
  const footer = source.footer ?? defaultConfig.footer;
  const team = source.team ?? defaultConfig.team;

  const members = (
    Array.isArray(team.members) ? team.members : defaultConfig.team.members
  ).map((member, idx) => {
    const fallbackMember =
      defaultConfig.team.members[idx % defaultConfig.team.members.length];
    return {
      id: member?.id || `member-${idx + 1}`,
      name: member?.name || "",
      designation: member?.designation || "",
      gender:
        member?.gender === "male" ||
        member?.gender === "female" ||
        member?.gender === "neutral"
          ? member.gender
          : "neutral",
      backgroundMode:
        member?.backgroundMode === "logo" || member?.backgroundMode === "color"
          ? member.backgroundMode
          : undefined,
      image: member?.image || fallbackMember.image || "",
      projects: Array.isArray(member?.projects)
        ? member.projects.map((project) => String(project)).filter(Boolean)
        : [],
      visualStyle:
        member?.visualStyle || fallbackMember.visualStyle || undefined,
      imageScale:
        typeof member?.imageScale === "number"
          ? member.imageScale
          : fallbackMember.imageScale,
      imageOffsetY:
        typeof member?.imageOffsetY === "number"
          ? member.imageOffsetY
          : fallbackMember.imageOffsetY,
    };
  });

  return {
    hero: {
      eyebrow: hero.eyebrow || defaultConfig.hero.eyebrow,
      headline: hero.headline || defaultConfig.hero.headline,
      subheadline: hero.subheadline || defaultConfig.hero.subheadline,
      buttonText: hero.buttonText || defaultConfig.hero.buttonText,
      backgroundImage:
        typeof hero.backgroundImage === "string"
          ? hero.backgroundImage
          : defaultConfig.hero.backgroundImage,
      backgroundPosition:
        typeof hero.backgroundPosition === "string" &&
        hero.backgroundPosition.trim()
          ? hero.backgroundPosition
          : defaultConfig.hero.backgroundPosition,
    },
    highlights: {
      title: highlights.title || defaultConfig.highlights.title,
      yearTabs:
        Array.isArray(highlights.yearTabs) && highlights.yearTabs.length > 0
          ? highlights.yearTabs.map((tab) => String(tab)).filter(Boolean)
          : defaultConfig.highlights.yearTabs,
      metrics:
        Array.isArray(highlights.metrics) && highlights.metrics.length > 0
          ? highlights.metrics.map((metric, idx) => ({
              id: metric.id || `metric-${idx + 1}`,
              value: metric.value || "0",
              label: metric.label || "Metric",
              subtext: metric.subtext || "",
              icon: metric.icon || "BarChart3",
            }))
          : defaultConfig.highlights.metrics,
    },
    footer: {
      relatedLinks:
        Array.isArray(footer.relatedLinks) && footer.relatedLinks.length > 0
          ? footer.relatedLinks
          : defaultConfig.footer.relatedLinks,
      aboutLinks:
        Array.isArray(footer.aboutLinks) && footer.aboutLinks.length > 0
          ? footer.aboutLinks
          : defaultConfig.footer.aboutLinks,
      contactInfo:
        Array.isArray(footer.contactInfo) && footer.contactInfo.length > 0
          ? footer.contactInfo
          : defaultConfig.footer.contactInfo,
      copyright: footer.copyright || defaultConfig.footer.copyright,
    },
    team: {
      title: team.title || defaultConfig.team.title,
      subtitle: team.subtitle || defaultConfig.team.subtitle,
      firstCardBackgroundMode:
        team.firstCardBackgroundMode === "color" ? "color" : "psa",
      members: members.length > 0 ? members : defaultConfig.team.members,
    },
  };
};

interface LandingConfigContextType {
  config: LandingConfig;
  updateConfig: (newConfig: LandingConfig) => void;
  resetConfig: () => void;
}

const LandingConfigContext = createContext<
  LandingConfigContextType | undefined
>(undefined);

export const LandingConfigProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isPublicLandingResolved, setIsPublicLandingResolved] = useState(false);
  const [config, setConfig] = useState<LandingConfig>(() => {
    const saved = readStorageJsonSafe<LandingConfig | null>(
      STORAGE_KEYS.landingConfig,
      null,
    );
    return saved ? sanitizeConfig(saved) : defaultConfig;
  });
  const configRef = useRef(config);
  const authOwnerId =
    backend.authStore.isValid && backend.authStore.record
      ? String(backend.authStore.record.id)
      : "";

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    try {
      writeStorageJson(STORAGE_KEYS.landingConfig, config);
    } catch (error) {
      console.error(
        "Failed to persist landing config. Storage may be full.",
        error,
      );
    }
  }, [config]);

  useEffect(() => {
    let active = true;
    setIsPublicLandingResolved(false);

    const loadPublicLandingConfig = async () => {
      try {
        const record = await backend
          .collection("app_state")
          .getFirstListItem(PUBLIC_LANDING_FILTER);
        if (!active || !record) return;

        const resolved = sanitizeConfig(record.value);
        setConfig((prev) => {
          try {
            if (JSON.stringify(prev) === JSON.stringify(resolved)) {
              return prev;
            }
          } catch {
            // Fall through and apply backend config.
          }
          return resolved;
        });

        try {
          writeStorageJson(STORAGE_KEYS.landingConfig, resolved);
        } catch {
          // Non-fatal for public mode.
        }
      } catch (error: any) {
        const status = Number(error?.status || 0);
        if (status === 404 && authOwnerId) {
          try {
            await upsertAppStateFromStorageValue(
              STORAGE_KEYS.landingConfig,
              JSON.stringify(configRef.current),
              authOwnerId,
            );
          } catch {
            // Non-fatal. Save flow in settings can retry.
          }
        }
        if (status !== 403 && status !== 404) {
          console.warn(
            "Unable to load public landing config from backend.",
            error,
          );
        }
      } finally {
        if (active) {
          setIsPublicLandingResolved(true);
        }
      }
    };

    void loadPublicLandingConfig();

    return () => {
      active = false;
    };
  }, [authOwnerId]);

  useEffect(() => {
    if (!isPublicLandingResolved) return;
    if (!authOwnerId) return;
    const rawValue = JSON.stringify(config);

    void upsertAppStateFromStorageValue(
      STORAGE_KEYS.landingConfig,
      rawValue,
      authOwnerId,
    ).catch((error) => {
      console.warn("Unable to sync landing config to backend.", error);
    });
  }, [config, isPublicLandingResolved, authOwnerId]);

  const updateConfig = (newConfig: LandingConfig) => {
    setConfig(sanitizeConfig(newConfig));
  };

  const resetConfig = () => {
    setConfig(defaultConfig);
  };

  return (
    <LandingConfigContext.Provider
      value={{ config, updateConfig, resetConfig }}
    >
      {children}
    </LandingConfigContext.Provider>
  );
};

export const useLandingConfig = () => {
  const context = useContext(LandingConfigContext);
  if (!context) {
    throw new Error(
      "useLandingConfig must be used within a LandingConfigProvider",
    );
  }
  return context;
};
