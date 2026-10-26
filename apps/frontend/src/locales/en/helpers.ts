import {
  flattenHelpers,
  type HelperContent,
  type HelperId,
} from "../../lib/helperRegistry";

const content: Record<HelperId, HelperContent> = {
  navDashboard: {
    title: "Dashboard",
    body: "Your starting page: key counts and recent activity.",
    benefit: "See what needs attention at a glance.",
  },
  navContacts: {
    title: "Contacts",
    body: "The people and organisations you deal with, in one list.",
    benefit: "Find anyone fast and open their full record.",
  },
  navTeam: {
    title: "Team",
    body: "The people who use this workspace and what each can do.",
    benefit: "Control who has access.",
  },
  navLeads: {
    title: "Leads",
    body: "Prospects you are still qualifying.",
    benefit: "Follow each one until it becomes a deal.",
  },
  navDeals: {
    title: "Deals",
    body: "Opportunities moving through your pipeline.",
    benefit: "Know the stage and value of every deal.",
  },
  navTasks: {
    title: "Tasks",
    body: "Follow-ups and to-dos for you and your team.",
    benefit: "Nothing slips past its due date.",
  },
  navCalendar: {
    title: "Calendar",
    body: "Meetings and scheduled activities by date.",
    benefit: "Plan your day and week.",
  },
  navReports: {
    title: "Reports",
    body: "Performance indicators for your pipeline, leads and tasks.",
    benefit: "Understand results over any period.",
  },
  navAudit: {
    title: "Audit Log",
    body: "A read-only record of important actions in this workspace.",
    benefit: "See who changed what, and when. Owner only.",
  },
  navSettings: {
    title: "Settings",
    body: "Company details, language, appearance and notifications.",
  },
  logout: {
    title: "Logout",
    body: "Ends your session on this device.",
  },
  notifications: {
    title: "Notifications",
    body: "Recent alerts about activity that concerns you.",
    benefit: "Open one to jump straight to the item.",
  },
  chat: {
    title: "Team chat",
    body: "Message your teammates without leaving Orbit.",
  },
  importContacts: {
    title: "Import contacts",
    body: "Adds contacts from a supported CSV or Excel file.",
    benefit: "You review the rows before anything is saved.",
  },
  reportsPeriod: {
    title: "Report period",
    body: "Sets the date range used by every report below.",
    benefit: "Compare different time windows without leaving the page.",
  },
  authLanguage: {
    title: "Language",
    body: "Changes the language of this sign-in screen only.",
    benefit: "Your account's saved language is not changed.",
  },
  settingsLanguage: {
    title: "Interface language",
    body: "The language used across the whole application for you.",
    benefit: "It is saved to your account and follows you to any device.",
  },
  settingsAppearance: {
    title: "Appearance",
    body: "Sets the background colour of the main content area.",
    benefit: "Text colour adjusts automatically so it stays readable.",
  },
  settingsNotifications: {
    title: "Notification settings",
    body: "Choose which events notify you.",
    benefit: "Fewer distractions, nothing important missed.",
  },
};

const helpers = {
  ...flattenHelpers(content),
  helperBenefitLabel: "Why use it:",
  helperIconLabel: "What is {{name}}?",
};

export default helpers;
