import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TrendingUp, Droplets, Route, ArrowRight, ArrowDownRight, ArrowUpRight, IndianRupee } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { FuelLog, FuelStats } from "@/types/fuel-log";
import { fuelLogsApi } from "@/lib/api";
import { formatDate } from "@/lib/format-date";

type FuelHistoryViewDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

function StatCard({ title, value, icon: Icon, trend, subtitle }: any) {
  return (
    <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        <Icon className="w-4 h-4 text-blue-500" />
        {title}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {trend !== undefined && (
          <span className={`text-xs font-medium flex items-center ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
    </div>
  );
}

export function FuelHistoryViewDialog({ open, onClose, truck }: FuelHistoryViewDialogProps) {
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [stats, setStats] = useState<FuelStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && truck) {
      setLoading(true);
      Promise.all([
        fuelLogsApi.listFuelLogs(truck.id),
        fuelLogsApi.getFuelStats(truck.id),
      ])
        .then(([logsData, statsData]) => {
          setLogs(logsData);
          setStats(statsData);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [open, truck]);

  if (!truck) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Truck&apos;s Fuel History">
        <div className="mb-6">
            <p className="text-sm text-gray-500">
            {truck.registrationNumber} • {truck.modelName} • {truck.manufacturer}
            </p>
        </div>

        <div className="overflow-y-auto max-h-[70vh] space-y-6">
          {loading ? (
            <div className="py-20 text-center text-gray-500">Loading fuel history...</div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard
                  title="Current Interval"
                  value={`${Number(stats?.lastMileage).toFixed(2)} km/L`}
                  icon={Route}
                  trend={Number(stats?.trendPercentage)}
                  subtitle="Latest refill"
                />
                <StatCard
                  title="Lifetime Average"
                  value={`${Number(stats?.averageMileage).toFixed(2)} km/L`}
                  icon={TrendingUp}
                  subtitle={`Total: ${Number(stats?.totalDistance).toLocaleString()} km`}
                />
                <StatCard
                  title="Cost Per Kilometer"
                  value={`₹${Number(stats?.costPerKm).toFixed(2)}`}
                  icon={IndianRupee}
                  subtitle="Across all logged intervals"
                />
                <StatCard
                  title="Best Ever"
                  value={`${Number(stats?.bestMileage).toFixed(2)} km/L`}
                  icon={ArrowUpRight}
                />
                <StatCard
                  title="Worst Ever"
                  value={`${Number(stats?.worstMileage).toFixed(2)} km/L`}
                  icon={ArrowDownRight}
                />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-semibold text-gray-900">Calculated Mileage History</h3>
                </div>
                <div className="overflow-auto max-h-72">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-100">
                        <th className="px-6 py-3 font-medium">Refuel Date</th>
                        <th className="px-6 py-3 font-medium text-right">Odometer</th>
                        <th className="px-6 py-3 font-medium text-right">Fuel Filled</th>
                        <th className="px-6 py-3 font-medium text-right">Distance</th>
                        <th className="px-6 py-3 font-medium text-right">Interval Mileage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                            No fuel logs found for this truck.
                          </td>
                        </tr>
                      ) : (
                        logs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 text-gray-900">{formatDate(log.date)}</td>
                            <td className="px-6 py-4 text-right text-gray-600 font-medium">
                              {Number(log.odometer).toLocaleString()} km
                            </td>
                            <td className="px-6 py-4 text-right text-gray-600">
                              <span className="inline-flex items-center gap-1">
                                <Droplets className="w-3 h-3 text-blue-400" />
                                {Number(log.litres).toFixed(1)} L
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-600">
                              {Number(log.distance) > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  <ArrowRight className="w-3 h-3 text-gray-400" />
                                  {Number(log.distance).toLocaleString()} km
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Baseline</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {Number(log.mileage) > 0 ? (
                                <span className="font-semibold text-gray-900">
                                  {Number(log.mileage).toFixed(2)} km/L
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
    </Dialog>
  );
}
