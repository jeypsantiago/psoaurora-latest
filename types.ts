import React from 'react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ElementType;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

// Using const object instead of enum to avoid parsing issues in some environments
export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
} as const;

export type Theme = typeof Theme[keyof typeof Theme];

export interface SupplySignatures {
  requester?: string;
  requesterDesignation?: string;
  requesterSigUrl?: string;

  verifier?: string;
  verifierDesignation?: string;
  verifierSigUrl?: string;

  approver?: string;
  approverDesignation?: string;
  approverSigUrl?: string;

  issuer?: string;
  issuerDesignation?: string;
  issuerSigUrl?: string;

  receiver?: string;
  receiverDesignation?: string;
  receiverSigUrl?: string;
}

export interface EmploymentRecord {
  id: string;
  serialNumber: string;
  name: string;
  sex: 'Male' | 'Female';
  surveyProject: string;
  designation: string;
  dateExecution: string;
  durationFrom: string;
  durationTo: string;
  focalPerson: string;
  issuanceMonth?: string;
  createdAt: string;
}

export interface EmploymentConfig {
  prefix: string;
  separator: string;
  padding: number;
  increment: number;
  startNumber: number;
}

export type ReportFrequency = 'monthly' | 'quarterly' | 'annually';

export interface ReportProject {
  id: string;
  name: string;
  focalUserId: string;
  ownerUserId?: string;
  defaultFrequency: ReportFrequency;
  active: boolean;
  reminderLeadDays?: number | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSubmission {
  id: string;
  projectId: string;
  ownerUserId?: string;
  title: string;
  period: string;
  frequency: ReportFrequency;
  deadline: string;
  submittedDate?: string;
  reminderLeadDays?: number | null;
  remarks?: string;
  seriesId?: string;
  periodStart?: string;
  periodEnd?: string;
  sequence?: number;
  archived?: boolean;
  generatedFromReportId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportReminderSettings {
  enabled: boolean;
  dailyReminderEnabled: boolean;
  defaultLeadDays: number;
  overdueReminderDays: number;
  dailyCheckTime: string;
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface ReportReminderLog {
  id: string;
  reportId: string;
  projectId: string;
  focalUserId: string;
  focalEmail: string;
  sentAt: string;
  status: 'sent' | 'failed' | 'skipped' | 'manual-test';
  reminderStage?: 'before-deadline' | 'deadline-day' | 'after-deadline' | 'manual-test';
  triggerOffsetDays?: number;
  daysUntilDeadline?: number;
  reminderDate?: string;
  errorMessage?: string;
}

export type Permission =
  | 'all'
  | 'dashboard.view'
  | 'records.view' | 'records.edit' | 'records.delete' | 'records.export'
  | 'supply.view' | 'supply.request' | 'supply.approve' | 'supply.export' | 'supply.inventory'
  | 'property.view' | 'property.edit' | 'property.register' | 'property.issue'
  | 'property.transfer' | 'property.count' | 'property.audit' | 'property.export'
  | 'employment.view' | 'employment.edit' | 'employment.delete' | 'employment.export'
  | 'reports.view' | 'reports.view_all' | 'reports.edit' | 'reports.delete' | 'reports.reminders' | 'reports.export'
  | 'census.view' | 'census.edit'
  | 'gmail.view' | 'gmail.send'
  | 'settings.view' | 'settings.users' | 'settings.roles' | 'settings.data';

export const PERMISSION_GROUPS = {
  'Dashboard': ['dashboard.view'],
  'Records': ['records.view', 'records.edit', 'records.delete', 'records.export'],
  'Supply': ['supply.view', 'supply.request', 'supply.approve', 'supply.export', 'supply.inventory'],
  'Property': ['property.view', 'property.edit', 'property.register', 'property.issue', 'property.transfer', 'property.count', 'property.audit', 'property.export'],
  'Employment': ['employment.view', 'employment.edit', 'employment.delete', 'employment.export'],
  'Report Monitoring': ['reports.view', 'reports.view_all', 'reports.edit', 'reports.delete', 'reports.reminders', 'reports.export'],
  'Census & Surveys': ['census.view', 'census.edit'],
  'Gmail': ['gmail.view', 'gmail.send'],
  'Settings': ['settings.view', 'settings.users', 'settings.roles', 'settings.data'],
} as const;

export const NAV_PERMISSION_MAP: Record<string, Permission> = {
  '/dashboard': 'dashboard.view',
  '/records': 'records.view',
  '/supplies': 'supply.view',
  '/property': 'property.view',
  '/employment': 'employment.view',
  '/reports': 'reports.view',
  '/census': 'census.view',
  '/gmail': 'gmail.view',
  '/settings': 'settings.view',
};

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'all': 'Full administrative access to all system modules and settings.',
  'dashboard.view': 'View the system dashboard, statistics, and overview metrics.',

  'records.view': 'Browse and search through registry records and archives.',
  'records.edit': 'Create new entry and modify existing registry records.',
  'records.delete': 'Remove registry records from the system (Requires high auth).',
  'records.export': 'Generate and download official PDF reports of registry data.',

  'supply.view': 'Browse supply items and view your own request history.',
  'supply.request': 'Submit new requests for supplies and equipment.',
  'supply.approve': 'Verify and approve supply requests from other staff.',
  'supply.export': 'Generate RIS (Requisition and Issue Slip) documents.',
  'supply.inventory': 'Manage warehouse stock levels, categories, and item details.',

  'property.view': 'View property and asset listings.',
  'property.edit': 'Update property details and assignments.',
  'property.register': 'Register new assets into the property registry.',
  'property.issue': 'Issue assets to end-users and manage ICS workflows.',
  'property.transfer': 'Transfer asset custody between officers or locations.',
  'property.count': 'Conduct physical inventory counts and manage count events.',
  'property.audit': 'View the immutable audit trail of all property transactions.',
  'property.export': 'Export property reports, ICS documents, and count reports.',

  'employment.view': 'Browse and search through personnel employment contracts.',
  'employment.edit': 'Add or edit new employee contracts.',
  'employment.delete': 'Remove employment contract records.',
  'employment.export': 'Generate and download Certificate of Employment (COE) PDFs.',

  'reports.view': 'View report monitoring projects, deadlines, and submission status.',
  'reports.view_all': 'View report projects and submission schedules added by all users (read-only unless owner/focal).',
  'reports.edit': 'Create and update report projects and report submission schedules.',
  'reports.delete': 'Remove report projects and report submission records.',
  'reports.reminders': 'Configure and run report deadline email reminders.',
  'reports.export': 'Export report monitoring lists and status summaries.',

  'census.view': 'View the Census & Surveys monitoring dashboard and activity tracker.',
  'census.edit': 'Create activities, manage active cycles, and update progress in Census & Surveys.',

  'gmail.view': 'Access the integrated Gmail Hub to read messages.',
  'gmail.send': 'Compose and send emails through the Gmail Hub.',

  'settings.view': 'Access the settings panel.',
  'settings.users': 'Manage system user accounts and profiles.',
  'settings.roles': 'Create and configure system roles/permission sets.',
  'settings.data': 'Access high-level data management and reporting tools.',
};
