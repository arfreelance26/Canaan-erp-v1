import type {
  BillTo,
  CargoClassification,
  ContainerSpecification,
  DriverAdvancePaymentMethod,
  DriverCompensationType,
  MovementCategory,
  PaymentType,
  TransportMethod,
  Trip,
  TripCategory,
} from "@/types/trip";

const TRIP_ID_PREFIX = "TRP-";
const TRIP_ID_START = 1050;

export function generateTripId(existing: Trip[]): string {
  const maxNumber = existing.reduce((max, trip) => {
    const match = trip.tripId.match(/(\d+)$/);
    const value = match ? parseInt(match[1], 10) : TRIP_ID_START - 1;
    return Math.max(max, value);
  }, TRIP_ID_START - 1);

  return `${TRIP_ID_PREFIX}${maxNumber + 1}`;
}

export function generateBookingReferenceNo(existing: Trip[], bookingDate: string): string {
  if (!bookingDate) return "";

  const [year, month, day] = bookingDate.split("-");
  const ddmmyy = `${day}${month}${year.slice(2)}`;

  const sameDayCount = existing.filter((trip) => trip.bookingCreatedDate === bookingDate).length;
  const sequence = String(sameDayCount + 1).padStart(3, "0");

  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const fiscalStartYear = monthNum >= 4 ? yearNum : yearNum - 1;
  const fiscalYearLabel = `${String(fiscalStartYear).slice(2)}-${String(fiscalStartYear + 1).slice(2)}`;

  return `CGI/${ddmmyy}/${sequence}/${fiscalYearLabel}`;
}

export const TRIP_PROGRESS_STATUSES: Trip["status"][] = [
  "Assigned",
  "Started",
  "Loaded",
  "On-Transit",
  "Reached",
  "Unloaded",
  "Completed",
];

export const TRIP_STATUS_OPTIONS: Trip["status"][] = [
  ...TRIP_PROGRESS_STATUSES,
  "Cancelled",
];

export const TRIP_CATEGORY_OPTIONS: TripCategory[] = ["LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING"];

export const MOVEMENT_CATEGORY_OPTIONS: MovementCategory[] = ["self", "third party"];

export const CARGO_CLASSIFICATION_OPTIONS: CargoClassification[] = [
  "IMPORT",
  "EXPORT",
  "EMPTY",
  "CFS LADEN",
  "OPEN LOAD",
  "COASTAL",
];

export const CONTAINER_SPECIFICATION_OPTIONS: ContainerSpecification[] = [
  "20 FT CONTAINER",
  "40 FT CONTAINER",
  "2 X 20 FEET CONTAINERS",
  "OPEN LOAD CARGO",
];

export const BILL_TO_OPTIONS: BillTo[] = ["CUSTOMER", "CONSIGNEE"];

export const PAYMENT_TYPE_OPTIONS: PaymentType[] = ["Credit", "Cash", "Fuel"];

export const TRANSPORT_METHOD_OPTIONS: TransportMethod[] = [
  "Own Fleet",
  "Third-Party Transporter",
];

export const DRIVER_ADVANCE_PAYMENT_METHOD_OPTIONS: DriverAdvancePaymentMethod[] = [
  "None",
  "CASH",
  "NEFT/IMPS/UPI",
  "Both",
];

export const DRIVER_COMPENSATION_TYPE_OPTIONS: DriverCompensationType[] = [
  "Normal",
  "FIXED",
];

