"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { CustomerPricingTable } from "@/components/customers/CustomerPricingTable";
import { CustomerPricingFormDialog } from "@/components/customers/CustomerPricingFormDialog";
import { CustomerDestinationTable } from "@/components/customers/CustomerDestinationTable";
import { CustomerDestinationFormDialog } from "@/components/customers/CustomerDestinationFormDialog";
import { customersApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { CustomerDestination } from "@/types/customer-destination";

const TABS = [
  { id: "list", label: "Customer List" },
  { id: "pricing", label: "Our Customer Pricing" },
  { id: "destinations", label: "Our Customer Destinations" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CustomersPage() {
  const [activeTab, setActiveTab] = useState<TabId>("list");
  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [pricing, setPricing] = useState<CustomerPricing[]>([]);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  const [editingPricing, setEditingPricing] = useState<CustomerPricing | null>(null);

  const [destinations, setDestinations] = useState<CustomerDestination[]>([]);
  const [destinationDialogOpen, setDestinationDialogOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState<CustomerDestination | null>(null);

  useEffect(() => {
    customersApi.list().then(setCustomers).finally(() => setLoading(false));
  }, []);

  // Load pricing and destinations lazily when tab is opened
  useEffect(() => {
    if (activeTab === "pricing" && customers.length > 0 && pricing.length === 0) {
      Promise.all(customers.map((c) => customersApi.listPricing(c.id))).then((results) =>
        setPricing(results.flat())
      );
    }
    if (activeTab === "destinations" && customers.length > 0 && destinations.length === 0) {
      Promise.all(customers.map((c) => customersApi.listDestinations(c.id))).then((results) =>
        setDestinations(results.flat())
      );
    }
  }, [activeTab, customers, pricing.length, destinations.length]);

  function handleAddCustomer() {
    setEditingCustomer(null);
    setCustomerDialogOpen(true);
  }

  function handleEditCustomer(customer: Customer) {
    setEditingCustomer(customer);
    setCustomerDialogOpen(true);
  }

  async function handleDeleteCustomer(id: string) {
    if (!confirm("Delete this customer?")) return;
    await customersApi.delete(id);
    setCustomers((prev) => prev.filter((customer) => customer.id !== id));
  }

  async function handleSaveCustomer(customer: Customer) {
    const exists = customers.some((existing) => existing.id === customer.id);
    if (exists) {
      const updated = await customersApi.update(customer.id, customer);
      setCustomers((prev) => prev.map((existing) => (existing.id === customer.id ? updated : existing)));
    } else {
      const created = await customersApi.create(customer);
      setCustomers((prev) => [...prev, created]);
    }
    setCustomerDialogOpen(false);
  }

  function handleAddPricing() {
    setEditingPricing(null);
    setPricingDialogOpen(true);
  }

  function handleEditPricing(entry: CustomerPricing) {
    setEditingPricing(entry);
    setPricingDialogOpen(true);
  }

  async function handleDeletePricing(id: string) {
    if (!confirm("Delete this pricing entry?")) return;
    const entry = pricing.find((p) => p.id === id);
    if (!entry) return;
    await customersApi.deletePricing(entry.customerId, id);
    setPricing((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSavePricing(entry: CustomerPricing) {
    const exists = pricing.some((existing) => existing.id === entry.id);
    if (exists) {
      const updated = await customersApi.updatePricing(entry.customerId, entry.id, entry);
      setPricing((prev) => prev.map((existing) => (existing.id === entry.id ? updated : existing)));
    } else {
      const created = await customersApi.createPricing(entry.customerId, entry);
      setPricing((prev) => [...prev, created]);
    }
    setPricingDialogOpen(false);
  }

  function handleAddDestination() {
    setEditingDestination(null);
    setDestinationDialogOpen(true);
  }

  function handleEditDestination(entry: CustomerDestination) {
    setEditingDestination(entry);
    setDestinationDialogOpen(true);
  }

  async function handleDeleteDestination(id: string) {
    if (!confirm("Delete this destination?")) return;
    const entry = destinations.find((d) => d.id === id);
    if (!entry) return;
    await customersApi.deleteDestination(entry.customerId, id);
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSaveDestination(entry: CustomerDestination) {
    const exists = destinations.some((existing) => existing.id === entry.id);
    if (exists) {
      const updated = await customersApi.updateDestination(entry.customerId, entry.id, entry);
      setDestinations((prev) => prev.map((existing) => (existing.id === entry.id ? updated : existing)));
    } else {
      const created = await customersApi.createDestination(entry.customerId, entry);
      setDestinations((prev) => [...prev, created]);
    }
    setDestinationDialogOpen(false);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Our Customers</h1>
        <p className="mt-1 text-sm text-gray-500">Manage customer records, pricing, and destinations</p>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200">
        {TABS.map((tab) => (
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
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleAddCustomer}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Customer
            </button>
          </div>

          <CustomerTable customers={customers} onEdit={handleEditCustomer} onDelete={handleDeleteCustomer} />

          <CustomerFormDialog
            open={customerDialogOpen}
            onClose={() => setCustomerDialogOpen(false)}
            onSave={handleSaveCustomer}
            initialData={editingCustomer}
          />
        </div>
      )}

      {activeTab === "pricing" && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="flex items-center justify-end">
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
            pricing={pricing}
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
            existingPricing={pricing}
          />
        </div>
      )}

      {activeTab === "destinations" && (
        <div className="animate-stagger flex flex-col gap-6">
          <div className="flex items-center justify-end">
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
            destinations={destinations}
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
    </div>
  );
}
