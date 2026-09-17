import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import AppShell from "@/components/layout/AppShell";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nyagbadali — Système de Gestion Hospitalière",
  description: "Logiciel complet de gestion hospitalière : patients, consultations, pharmacie, laboratoire, facturation et plus.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <AuthProvider>
          <ConfirmProvider>
            <AppShell>{children}</AppShell>
            <Toaster 
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
              }}
            />
          </ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
