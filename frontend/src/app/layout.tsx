import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { TyreInventoryProvider } from "@/context/TyreInventoryContext";
import { TripWorkflowProvider } from "@/context/TripWorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import { UppercaseInputs } from "@/components/ui/UppercaseInputs";
import { NoScrollNumberInputs } from "@/components/ui/NoScrollNumberInputs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="h-full bg-mesh-light font-sans text-gray-900">
        <UppercaseInputs />
        <NoScrollNumberInputs />
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
