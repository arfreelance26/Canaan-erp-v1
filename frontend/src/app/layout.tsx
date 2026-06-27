import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { TyreInventoryProvider } from "@/context/TyreInventoryContext";
import { TripWorkflowProvider } from "@/context/TripWorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import { UppercaseInputs } from "@/components/ui/UppercaseInputs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Canaan Global - Fleet Management ERP",
  description: "Fleet and logistics ERP for Canaan Global International",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-mesh-light font-sans text-gray-900">
        <UppercaseInputs />
        <AuthProvider>
          <TripWorkflowProvider>
            <TyreInventoryProvider>
              <AppShell>{children}</AppShell>
            </TyreInventoryProvider>
          </TripWorkflowProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