export const initialTrips: Trip[] = [
  {
    id: "1",
    tripId: "TRP-1050",
    status: "Started",
    assignedDate: "2026-06-24",
    bookingReferenceNo: "CGI/010626/001/26-27",
    bookingCreatedDate: "2026-06-01",
    tripCategory: "LOCAL",
    movementCategory: "self",
    customerId: "2",
    shipperConsignee: "Blue Wave Shipping Pvt Ltd",
    cargoClassification: "IMPORT",
    containerSpecification: "20 FT CONTAINER",
    containerNumber: "CONT-554821",
    containerNumber1: "",
    containerNumber2: "",
    cargoReference: "",
    releaseOrderReference: "RO-99231",
    cargoWeight: "14",
    origin: "Coimbatore",
    destination: "Bengaluru",
    shippingLine: "—",
    vesselName: "—",
    transportMethod: "Own Fleet",
    scheduledDate: "2026-06-13",
    driverId: "CGI-D001",
    vehicleId: "CGI-T001",
    billTo: "CUSTOMER",
    paymentType: "Credit",
    customerCashAdvance: "5000",
    customerFuelAdvanceAmount: "8000",
    customerFuelAdvanceLitres: "85",
    driverAdvanceAmount: "2000",
    driverAdvancePaymentMethod: "CASH",
    driverCompensationType: "Normal",
    transportHireAmount: "32000",
    transportCrossingAmount: "0",
    finalSettlementAmount: "30000",
    internalRemarks: "Handle with care - fragile textile goods",
    bookingInstructions: "Deliver to warehouse gate B before 6 PM",
  },
  {
    id: "2",
    tripId: "TRP-1049",
    status: "On-Transit",
    assignedDate: "2026-06-23",
    bookingReferenceNo: "CGI/310526/001/26-27",
    bookingCreatedDate: "2026-05-31",
    tripCategory: "LOCAL",
    movementCategory: "self",
    customerId: "1",
    shipperConsignee: "Sri Lakshmi Traders",
    cargoClassification: "IMPORT",
    containerSpecification: "20 FT CONTAINER",
    containerNumber: "CONT-554790",
    containerNumber1: "",
    containerNumber2: "",
    cargoReference: "",
    releaseOrderReference: "RO-99187",
    cargoWeight: "12",
    origin: "Coimbatore",
    destination: "Chennai",
    shippingLine: "—",
    vesselName: "—",
    transportMethod: "Own Fleet",
    scheduledDate: "2026-06-12",
    driverId: "CGI-D001",
    vehicleId: "CGI-T001",
    billTo: "CONSIGNEE",
    paymentType: "Cash",
    customerCashAdvance: "3000",
    customerFuelAdvanceAmount: "6000",
    customerFuelAdvanceLitres: "65",
    driverAdvanceAmount: "1500",
    driverAdvancePaymentMethod: "NEFT/IMPS/UPI",
    driverCompensationType: "Normal",
    transportHireAmount: "28000",
    transportCrossingAmount: "0",
    finalSettlementAmount: "26500",
    internalRemarks: "",
    bookingInstructions: "Contact consignee before arrival",
  },
  {
    id: "3",
    tripId: "TRP-1048",
    status: "Completed",
    assignedDate: "2026-06-20",
    bookingReferenceNo: "CGI/280526/001/26-27",
    bookingCreatedDate: "2026-05-28",
    tripCategory: "OUTSTATION",
    movementCategory: "third party",
    customerId: "2",
    shipperConsignee: "Blue Wave Shipping Pvt Ltd",
    cargoClassification: "EXPORT",
    containerSpecification: "40 FT CONTAINER",
    containerNumber: "CONT-554712",
    containerNumber1: "",
    containerNumber2: "",
    cargoReference: "",
    releaseOrderReference: "RO-99102",
    cargoWeight: "18",
    origin: "Kochi",
    destination: "Coimbatore",
    shippingLine: "Cochin Shipyard Lines",
    vesselName: "MV Malabar Star",
    transportMethod: "Own Fleet",
    scheduledDate: "2026-06-10",
    driverId: "CGI-D001",
    vehicleId: "CGI-T001",
    billTo: "CUSTOMER",
    paymentType: "Fuel",
    customerCashAdvance: "4000",
    customerFuelAdvanceAmount: "7000",
    customerFuelAdvanceLitres: "75",
    driverAdvanceAmount: "1800",
    driverAdvancePaymentMethod: "Both",
    driverCompensationType: "FIXED",
    transportHireAmount: "35000",
    transportCrossingAmount: "0",
    finalSettlementAmount: "35000",
    internalRemarks: "",
    bookingInstructions: "",
  },
];
