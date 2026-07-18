import {
  LayoutDashboard,
  ClipboardCheck,
  ClipboardList,
  CalendarCheck,
  Route,
  Send,
  Users,
  IdCard,
  Wrench,
  Truck,
  Building2,
  Handshake,
  CircleDot,
  Boxes,
  ShieldCheck,
  Landmark,
  Wallet,
  Banknote,
  Fuel,
  GitBranch,
  TrendingUp,
  Tag,
  History,
  BarChart3,
  FileCheck,
  ShieldAlert,
  BarChart2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const sidebarSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    title: "Insights",
    items: [{ label: "P&L Summary", href: "/insights/pl-summary", icon: TrendingUp }],
  },
  {
    title: "Attendance",
    items: [
      { label: "Driver Attendance", href: "/attendance/drivers", icon: ClipboardCheck },
      { label: "Staff Attendance", href: "/attendance/staff", icon: ClipboardList },
      { label: "Leave Requests", href: "/attendance/leave-requests", icon: Send },
      { label: "Leave Approvals", href: "/attendance/leave-approvals", icon: CalendarCheck },
      { label: "Edit Approvals", href: "/attendance/edit-approvals", icon: ShieldAlert },
      { label: "Attendance Report", href: "/attendance/report", icon: BarChart3 },
    ],
  },
  {
    title: "Trip and Driver Management",
    items: [
      { label: "Assign Drivers", href: "/trips/assign-drivers", icon: IdCard },
      { label: "Assign Trips", href: "/trips/assign", icon: Send },
      { label: "Current Trips", href: "/trips/current", icon: Route },
      { label: "Completed Trips", href: "/trips/completed", icon: Route },
      { label: "Sheet Collection", href: "/trips/sheet-collection", icon: FileCheck },
      { label: "Trip Reconciliation", href: "/trips/reconciliation", icon: ClipboardList },
      { label: "Verification & Invoicing", href: "/trips/verification", icon: ClipboardCheck },
      { label: "Trip History", href: "/trips/history", icon: History },
      { label: "P&L & Mileage", href: "/trips/pnl-mileage", icon: BarChart2 },
    ],
  },
  {
    title: "Resource Hub",
    items: [
      { label: "Our Staff", href: "/resources/staff", icon: Users },
      { label: "Our Drivers", href: "/resources/drivers", icon: IdCard },
      { label: "Our Fleet", href: "/resources/fleet", icon: Truck },
      { label: "Our Customers", href: "/resources/customers", icon: Building2 },
      { label: "Our Vendors", href: "/resources/vendors", icon: Handshake },
    ],
  },
  {
    title: "Maintenance and Care",
    items: [
      { label: "Truck Maintenance", href: "/maintenance/trucks", icon: Wrench },
      { label: "Tyre Management", href: "/maintenance/tyre-management", icon: CircleDot },
      { label: "Tyre Inventory", href: "/maintenance/tyre-inventory", icon: Boxes },
      { label: "Truck's Fuel History", href: "/maintenance/fuel-history", icon: Fuel },
    ],
  },
  {
    title: "Finance Hub",
    items: [
      { label: "Driver Compensation", href: "/finance/driver-compensation", icon: Wallet },
      { label: "Staff Compensation", href: "/finance/staff-compensation", icon: Banknote },
      { label: "EMI Tracking", href: "/finance/emi-tracking", icon: Landmark },
      { label: "Compliance & Renewals", href: "/maintenance/compliance", icon: ShieldCheck },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Branch Management", href: "/admin/branches", icon: GitBranch },
      { label: "Repairs Management", href: "/admin/repairs", icon: Wrench },
      { label: "SAC Code Management", href: "/admin/sac-codes", icon: Tag },
    ],
  },
];

export type TopNavItem = {
  label: string;
  href: string;
  hasDropdown: boolean;
};

export const topNavItems: TopNavItem[] = [
  { label: "Overview", href: "/", hasDropdown: false },
  { label: "Current Trips", href: "/trips/current", hasDropdown: false },
  { label: "Assign Trip", href: "/trips/assign", hasDropdown: false },
  { label: "Truck Maintenance", href: "/maintenance/trucks", hasDropdown: false },
  { label: "Tyre Management", href: "/maintenance/tyre-management", hasDropdown: false },
  { label: "Driver Attendance", href: "/attendance/drivers", hasDropdown: false },
];
