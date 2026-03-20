import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./components/layout/Sidebar";

export const metadata: Metadata = {
  title: "DevDash",
  description: "Developer productivity dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">{children}</div>
      </body>
    </html>
  );
}
