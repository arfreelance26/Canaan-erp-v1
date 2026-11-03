import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/index.css";
import { AppShell } from "@/components/layout/AppShell";
import { TyreInventoryProvider } from "@/context/TyreInventoryContext";
import { TripWorkflowProvider } from "@/context/TripWorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { BirthdayProvider } from "@/context/BirthdayContext";
import { SeasonProvider } from "@/context/SeasonContext";
import { FoundingProvider } from "@/context/FoundingContext";
import { UppercaseInputs } from "@/components/ui/UppercaseInputs";
import { NoScrollNumberInputs } from "@/components/ui/NoScrollNumberInputs";
import { ChatProvider } from "@/context/ChatContext";
import { Toaster } from "@/components/feedback/Toaster";
import { ConfirmHost } from "@/components/feedback/ConfirmHost";
import { ProblemCardHost } from "@/components/feedback/ProblemCardHost";
import { IconHoverMotion } from "@/components/ui/IconHoverMotion";

// Inter is BoardUI's interface face (styles/theme.css reads --font-inter);
// JetBrains Mono backs `font-mono` for figures, IDs and codes.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono-source",
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
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Apply saved theme + font size before first paint to avoid a flash of
          the wrong theme (FOUC). Mirrors the keys used by ThemeContext.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('erp_theme');var login=/\\/login(\\/|\\/index\\.html)?$/.test(location.pathname);if(t!=='light'&&!login){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}var f=parseFloat(localStorage.getItem('erp_font_scale'));if([0.9,1,1.1,1.2,1.3].indexOf(f)>-1){document.documentElement.style.fontSize=(f*100)+'%';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="h-full bg-mesh-light font-sans text-text-primary">
        <UppercaseInputs />
        <NoScrollNumberInputs />
        <IconHoverMotion />
        <Toaster />
        <ConfirmHost />
        <ProblemCardHost />
        <ThemeProvider>
        <AuthProvider>
          <WebSocketProvider>
            <NotificationProvider>
              <BirthdayProvider>
              <SeasonProvider>
              <FoundingProvider>
              <TripWorkflowProvider>
                <TyreInventoryProvider>
                  <ChatProvider>
                    <AppShell>{children}</AppShell>
                  </ChatProvider>
                </TyreInventoryProvider>
              </TripWorkflowProvider>
              </FoundingProvider>
              </SeasonProvider>
              </BirthdayProvider>
            </NotificationProvider>
          </WebSocketProvider>
        </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
