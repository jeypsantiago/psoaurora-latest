import React, { useCallback, useState, useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  Moon,
  Sun,
  Plus,
  LogOut,
  Bell,
  Home,
  ShieldCheck,
  Search,
  User as UserIcon,
  ChevronDown,
  ChevronLeft,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "../theme-context";
import { Theme, Permission } from "../types";
import { useUsers } from "../UserContext";
import { useRbac } from "../RbacContext";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { readStorageString, setStorageItem } from "../services/storage";

interface SidebarChildItem {
  id: string;
  label: string;
  permission?: Permission;
  action?: string;
  variant?: "default" | "action";
}

interface SidebarQuickAction {
  label: string;
  action?: string;
  tabId?: string;
  permission?: Permission;
  variant?: "primary" | "secondary";
  icon?: LucideIcon;
}

interface SidebarSubmenuItem {
  key: string;
  label: string;
  tabId?: string;
  action?: string;
  emphasis: boolean;
  icon?: LucideIcon;
}

const LEGACY_SIDEBAR_EXPANDED_STORAGE_KEY = "aurora.sidebar.expanded";

const SIDEBAR_CHILDREN_BY_ROUTE: Record<string, SidebarChildItem[]> = {
  "/census": [
    {
      id: "add-activity",
      label: "Add Activity",
      permission: "census.edit",
      action: "add-activity",
      variant: "action",
    },
  ],
  "/records": [
    { id: "history", label: "History", permission: "records.view" },
    { id: "report", label: "Report", permission: "settings.data" },
  ],
  "/supplies": [
    { id: "items", label: "Items", permission: "supply.view" },
    { id: "my-requests", label: "My Request", permission: "supply.view" },
    { id: "approval", label: "Approval", permission: "supply.approve" },
    { id: "inventory", label: "Inventory", permission: "supply.inventory" },
  ],
  "/property": [
    { id: "registry", label: "Asset Registry", permission: "property.view" },
    {
      id: "custody",
      label: "Issuance & Custody",
      permission: "property.issue",
    },
    { id: "inventory", label: "Inventory Count", permission: "property.count" },
    { id: "audit", label: "Audit Trail", permission: "property.audit" },
  ],
  "/reports": [
    { id: "projects", label: "Projects", permission: "reports.view" },
    { id: "all", label: "All Reports", permission: "reports.view" },
    { id: "due-soon", label: "Due Soon", permission: "reports.view" },
    {
      id: "settings",
      label: "Settings",
      permission: "reports.reminders",
      action: "settings",
    },
  ],
  "/settings": [
    { id: "record", label: "Record Settings", permission: "settings.view" },
    { id: "supply", label: "Supply Settings", permission: "settings.view" },
    {
      id: "employment",
      label: "Employment Settings",
      permission: "settings.view",
    },
    { id: "property", label: "Property Settings", permission: "settings.view" },
    {
      id: "reports",
      label: "Report Settings",
      permission: "settings.view",
    },
    { id: "users", label: "User Management", permission: "settings.view" },
    { id: "gmail", label: "Gmail Settings", permission: "settings.view" },
    { id: "portal", label: "Portal Config", permission: "settings.view" },
    { id: "connectivity", label: "Connectivity", permission: "settings.view" },
  ],
};
const SIDEBAR_QUICK_ACTIONS_BY_ROUTE: Record<string, SidebarQuickAction[]> = {
  "/records": [
    {
      label: "New Entry",
      tabId: "history",
      action: "new-entry",
      permission: "records.edit",
      variant: "primary",
    },
  ],
  "/employment": [
    {
      label: "Record Contract",
      action: "record-contract",
      permission: "employment.edit",
      variant: "primary",
      icon: Plus,
    },
  ],
  "/supplies": [
    {
      label: "New Request",
      tabId: "items",
      action: "new-request",
      permission: "supply.request",
      variant: "primary",
    },
    {
      label: "New Item",
      tabId: "inventory",
      action: "new-item",
      permission: "supply.inventory",
      variant: "secondary",
    },
  ],
  "/property": [
    {
      label: "Register Asset",
      tabId: "registry",
      action: "register-asset",
      permission: "property.register",
      variant: "primary",
    },
  ],
  "/reports": [
    {
      label: "New Report",
      tabId: "all",
      action: "new-report",
      permission: "reports.edit",
      variant: "primary",
      icon: Plus,
    },
  ],
};

const SIDEBAR_HOVER_TRANSITION =
  "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";
const SIDEBAR_PANEL_TRANSITION =
  "duration-260 ease-[cubic-bezier(0.22,1,0.36,1)]";
const SIDEBAR_INLINE_PANEL_TRANSITION =
  "duration-320 ease-[cubic-bezier(0.16,1,0.3,1)]";
const SIDEBAR_SHELL_TRANSITION =
  "duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]";
const SIDEBAR_CONTENT_TRANSITION =
  "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored =
      readStorageString(STORAGE_KEYS.sidebarExpanded) ??
      readStorageString(LEGACY_SIDEBAR_EXPANDED_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "1";
  });
  const [openNavHref, setOpenNavHref] = useState<string | null>(null);
  const [hoveredNavHref, setHoveredNavHref] = useState<string | null>(null);
  const [focusedNavHref, setFocusedNavHref] = useState<string | null>(null);
  const sidebarNavRef = useRef<HTMLElement | null>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { currentUser, logout, roles } = useUsers();
  const { visibleNavItems, can } = useRbac();
  const location = useLocation();
  const navigate = useNavigate();

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(false);
    setOpenNavHref(null);
    setHoveredNavHref(null);
    setFocusedNavHref(null);
  }, [location]);

  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    // Cleanup function to ensure overflow is reset if component unmounts
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStorageItem(STORAGE_KEYS.sidebarExpanded, isSidebarExpanded ? "1" : "0");
    window.localStorage.removeItem(LEGACY_SIDEBAR_EXPANDED_STORAGE_KEY);
  }, [isSidebarExpanded]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!sidebarNavRef.current?.contains(event.target as Node)) {
        setOpenNavHref(null);
        setHoveredNavHref(null);
        setFocusedNavHref(null);
      }
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenNavHref(null);
        setHoveredNavHref(null);
        setFocusedNavHref(null);
        setIsProfileDropdownOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const isCompactSidebar = !isSidebarExpanded && !isSidebarOpen;
  const isDarkTheme = theme === Theme.DARK;
  const contentInsetClass = isCompactSidebar
    ? "lg:pl-6 lg:pr-5"
    : "lg:pl-4 lg:pr-4";

  useEffect(() => {
    if (!isCompactSidebar) {
      setHoveredNavHref(null);
      setFocusedNavHref(null);
    }
  }, [isCompactSidebar]);

  const getSubmenuItems = useCallback(
    (href: string): SidebarSubmenuItem[] => {
      const childItems = (SIDEBAR_CHILDREN_BY_ROUTE[href] || [])
        .filter((child) => !child.permission || can(child.permission))
        .map((child) => ({
          key: `child:${child.id}`,
          label: child.label,
          tabId: child.id,
          action: child.action,
          emphasis: child.variant === "action",
        }));

      const quickActions = (SIDEBAR_QUICK_ACTIONS_BY_ROUTE[href] || [])
        .filter((action) => !action.permission || can(action.permission))
        .map((action, index) => ({
          key: `action:${action.action || action.tabId || index}`,
          label: action.label,
          tabId: action.tabId,
          action: action.action,
          emphasis: true,
          icon: action.icon,
        }));

      return [...childItems, ...quickActions];
    },
    [can],
  );

  const navigateToRoute = (href: string) => {
    const isCurrentRoute = location.pathname === href;
    const isCurrentBaseRoute = isCurrentRoute && !location.search;

    setOpenNavHref(null);
    setHoveredNavHref(null);
    setFocusedNavHref(null);

    if (isCurrentBaseRoute) {
      setIsSidebarOpen(false);
      return;
    }

    navigate(href);
    setIsSidebarOpen(false);
  };

  const navigateToSubmenuItem = (
    href: string,
    submenuItem: SidebarSubmenuItem,
  ) => {
    setOpenNavHref(null);
    setHoveredNavHref(null);
    setFocusedNavHref(null);

    const next = new URLSearchParams();
    if (submenuItem.tabId) {
      next.set("tab", submenuItem.tabId);
    }
    if (submenuItem.action) {
      next.set("action", submenuItem.action);
    }

    const query = next.toString();
    navigate(query ? `${href}?${query}` : href);
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    if (!openNavHref) return;

    const submenuItems = getSubmenuItems(openNavHref);
    if (submenuItems.length === 0) {
      setOpenNavHref(null);
    }
  }, [getSubmenuItems, openNavHref]);

  const headerAvatarInitials = currentUser?.name
    ? currentUser.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((value) => value[0]?.toUpperCase() || "")
        .join("")
    : "??";

  const primaryRole = currentUser?.roles?.[0] || "Viewer";
  const primaryRoleColor =
    roles.find((role) => role.name === primaryRole)?.badgeColor || "zinc";

  const activeTabParam = new URLSearchParams(location.search).get("tab") || "";

  const getSubmenuItemClassName = (
    submenuItem: SidebarSubmenuItem,
    isActive: boolean,
  ) => {
    const base = `group/item relative inline-flex w-fit min-h-[28px] max-w-[164px] items-center gap-2 rounded-[11px] px-3 py-1.5 text-left text-[11px] whitespace-nowrap transition-[background-color,color,transform,box-shadow] ${SIDEBAR_HOVER_TRANSITION}`;

    if (isActive) {
      return `${base} bg-zinc-100 text-zinc-950 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.22)] dark:bg-zinc-800/85 dark:text-white font-semibold`;
    }

    if (submenuItem.emphasis) {
      return `${base} font-semibold text-white bg-blue-600 hover:bg-blue-700 hover:translate-x-0.5 shadow-[0_10px_20px_-16px_rgba(37,99,235,0.45)] dark:bg-blue-500 dark:hover:bg-blue-600 dark:shadow-[0_10px_20px_-16px_rgba(59,130,246,0.45)]`;
    }

    return `${base} font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/45 hover:translate-x-0.5 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/40`;
  };

  return (
    <div className="h-screen bg-[#fafafa] dark:bg-black flex overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] lg:hidden transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-[1600] h-screen w-[248px] overflow-visible ${isSidebarExpanded ? "lg:w-[248px] lg:shadow-[0_24px_60px_-42px_rgba(15,23,42,0.28)] dark:lg:shadow-[0_28px_72px_-44px_rgba(0,0,0,0.72)]" : "lg:w-[80px] lg:shadow-[0_18px_42px_-38px_rgba(15,23,42,0.18)] dark:lg:shadow-[0_18px_48px_-40px_rgba(0,0,0,0.6)]"} bg-white dark:bg-[#09090b] border-r border-zinc-200/80 dark:border-zinc-800/50 transform transition-[width,transform,box-shadow,background-color,border-color] ${SIDEBAR_SHELL_TRANSITION} lg:translate-x-0
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="relative h-full flex flex-col overflow-visible">
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-100/60 via-white/0 to-transparent dark:from-blue-400/[0.08] dark:via-transparent dark:to-transparent transition-opacity ${SIDEBAR_SHELL_TRANSITION} ${isSidebarExpanded ? "opacity-100" : "opacity-60"}`}
          />
          {/* Sidebar Header */}
          <div
            className={`relative z-10 h-[70px] flex items-center border-b border-zinc-100 dark:border-zinc-800/50 transition-[padding,background-color,border-color] ${SIDEBAR_CONTENT_TRANSITION} ${isCompactSidebar ? "px-2.5 justify-center" : "px-3 pr-8 bg-white/60 dark:bg-transparent"}`}
          >
            <div
              className={`flex items-center w-full transition-[gap,justify-content] ${SIDEBAR_CONTENT_TRANSITION} ${isCompactSidebar ? "justify-center" : "justify-between"} gap-2`}
            >
              <div
                className={`flex items-center font-bold text-zinc-900 dark:text-white transition-[gap,transform] ${SIDEBAR_CONTENT_TRANSITION} ${isCompactSidebar ? "justify-center translate-x-0" : "gap-2.5 translate-x-0.5"}`}
              >
                <div
                  className={`h-10 w-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden p-1 transition-[transform,box-shadow,border-color] ${SIDEBAR_CONTENT_TRANSITION} ${isSidebarExpanded ? "scale-100 shadow-[0_10px_24px_-18px_rgba(37,99,235,0.45)] dark:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.6)]" : "scale-[0.98]"}`}
                >
                  <img
                    src="/PSA.webp"
                    alt="Philippine Statistics Authority logo"
                    className="h-full w-full object-contain"
                  />
                </div>
                {!isCompactSidebar && (
                  <div
                    className={`flex flex-col leading-none transition-[opacity,transform] ${SIDEBAR_CONTENT_TRANSITION} ${isSidebarExpanded ? "opacity-100 translate-x-0" : "opacity-0 translate-x-1"}`}
                  >
                    <span className="text-[12px] tracking-tight font-black whitespace-nowrap">
                      Philippine Statistics Authority
                    </span>
                    <span className="text-[11px] text-zinc-900 dark:text-white font-bold mt-1 tracking-[0.02em] whitespace-nowrap">
                      Aurora Provincial Office
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsSidebarExpanded((prev) => !prev)}
                className={`hidden lg:inline-flex absolute -right-2 top-1/2 -translate-y-1/2 h-5 w-5 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800 transition-all ${SIDEBAR_HOVER_TRANSITION} shadow-sm`}
                title={
                  isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"
                }
                aria-label={
                  isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"
                }
              >
                <span
                  className={`inline-flex transition-transform ${SIDEBAR_CONTENT_TRANSITION} ${isSidebarExpanded ? "rotate-0 scale-100" : "rotate-180 scale-95"}`}
                >
                  <ChevronLeft size={12} />
                </span>
              </button>
            </div>
          </div>

          {/* Nav Items */}
          <nav
            ref={sidebarNavRef}
            className={`relative z-10 flex-1 py-6 space-y-1.5 overflow-visible transition-[padding] ${SIDEBAR_CONTENT_TRANSITION} ${isCompactSidebar ? "px-3" : "px-3.5"}`}
          >
            <NavLink
              to="/"
              title={isCompactSidebar ? "Landing Page" : undefined}
              className={`flex items-center ${isCompactSidebar ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm font-semibold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800/50 mb-5 transition-all ${SIDEBAR_HOVER_TRANSITION}`}
            >
              <Home size={18} className="shrink-0" />
              {!isCompactSidebar && "Landing Page"}
            </NavLink>

            {!isCompactSidebar && (
              <div className="mb-4 px-3 text-[10px] font-bold text-zinc-900 dark:text-white uppercase tracking-[0.2em]">
                Management
              </div>
            )}

            {visibleNavItems.map((item) => (
              <div key={item.href} className="relative">
                {(() => {
                  const submenuItems = getSubmenuItems(item.href);
                  const isItemActive = location.pathname === item.href;
                  const hasNestedOptions = submenuItems.length > 0;
                  const isCompactItemActive =
                    focusedNavHref === item.href ||
                    hoveredNavHref === item.href;
                  const isSubmenuOpen =
                    hasNestedOptions && isCompactSidebar && isCompactItemActive;
                  const submenuTreeHeight = submenuItems.length * 34 + 8;
                  const shouldShowInlineChildren = false;
                  const shouldShowFlyoutChildren =
                    isCompactSidebar && hasNestedOptions && isSubmenuOpen;

                  return (
                    <div
                      className="relative"
                      onMouseEnter={
                        isCompactSidebar && hasNestedOptions
                          ? () => setHoveredNavHref(item.href)
                          : undefined
                      }
                      onMouseLeave={
                        isCompactSidebar && hasNestedOptions
                          ? () =>
                              setHoveredNavHref((current) =>
                                current === item.href ? null : current,
                              )
                          : undefined
                      }
                      onFocusCapture={
                        isCompactSidebar && hasNestedOptions
                          ? () => setFocusedNavHref(item.href)
                          : undefined
                      }
                      onBlurCapture={
                        isCompactSidebar && hasNestedOptions
                          ? (event) => {
                              if (
                                !event.currentTarget.contains(
                                  event.relatedTarget as Node | null,
                                )
                              ) {
                                setFocusedNavHref((current) =>
                                  current === item.href ? null : current,
                                );
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => navigateToRoute(item.href)}
                          title={isCompactSidebar ? item.label : undefined}
                          className={`group w-full flex items-center ${isCompactSidebar ? "justify-center px-0" : "justify-between px-3"} py-2.5 rounded-xl text-sm font-semibold transform-gpu transition-[background-color,color,box-shadow,transform] ${SIDEBAR_HOVER_TRANSITION} ${
                            isItemActive
                              ? "bg-zinc-900 text-white dark:bg-zinc-800 dark:text-white shadow-lg shadow-zinc-950/10"
                              : isSubmenuOpen
                                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200 shadow-[0_10px_22px_-18px_rgba(37,99,235,0.34)] dark:bg-blue-900/40 dark:text-blue-100 dark:ring-blue-800/50 dark:shadow-[0_12px_24px_-18px_rgba(0,0,0,0.4)]"
                                : "text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white hover:translate-x-0.5 hover:shadow-sm hover:shadow-zinc-300/40 dark:hover:shadow-black/30"
                          }`}
                          aria-expanded={
                            isCompactSidebar && hasNestedOptions
                              ? isSubmenuOpen
                              : undefined
                          }
                        >
                          <span
                            className={`flex items-center ${isCompactSidebar ? "" : "gap-3"}`}
                          >
                            <item.icon
                              size={18}
                              className={`shrink-0 transform-gpu transition-[transform,color] ${SIDEBAR_HOVER_TRANSITION} group-hover:scale-[1.08] ${isItemActive ? "text-white dark:text-white" : isSubmenuOpen ? "text-blue-700 dark:text-blue-200" : "text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white"}`}
                            />
                            {!isCompactSidebar && item.label}
                          </span>
                        </button>

                        {shouldShowInlineChildren && (
                          <div
                            className={`ml-[30px] overflow-hidden transform-gpu will-change-transform transition-[max-height,opacity,transform,margin] ${SIDEBAR_INLINE_PANEL_TRANSITION} ${
                              shouldShowInlineChildren
                                ? "max-h-[320px] opacity-100 translate-y-0 mt-0.5 mb-1"
                                : "max-h-0 opacity-0 -translate-y-1 mt-0 mb-0 pointer-events-none"
                            }`}
                          >
                            <div className="relative pb-1 pt-2">
                              <div
                                className="pointer-events-none absolute left-0 top-[-10px] text-zinc-200/80 dark:text-zinc-700/45"
                                style={{ width: 18, height: submenuTreeHeight }}
                              >
                                <svg
                                  width="18"
                                  height={submenuTreeHeight}
                                  viewBox={`0 0 18 ${submenuTreeHeight}`}
                                  className="block overflow-visible"
                                >
                                  {submenuItems.map((_, index) => {
                                    const center = 16 + index * 34;
                                    const segmentStart =
                                      index === 0 ? 0.5 : 20 + (index - 1) * 34;
                                    const segmentEnd = center - 8;

                                    return (
                                      <path
                                        key={`inline-trunk-${index}`}
                                        d={`M1 ${segmentStart}V${segmentEnd}`}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1"
                                        strokeLinecap="round"
                                      />
                                    );
                                  })}
                                  {submenuItems.length > 0 && (
                                    <path
                                      d={`M1 ${20 + (submenuItems.length - 1) * 34}V${submenuTreeHeight - 18}`}
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1"
                                      strokeLinecap="round"
                                    />
                                  )}
                                  {submenuItems.map((_, index) => {
                                    const center = 16 + index * 34;
                                    return (
                                      <path
                                        key={`inline-branch-${index}`}
                                        d={`M1 ${center - 8}V${center - 1}Q1 ${center + 4} 6 ${center + 4}H18`}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    );
                                  })}
                                </svg>
                              </div>
                              <div className="space-y-0">
                                {submenuItems.map((submenuItem) => {
                                  const isSubmenuActive =
                                    location.pathname === item.href &&
                                    !submenuItem.emphasis &&
                                    Boolean(submenuItem.tabId) &&
                                    activeTabParam === submenuItem.tabId;

                                  return (
                                    <div
                                      key={submenuItem.key}
                                      className="relative flex h-[34px] items-center pl-[18px]"
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          navigateToSubmenuItem(
                                            item.href,
                                            submenuItem,
                                          )
                                        }
                                        className={getSubmenuItemClassName(
                                          submenuItem,
                                          isSubmenuActive,
                                        )}
                                      >
                                        {submenuItem.icon &&
                                          submenuItem.emphasis && (
                                            <submenuItem.icon
                                              size={12}
                                              className="shrink-0 text-blue-100"
                                            />
                                          )}
                                        <span className="truncate">
                                          {submenuItem.label}
                                        </span>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {shouldShowFlyoutChildren && (
                        <div
                          className={`absolute left-[calc(100%+8px)] top-0 w-56 rounded-2xl border border-white/70 dark:border-white/10 bg-white/92 dark:bg-zinc-900/92 backdrop-blur-xl shadow-[0_24px_56px_-24px_rgba(15,23,42,0.52)] dark:shadow-[0_28px_64px_-28px_rgba(0,0,0,0.85)] p-2 z-[1700] origin-left animate-in fade-in ${SIDEBAR_PANEL_TRANSITION}`}
                        >
                          <div
                            className="absolute -left-2 top-0 h-full w-3"
                            aria-hidden="true"
                          />
                          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                            {item.label}
                          </p>
                          <div className="relative pl-3 pb-1 pt-2">
                            <div
                              className="pointer-events-none absolute left-0 top-[-10px] text-zinc-200/80 dark:text-zinc-700/45"
                              style={{ width: 18, height: submenuTreeHeight }}
                            >
                              <svg
                                width="18"
                                height={submenuTreeHeight}
                                viewBox={`0 0 18 ${submenuTreeHeight}`}
                                className="block overflow-visible"
                              >
                                {submenuItems.map((_, index) => {
                                  const center = 16 + index * 34;
                                  const segmentStart =
                                    index === 0 ? 0.5 : 20 + (index - 1) * 34;
                                  const segmentEnd = center - 8;

                                  return (
                                    <path
                                      key={`flyout-trunk-${index}`}
                                      d={`M1 ${segmentStart}V${segmentEnd}`}
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1"
                                      strokeLinecap="round"
                                    />
                                  );
                                })}
                                {submenuItems.length > 0 && (
                                  <path
                                    d={`M1 ${20 + (submenuItems.length - 1) * 34}V${submenuTreeHeight - 18}`}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    strokeLinecap="round"
                                  />
                                )}
                                {submenuItems.map((_, index) => {
                                  const center = 16 + index * 34;
                                  return (
                                    <path
                                      key={`flyout-branch-${index}`}
                                      d={`M1 ${center - 8}V${center - 1}Q1 ${center + 4} 6 ${center + 4}H18`}
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  );
                                })}
                              </svg>
                            </div>
                            <div className="space-y-0">
                              {submenuItems.map((submenuItem) => {
                                const isSubmenuActive =
                                  location.pathname === item.href &&
                                  !submenuItem.emphasis &&
                                  Boolean(submenuItem.tabId) &&
                                  activeTabParam === submenuItem.tabId;

                                return (
                                  <div
                                    key={submenuItem.key}
                                    className="relative flex h-[34px] items-center pl-[18px]"
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        navigateToSubmenuItem(
                                          item.href,
                                          submenuItem,
                                        )
                                      }
                                      className={getSubmenuItemClassName(
                                        submenuItem,
                                        isSubmenuActive,
                                      )}
                                    >
                                      {submenuItem.icon &&
                                        submenuItem.emphasis && (
                                          <submenuItem.icon
                                            size={12}
                                            className="shrink-0 text-blue-100"
                                          />
                                        )}
                                      <span className="truncate">
                                        {submenuItem.label}
                                      </span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div
            className={`relative z-10 border-t border-zinc-100 dark:border-zinc-800/50 transition-[padding,background-color,border-color] ${SIDEBAR_CONTENT_TRANSITION} ${isCompactSidebar ? "p-3 flex flex-col items-center gap-3" : "p-4 bg-white/55 dark:bg-transparent"}`}
          >
            {!isCompactSidebar ? (
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck size={16} className="text-blue-600" />
                  <span className="text-[11px] font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                    System Status
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[11px] text-zinc-900 dark:text-white font-medium">
                    All systems operational
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"
                title="All systems operational"
              />
            )}

            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              title={isCompactSidebar ? "Logout Session" : undefined}
              className={`flex items-center ${isCompactSidebar ? "justify-center w-10 h-10 rounded-xl" : "w-full gap-3 px-3 py-2.5 rounded-xl text-sm"} font-semibold text-zinc-900 dark:text-white hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all ${SIDEBAR_HOVER_TRANSITION}`}
            >
              <LogOut size={18} />
              {!isCompactSidebar && "Logout Session"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 h-screen bg-[#fafafa] dark:bg-black transition-[padding] ${SIDEBAR_CONTENT_TRANSITION} ${contentInsetClass}`}
      >
        {/* Header */}
        <header className="h-[72px] flex items-center justify-between px-4 sm:px-3 border-b border-zinc-200/50 dark:border-zinc-800/50 sticky top-0 z-[100] bg-[#fafafa]/80 dark:bg-black/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-colors"
            >
              <Menu size={22} />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-zinc-900 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Aurora Provincial Server Active
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden md:block">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search records..."
                className="pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all w-48 lg:w-64"
              />
            </div>
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-all">
              <Bell size={18} />
            </button>

            <button
              onClick={toggleTheme}
              className={`relative shrink-0 inline-flex h-9 w-[78px] items-center rounded-full border overflow-hidden transition-all duration-300 ease-out hover:-translate-y-0.5 border-slate-300/95 dark:border-zinc-700/95 ${isDarkTheme ? "shadow-[0_2px_8px_rgba(0,0,0,0.26)]" : "shadow-[0_2px_10px_rgba(15,23,42,0.20)]"}`}
              aria-label={
                isDarkTheme ? "Switch to light mode" : "Switch to dark mode"
              }
              title={
                isDarkTheme ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              <span
                className={`absolute inset-0 rounded-full transition-colors duration-300 ${isDarkTheme ? "bg-[#1f1f1f]/92" : "bg-[#dce2ea]/94"}`}
              />
              <span
                className={`absolute left-[3px] top-1/2 h-[30px] w-[30px] -translate-y-1/2 rounded-full border shadow-[0_2px_8px_rgba(0,0,0,0.22)] backdrop-blur-md transition-all duration-300 ease-out ${isDarkTheme ? "translate-x-0 bg-white/24 border-white/45" : "translate-x-[42px] bg-[#111827]/26 border-[#0f172a]/38"}`}
              />
              <span className="relative z-10 grid w-full grid-cols-2 place-items-center">
                <span
                  className={`inline-flex transition-all duration-300 ${isDarkTheme ? "text-zinc-100" : "text-zinc-600"}`}
                >
                  <Sun className="w-3.5 h-3.5" />
                </span>
                <span
                  className={`inline-flex transition-all duration-300 ${isDarkTheme ? "text-zinc-300" : "text-zinc-800"}`}
                >
                  <Moon className="w-3.5 h-3.5" />
                </span>
              </span>
            </button>

            {/* User Dropdown */}
            <div className="relative" ref={profileDropdownRef}>
              <div
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center gap-1.5 cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-md overflow-hidden transition-all group-hover:shadow-lg">
                  {currentUser?.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.name || "Profile avatar"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase">
                      {headerAvatarInitials}
                    </span>
                  )}
                </div>
                <ChevronDown
                  size={12}
                  className={`text-zinc-400 transition-transform duration-300 ${isProfileDropdownOpen ? "rotate-180" : ""}`}
                />
              </div>

              {isProfileDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[110]"
                    onClick={() => setIsProfileDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl z-[120] p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        Active Account
                      </p>
                      <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                        {currentUser?.email}
                      </p>
                      <div className="mt-1.5">
                        <span
                          className={`inline-flex max-w-full truncate px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-${primaryRoleColor}-50 text-${primaryRoleColor}-700 border border-${primaryRoleColor}-100 dark:bg-${primaryRoleColor}-500/10 dark:text-${primaryRoleColor}-400 dark:border-${primaryRoleColor}-500/20`}
                        >
                          {primaryRole}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigate("/profile");
                        setIsProfileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                    >
                      <UserIcon size={16} /> User Profile
                    </button>
                    <button
                      onClick={() => {
                        navigate("/settings");
                        setIsProfileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white transition-all"
                    >
                      <Settings2 size={16} /> Account Settings
                    </button>
                    <div className="h-px bg-zinc-100 dark:border-zinc-800 my-1" />
                    <button
                      onClick={() => {
                        logout();
                        navigate("/");
                        setIsProfileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                    >
                      <LogOut size={16} /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-3 sm:py-8 scroll-smooth pb-safe">
          <div className="w-full max-w-none mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};
