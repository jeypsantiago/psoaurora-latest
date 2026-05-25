import React from "react";
import { Button, Input, UploadProgressInline } from "../../components/ui";
import {
  isBackendFilePath,
  resolveMediaSource,
} from "../../services/mediaAssets";
import type { LandingConfig } from "../../LandingConfigContext";
import type { UploadState } from "./portalTypes";

interface PortalHeroSectionProps {
  landingConfigForm: LandingConfig;
  setLandingConfigForm: React.Dispatch<React.SetStateAction<LandingConfig>>;
  heroPreviewFailedSrc: string | null;
  setHeroPreviewFailedSrc: React.Dispatch<React.SetStateAction<string | null>>;
  heroUpload: UploadState;
  updateHeroBackgroundImage: (
    file?: File,
    fileInput?: HTMLInputElement | null,
  ) => void;
}

export const PortalHeroSection: React.FC<PortalHeroSectionProps> = ({
  landingConfigForm,
  setLandingConfigForm,
  heroPreviewFailedSrc,
  setHeroPreviewFailedSrc,
  heroUpload,
  updateHeroBackgroundImage,
}) => {
  const heroPreviewSource = landingConfigForm.hero.backgroundImage || "";
  const heroPreviewResolvedSource = resolveMediaSource(heroPreviewSource);
  const heroUsesBackendFilePath = isBackendFilePath(heroPreviewSource);
  const heroPreviewCanRender =
    !!heroPreviewResolvedSource && heroPreviewFailedSrc !== heroPreviewSource;

  return (
    <div id="portal-hero-section" className="order-1">
      <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2 mb-4">
        Hero Section
      </h4>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        Keep this short and clear. This is the first thing the public sees.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Eyebrow Text"
          value={landingConfigForm.hero.eyebrow}
          onChange={(e) =>
            setLandingConfigForm({
              ...landingConfigForm,
              hero: {
                ...landingConfigForm.hero,
                eyebrow: e.target.value,
              },
            })
          }
        />
        <Input
          label="Main Headline"
          value={landingConfigForm.hero.headline}
          onChange={(e) =>
            setLandingConfigForm({
              ...landingConfigForm,
              hero: {
                ...landingConfigForm.hero,
                headline: e.target.value,
              },
            })
          }
        />
        <div className="md:col-span-2">
          <Input
            label="Subheadline"
            value={landingConfigForm.hero.subheadline}
            onChange={(e) =>
              setLandingConfigForm({
                ...landingConfigForm,
                hero: {
                  ...landingConfigForm.hero,
                  subheadline: e.target.value,
                },
              })
            }
          />
        </div>
        <Input
          label="Button Text"
          value={landingConfigForm.hero.buttonText}
          onChange={(e) =>
            setLandingConfigForm({
              ...landingConfigForm,
              hero: {
                ...landingConfigForm.hero,
                buttonText: e.target.value,
              },
            })
          }
        />
        <Input
          label="Background Image Path"
          value={landingConfigForm.hero.backgroundImage || ""}
          onChange={(e) => {
            setHeroPreviewFailedSrc(null);
            setLandingConfigForm({
              ...landingConfigForm,
              hero: {
                ...landingConfigForm.hero,
                backgroundImage: e.target.value,
              },
            });
          }}
          placeholder="/PSA.webp"
        />
        <div className="md:col-span-2 -mt-1">
          {heroUsesBackendFilePath ? (
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 break-all">
              Using backend file path: {landingConfigForm.hero.backgroundImage}
            </p>
          ) : (
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Use a local path like `/PSA.webp` or upload below
              (stored in backend as file path).
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
            Image Focal Point
          </label>
          <select
            value={landingConfigForm.hero.backgroundPosition || "center center"}
            onChange={(e) =>
              setLandingConfigForm({
                ...landingConfigForm,
                hero: {
                  ...landingConfigForm.hero,
                  backgroundPosition: e.target.value,
                },
              })
            }
            className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="center center">Center</option>
            <option value="center 28%">Upper Center</option>
            <option value="center 38%">Upper-Mid Center</option>
            <option value="center 68%">Lower Center</option>
            <option value="left center">Left Center</option>
            <option value="right center">Right Center</option>
          </select>
        </div>

        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/30">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
              Hero Background Upload
            </label>
            <input
              type="file"
              accept="image/*"
              onPointerDown={() => {
                void heroUpload.prepare();
              }}
              onFocus={() => {
                void heroUpload.prepare();
              }}
              onChange={(e) =>
                updateHeroBackgroundImage(e.target.files?.[0], e.currentTarget)
              }
              className="w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white hover:file:bg-blue-700"
            />
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Up to 12MB. Large images are auto-optimized for the hero section.
            </p>
            <UploadProgressInline
              visible={heroUpload.status !== "idle" && !!heroUpload.message}
              message={heroUpload.message}
              progressPercent={heroUpload.progressPercent}
              tone={heroUpload.tone}
              showProgress={heroUpload.isUploading}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                className="!py-1.5 !px-3 h-auto text-[10px]"
                onClick={() => {
                  setHeroPreviewFailedSrc(null);
                  setLandingConfigForm({
                    ...landingConfigForm,
                    hero: {
                      ...landingConfigForm.hero,
                      backgroundImage: "/PSA.webp",
                    },
                  });
                }}
              >
                Use `/PSA.webp`
              </Button>
              <Button
                variant="ghost"
                className="!py-1.5 !px-3 h-auto text-[10px] text-red-600"
                onClick={() => {
                  setHeroPreviewFailedSrc(null);
                  setLandingConfigForm({
                    ...landingConfigForm,
                    hero: {
                      ...landingConfigForm.hero,
                      backgroundImage: "",
                    },
                  });
                }}
                disabled={!landingConfigForm.hero.backgroundImage}
              >
                Remove Background
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">
              Preview
            </label>
            <div className="relative h-40 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-gradient-to-br from-psa-surface to-psa-mist">
              {heroPreviewCanRender ? (
                <img
                  key={heroPreviewSource}
                  src={heroPreviewResolvedSource}
                  alt="Hero background preview"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    objectPosition:
                      landingConfigForm.hero.backgroundPosition || "center center",
                  }}
                  onLoad={() => {
                    if (heroPreviewFailedSrc === heroPreviewSource) {
                      setHeroPreviewFailedSrc(null);
                    }
                  }}
                  onError={() => setHeroPreviewFailedSrc(heroPreviewSource)}
                />
              ) : (
                <div className="absolute inset-0 z-20 flex items-center justify-center text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                  No image preview available
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-[#021526]/72 via-[#032546]/52 to-[#061935]/58" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.22),transparent_38%),radial-gradient(circle_at_85%_80%,rgba(0,86,179,0.32),transparent_42%)]" />
              <div className="relative z-10 p-3 h-full flex flex-col justify-end">
                <p className="text-[9px] uppercase tracking-[0.15em] text-white/85 font-bold">
                  Hero Background
                </p>
                <p className="text-[11px] text-white/95 font-semibold mt-1 line-clamp-2">
                  {landingConfigForm.hero.headline ||
                    "Provincial Statistical Office - Aurora"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
