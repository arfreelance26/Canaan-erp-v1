"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { CustomerFormDialog, DRAFT_KEY as CUSTOMER_DRAFT_KEY } from "@/components/customers/CustomerFormDialog";
import { CustomerPricingTable } from "@/components/customers/CustomerPricingTable";
import { CustomerPricingFormDialog, DRAFT_KEY as PRICING_DRAFT_KEY } from "@/components/customers/CustomerPricingFormDialog";
import { CustomerDestinationTable } from "@/components/customers/CustomerDestinationTable";
import { CustomerDestinationFormDialog, DRAFT_KEY as DESTINATION_DRAFT_KEY } from "@/components/customers/CustomerDestinationFormDialog";
import { FinalCustomerPricingFormDialog } from "@/components/customers/FinalCustomerPricingFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import { customersApi, editApprovalsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { CustomerDestination } from "@/types/customer-destination";
import type { FinalCustomerPricing } from "@/types/final-customer-pricing";
import type { EditApprovalRequest, EditApprovalAction } from "@/types/edit-approval";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { useAuth } from "@/context/AuthContext";

const TABS = [
  { id: "list", label: "Customer List" },
  { id: "destinations", label: "Our Customer Destinations" },
  { id: "pricing", label: "Our Customer Pricing" },
  { id: "finalPricing", label: "Final Customer Pricing (For Accounts)" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CustomersPage() {
  const { user } = useAuth();
  const isStaff = user?.softwareDesignation === "Trip Sheet Register";
  const canSeeFinalPricing =
    user?.softwareDesignation === "Admin" || user?.softwareDesignation === "Accounts";

  const [activeTab, setActiveTab] = useState<TabId>("list");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Edit approval state (Staff only)
  const [activeApprovals, setActiveApprovals] = useState<EditApprovalRequest[]>([]);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: EditApprovalAction; resourceId: string; resourceName: string } | null>(null);

  const [pricing, setPricing] = useState<CustomerPricing[]>([]);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  const [editingPricing, setEditingPricing] = useState<CustomerPricing | null>(null);

  const [destinations, setDestinations] = useState<CustomerDestination[]>([]);
  const [loadingDestinations, setLoadingDestinations] = useState(false);
  const [destinationDialogOpen, setDestinationDialogOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState<CustomerDestination | null>(null);

  const [finalPricing, setFinalPricing] = useState<FinalCustomerPricing[]>([]);
  const [loadingFinalPricing, setLoadingFinalPricing] = useState(false);
  const [finalPricingDialogOpen, setFinalPricingDialogOpen] = useState(false);
  const [editingFinalPricing, setEditingFinalPricing] = useState<FinalCustomerPricing | null>(null);

  const filteredCustomers = customers.filter(c =>
    !searchQuery ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.gstin?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPricing = pricing.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const c = customers.find(cust => cust.id === p.customerId);
    return (
      (c?.name.toLowerCase().includes(q)) ||
      p.customerDestination?.toLowerCase().includes(q) ||
      p.cargoClassification?.toLowerCase().includes(q) ||
      p.containerType?.toLowerCase().includes(q)
    );
  });

  const filteredDestinations = destinations.filter(d => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const c = customers.find(cust => cust.id === d.customerId);
    return (
      (c?.name.toLowerCase().includes(q)) ||
      d.destinationName?.toLowerCase().includes(q) ||
      d.destinationState?.toLowerCase().includes(q)
    );
  });

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
        customersApi.list().then(setCustomers).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("customer_updated", () => setRefreshKey(k => k + 1));

  // Load and refresh active edit approvals for Staff
  useEffect(() => {
    if (!isStaff) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  }, [isStaff]);
  useWebSocketEvent("edit_approval_updated", () => {
    if (!isStaff) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  });

  function hasActiveApproval(resourceId: string, action: EditApprovalAction): boolean {
    return activeApprovals.some((a) =>
      a.resourceType === "Customer" &&
      String(a.resourceId) === resourceId &&
      a.action === action &&
      a.expiresAt != null &&
      new Date(a.expiresAt.endsWith("Z") ? a.expiresAt : a.expiresAt + "Z") > new Date()
    );
  }

  // Load pricing and destinations lazily when tab is opened.
  // Destinations are also loaded on the pricing tab because the pricing form
  // needs them to populate the destination dropdown.
  useEffect(() => {
    if (activeTab === "pricing" && customers.length > 0 && pricing.length === 0) {
      setLoadingPricing(true);
      Promise.all(customers.map((c) => customersApi.listPricing(c.id)))
        .then((results) => setPricing(results.flat()))
        .finally(() => setLoadingPricing(false));
    }
    if ((activeTab === "destinations" || activeTab === "pricing") && customers.length > 0 && destinations.length === 0) {
      setLoadingDestinations(true);
      Promise.all(customers.map((c) => customersApi.listDestinations(c.id)))
        .then((results) => setDestinations(results.flat()))
        .finally(() => setLoadingDestinations(false));
    }
    if (activeTab === "finalPricing" && customers.length > 0 && finalPricing.length === 0) {
      setLoadingFinalPricing(true);
      Promise.all(customers.map((c) => customersApi.listFinalPricing(c.id)))
        .then((results) => setFinalPricing(results.flat()))
        .finally(() => setLoadingFinalPricing(false));
    }
  }, [activeTab, customers, pricing.length, destinations.length, finalPricing.length]);

  function handleAddCustomer() {
    setEditingCustomer(null);
    setCustomerDialogOpen(true);
  }

  function handleEditCustomer(customer: Customer) {
    if (isStaff && !hasActiveApproval(customer.id, "Edit")) {
      setPendingAction({ type: "Edit", resourceId: customer.id, resourceName: customer.name });
      setEditRequestOpen(true);
      return;
    }
    setEditingCustomer(customer);
    setCustomerDialogOpen(true);
  }

  async function handleDeleteCustomer(id: string) {
    const customer = customers.find((c) => c.id === id);
    if (isStaff && !hasActiveApproval(id, "Delete")) {
      setPendingAction({ type: "Delete", resourceId: id, resourceName: customer?.name ?? id });
      setEditRequestOpen(true);
      return;
    }
    const result = await confirmDelete("customer");
    if (!result.isConfirmed) return;
    try {
      await customersApi.delete(id);
      setCustomers((prev) => prev.filter((customer) => customer.id !== id));
      showSuccess("Customer deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete customer.");
    }
  }

  async function handleEditRequestSubmit(reason: string) {
    if (!pendingAction) return;
    try {
      await editApprovalsApi.create({
        resourceType: "Customer",
        resourceId: parseInt(pendingAction.resourceId),
        resourceName: pendingAction.resourceName,
        action: pendingAction.type,
        reason,
      });
      showSuccess("Edit request has been sent.");
      setEditRequestOpen(false);
      setPendingAction(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send edit request.");
    }
  }

  async function handleSaveCustomer(customer: Customer) {
    try {
      const exists = customers.some((existing) => existing.id === customer.id);
      if (exists) {
        const updated = await customersApi.update(customer.id, customer);
        setCustomers((prev) => prev.map((existing) => (existing.id === customer.id ? updated : existing)));
        showSuccess("Customer updated successfully.");
      } else {
        const created = await customersApi.create(customer);
        setCustomers((prev) => [...prev, created]);
        clearFormDraft(CUSTOMER_DRAFT_KEY);
        showSuccess("Customer created successfully.");
      }
      setCustomerDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save customer.");
    }
  }

  function handleAddPricing() {
    setEditingPricing(null);
    setPricingDialogOpen(true);
  }

  function handleEditPricing(entry: CustomerPricing) {
    setEditingPricing(entry);
    setPricingDialogOpen(true);
  }

  async function handleDeletePricing(pricingId: string) {
    const result = await confirmDelete("pricing entry");
    if (!result.isConfirmed) return;
    const entry = pricing.find((p) => p.id === pricingId);
    if (!entry) return;
    try {
      await customersApi.deletePricing(entry.customerId, pricingId);
      setPricing((prev) => prev.filter((p) => p.id !== pricingId));
      showSuccess("Pricing entry deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete pricing entry.");
    }
  }

  async function handleSavePricing(entry: CustomerPricing) {
    try {
      const exists = pricing.some((existing) => existing.id === entry.id);
      if (exists) {
        const updated = await customersApi.updatePricing(entry.customerId, entry.id, entry);
        setPricing((prev) => prev.map((existing) => (existing.id === entry.id ? updated : existing)));
        showSuccess("Pricing entry updated successfully.");
      } else {
        const created = await customersApi.createPricing(entry.customerId, entry);
        setPricing((prev) => [...prev, created]);
        clearFormDraft(PRICING_DRAFT_KEY);
        showSuccess("Pricing entry created successfully.");
      }
      setPricingDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save pricing entry.");
    }
  }

  function handleAddDestination() {
    setEditingDestination(null);
    setDestinationDialogOpen(true);
  }

  function handleEditDestination(entry: CustomerDestination) {
    setEditingDestination(entry);
    setDestinationDialogOpen(true);
  }

  async function handleDeleteDestination(destId: string) {
    const result = await confirmDelete("destination");
    if (!result.isConfirmed) return;
    const entry = destinations.find((d) => d.id === destId);
    if (!entry) return;
    try {
      await customersApi.deleteDestination(entry.customerId, destId);
      setDestinations((prev) => prev.filter((d) => d.id !== destId));
      showSuccess("Destination deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete destination.");
    }
  }

  async function handleSaveDestination(entry: CustomerDestination) {
    try {
      const exists = destinations.some((existing) => existing.id === entry.id);
      if (exists) {
        const updated = await customersApi.updateDestination(entry.customerId, entry.id, entry);
        setDestinations((prev) => prev.map((existing) => (existing.id === entry.id ? updated : existing)));
        showSuccess("Destination updated successfully.");
      } else {
        const created = await customersApi.createDestination(entry.customerId, entry);
        setDestinations((prev) => [...prev, created]);
        clearFormDraft(DESTINATION_DRAFT_KEY);
        showSuccess("Destination created successfully.");
      }
      setDestinationDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save destination.");
    }
  }

  async function handleSaveFinalPricing(customerId: string, data: { actualHireAmount: string | null; accountsHireAmount: string | null }) {
    try {
      if (editingFinalPricing) {
        const updated = await customersApi.updateFinalPricing(editingFinalPricing.customerId, editingFinalPricing.id, {
          ...data,
          clientVersion: editingFinalPricing.version,
        });
        setFinalPricing((prev) => prev.map((fp) => (fp.id === editingFinalPricing.id ? updated : fp)));
        showSuccess("Final pricing updated successfully.");
      } else {
        const created = await customersApi.createFinalPricing(customerId, data);
        setFinalPricing((prev) => [...prev, created]);
        showSuccess("Final pricing added successfully.");
      }
      setFinalPricingDialogOpen(false);
      setEditingFinalPricing(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save final pricing.");
    }
  }

  async function handleDeleteFinalPricing(id: string) {
    const entry = finalPricing.find((fp) => fp.id === id);
    if (!entry) return;
    const result = await confirmDelete("final pricing entry");
    if (!result.isConfirmed) return;
    try {
      await customersApi.deleteFinalPricing(entry.customerId, id);
      setFinalPricing((prev) => prev.filter((fp) => fp.id !== id));
      showSuccess("Final pricing deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete final pricing.");
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Customers</h1>
          <p className="mt-1 text-sm text-gray-500">Manage customer records, pricing, and destinations</p>
        </div>
        <div className="flex items-center gap-4">
          <DownloadExcelButton path="/exports/customers" filename="customers.xlsx" label="Download Excel (List, Destinations, Pricing)" />
          <div className="flex flex-col items-end rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {activeTab === "list" ? "Total Customers" : activeTab === "destinations" ? "Total Destinations" : activeTab === "pricing" ? "Total Pricing Rules" : "Final Pricing Entries"}
            </p>
            <p className="text-2xl font-bold text-blue-600">
              {activeTab === "list" ? customers.length : activeTab === "destinations" ? destinations.length : activeTab === "pricing" ? pricing.length : finalPricing.length}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200">
        {TABS.filter((tab) => tab.id !== "finalPricing" || canSeeFinalPricing).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "list" && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
            <button
              type="button"
              onClick={handleAddCustomer}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Customer
            </button>
          </div>

          <CustomerTable customers={filteredCustomers} onEdit={handleEditCustomer} onDelete={handleDeleteCustomer} />

          <CustomerFormDialog
            open={customerDialogOpen}
            onClose={() => setCustomerDialogOpen(false)}
            onSave={handleSaveCustomer}
            initialData={editingCustomer}
          />
        </div>
      )}

      {activeTab === "pricing" && loadingPricing && (
        <PageSkeleton hasButton hasSearch columns={5} />
      )}

      {activeTab === "pricing" && !loadingPricing && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search pricing..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
            <button
              type="button"
              onClick={handleAddPricing}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Pricing
            </button>
          </div>

          <CustomerPricingTable
            pricing={filteredPricing}
            customers={customers}
            onEdit={handleEditPricing}
            onDelete={handleDeletePricing}
          />

          <CustomerPricingFormDialog
            open={pricingDialogOpen}
            onClose={() => setPricingDialogOpen(false)}
            onSave={handleSavePricing}
            initialData={editingPricing}
            customers={customers}
            destinations={destinations}
            existingPricing={pricing}
          />
        </div>
      )}

      {activeTab === "destinations" && loadingDestinations && (
        <PageSkeleton hasButton hasSearch columns={5} />
      )}

      {activeTab === "destinations" && !loadingDestinations && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search destinations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
            <button
              type="button"
              onClick={handleAddDestination}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Destination
            </button>
          </div>

          <CustomerDestinationTable
            destinations={filteredDestinations}
            customers={customers}
            onEdit={handleEditDestination}
            onDelete={handleDeleteDestination}
          />

          <CustomerDestinationFormDialog
            open={destinationDialogOpen}
            onClose={() => setDestinationDialogOpen(false)}
            onSave={handleSaveDestination}
            initialData={editingDestination}
            customers={customers}
          />
        </div>
      )}

      {activeTab === "finalPricing" && loadingFinalPricing && (
        <PageSkeleton hasButton columns={4} />
      )}

      {activeTab === "finalPricing" && !loadingFinalPricing && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Accounts-adjusted hire amounts used for Driver Batta calculation.
            </p>
            <button
              type="button"
              onClick={() => { setEditingFinalPricing(null); setFinalPricingDialogOpen(true); }}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Final Pricing
            </button>
          </div>

          {finalPricing.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
              No final pricing entries yet. Click &ldquo;Add Final Pricing&rdquo; to create one.
            </div>
          ) : (
            <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
              <table className="w-full min-w-[700px] text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Customer Name</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Actual Hire Amount (₹)</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Hire Amount as per Accounts (₹)</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {finalPricing.map((entry) => {
                    const customer = customers.find((c) => c.id === entry.customerId);
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{customer?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {entry.actualHireAmount ? `₹${parseFloat(entry.actualHireAmount).toLocaleString("en-IN")}` : "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-blue-700">
                          {entry.accountsHireAmount ? `₹${parseFloat(entry.accountsHireAmount).toLocaleString("en-IN")}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { setEditingFinalPricing(entry); setFinalPricingDialogOpen(true); }}
                              className="rounded p-1 text-blue-600 hover:bg-blue-50"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFinalPricing(entry.id)}
                              className="rounded p-1 text-red-500 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <FinalCustomerPricingFormDialog
            open={finalPricingDialogOpen}
            onClose={() => { setFinalPricingDialogOpen(false); setEditingFinalPricing(null); }}
            onSave={handleSaveFinalPricing}
            initialData={editingFinalPricing}
            customers={customers}
          />
        </div>
      )}

      {/* Edit approval request dialog — shown when Staff clicks Edit/Delete without active approval */}
      {pendingAction && (
        <EditRequestDialog
          open={editRequestOpen}
          resourceType="Customer"
          resourceName={pendingAction.resourceName}
          action={pendingAction.type}
          onSubmit={handleEditRequestSubmit}
          onClose={() => { setEditRequestOpen(false); setPendingAction(null); }}
        />
      )}
    </div>
  );
}
