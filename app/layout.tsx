import type { Metadata } from "next";
import "./globals.css";
import "./shell.css";

export const metadata: Metadata = {
  title: "DRISHTI-X | PS 26071",
  description: "AI/ML integrated heavy rainfall early warning and inundation prediction command center.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}