"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { topNavItems } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

export function TopNav() {
  const pathname = usePathname();

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-6">
      {topNavItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "text-blue-600"
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            {item.label}
            {item.hasDropdown && <ChevronDown className="h-3.5 w-3.5" />}
          </Link>
        );
      })}
    </div>
  );
}
