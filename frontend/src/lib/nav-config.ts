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
  ShieldX,
  BarChart2,
  Receipt,
  UserCheck,
  CalendarOff,
  Calculator,
  Droplets,
  Lock,
  Coins,
  Settings2,
  Gauge,
  PieChart,
  Map,
  Navigation,
  DollarSign,
  LineChart,
  MessageSquare,
  IndianRupee,
  Trash2,
  Filter,
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
    title: "Connect",
    items: [{ label: "Canaan Chat", href: "/connect/chat", icon: MessageSquare }],
  },
  {
    title: "Insights",
    items: [
      { label: "Profitability", href: "/insights/pl-summary", icon: TrendingUp },
      { label: "Running Cost Calculator", href: "/insights/running-cost-calculator", icon: Calculator },
      { label: "Trip Profitability Calculator", href: "/insights/trip-profitability-calculator", icon: PieChart },
      { label: "Fleet Summary", href: "/insights/fleet-summary", icon: Map },
      { label: "Trip Summary", href: "/trips/pnl-mileage", icon: BarChart2 },
      { label: "Truck Maintenance Record", href: "/maintenance/truck-records", icon: Wrench },
      { label: "Truck Fuel Record", href: "/maintenance/truck-fuel-record", icon: Fuel },
      { label: "Truck EMI Record", href: "/finance/truck-emi-record", icon: Landmark },
      { label: "Truck Compliance Record", href: "/maintenance/truck-compliance-record", icon: ShieldCheck },
      { label: "Customer Profitability Analytics", href: "/insights/customer-profitability-analytics", icon: LineChart },
    ],
  },
  {
    title: "Attendance & Approvals",
    items: [
      { label: "Mark Attendance", href: "/attendance/mark", icon: UserCheck },
      { label: "Driver Attendance", href: "/attendance/drivers", icon: ClipboardCheck },
      { label: "Staff Attendance", href: "/attendance/staff", icon: ClipboardList },
      { label: "Staff Holidays", href: "/attendance/holidays", icon: CalendarOff },
      { label: "Leave Requests", href: "/attendance/leave-requests", icon: Send },
      { label: "Payment Requests", href: "/attendance/payment-requests", icon: IndianRupee },
      { label: "Leave Approvals", href: "/attendance/leave-approvals", icon: CalendarCheck },
      { label: "Edit Approvals", href: "/attendance/edit-approvals", icon: ShieldAlert },
      { label: "Deletion Approvals", href: "/attendance/deletion-approvals", icon: ShieldX },
      { label: "Attendance Report", href: "/attendance/report", icon: BarChart3 },
    ],
  },
  {
    title: "Trip and Driver Management",
    items: [
      { label: "Assign Drivers", href: "/trips/assign-drivers", icon: IdCard },
      { label: "Assign Trips", href: "/trips/assign", icon: Send },
      { label: "Available Trips", href: "/trips/available", icon: Navigation },
      { label: "Current Trips", href: "/trips/current", icon: Route },
      { label: "Completed Trips", href: "/trips/completed", icon: Route },
      { label: "Trip Sheet Collection", href: "/trips/sheet-collection", icon: FileCheck },
      { label: "Trip Reconciliation", href: "/trips/reconciliation", icon: ClipboardList },
      { label: "Verification & Invoicing", href: "/trips/verification", icon: ClipboardCheck },
      { label: "Trip History", href: "/trips/history", icon: History },
      { label: "Deleted Trips", href: "/trips/deleted", icon: Trash2 },
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
    title: "Records",
    items: [
      { label: "Air Filter R&R", href: "/maintenance/air-filter-rr", icon: Filter },
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
      { label: "Trip Expenses", href: "/admin/trip-expenses", icon: Receipt },
      { label: "Repairs Management", href: "/admin/repairs", icon: Wrench },
      { label: "Maintenance Alert Management", href: "/admin/maintenance-management", icon: Settings2 },
      { label: "Truck Run Configuration", href: "/admin/truck-run-config", icon: Gauge },
      { label: "Tyre Cost Configuration", href: "/admin/tyre-cost-config", icon: DollarSign },
      { label: "Tyre Range Configuration", href: "/admin/tyre-range-config", icon: CircleDot },
      { label: "Compliance Cost Configuration", href: "/admin/compliance-cost-config", icon: FileCheck },
      { label: "SAC Code Management", href: "/admin/sac-codes", icon: Tag },
      { label: "AdBlue Management", href: "/admin/adblue", icon: Droplets },
      { label: "Default Batta Management", href: "/admin/default-batta", icon: Coins },
      { label: "Security Log", href: "/admin/security", icon: Lock },
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
