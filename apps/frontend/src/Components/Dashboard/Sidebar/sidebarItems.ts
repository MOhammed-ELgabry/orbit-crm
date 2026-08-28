import { FiHome, FiUsers, FiSettings } from "react-icons/fi";
import {
  FaBuilding,
  FaBullseye,
  FaHandshake,
  FaTasks,
  FaCalendarAlt,
  FaChartBar,
} from "react-icons/fa";

export const sidebarItems = [
  {
    key: "dashboard",
    path: "/dashboard",
    icon: FiHome,
  },
  {
    key: "companies",
    path: "/dashboard/companies",
    icon: FaBuilding,
  },
  {
    key: "users",
    path: "/dashboard/users",
    icon: FiUsers,
  },
  {
    key: "leads",
    path: "/dashboard/leads",
    icon: FaBullseye,
  },
  {
    key: "deals",
    path: "/dashboard/deals",
    icon: FaHandshake,
  },
  {
    key: "tasks",
    path: "/dashboard/tasks",
    icon: FaTasks,
  },
  {
    key: "calendar",
    path: "/dashboard/calendar",
    icon: FaCalendarAlt,
  },
  {
    key: "reports",
    path: "/dashboard/reports",
    icon: FaChartBar,
  },
  {
    key: "settings",
    path: "/dashboard/settings",
    icon: FiSettings,
  },
];