import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { TyreInventoryProvider } from "@/context/TyreInventoryContext";
import { TripWorkflowProvider } from "@/context/TripWorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { UppercaseInputs } from "@/components/ui/UppercaseInputs";
import { NoScrollNumberInputs } from "@/components/ui/NoScrollNumberInputs";
import { ChatProvider } from "@/context/ChatContext";

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
      suppressHydrationWarning
    >
      <head>
        {/*
          Apply saved theme + font size before first paint to avoid a flash of
          the wrong theme (FOUC). Mirrors the keys used by ThemeContext.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('erp_theme');if(t!=='light'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}var f=parseFloat(localStorage.getItem('erp_font_scale'));if([0.9,1,1.1,1.2,1.3].indexOf(f)>-1){document.documentElement.style.fontSize=(f*100)+'%';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="h-full bg-mesh-light font-sans text-gray-900">
        <UppercaseInputs />
        <NoScrollNumberInputs />
        <ThemeProvider>
        <AuthProvider>
          <WebSocketProvider>
            <NotificationProvider>
              <TripWorkflowProvider>
                <TyreInventoryProvider>
                  <ChatProvider>
                    <AppShell>{children}</AppShell>
                  </ChatProvider>
                </TyreInventoryProvider>
              </TripWorkflowProvider>
            </NotificationProvider>
          </WebSocketProvider>
        </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
