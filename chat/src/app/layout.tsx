import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tarka Chat",
  description: "A simple conversation with models hosted by Tarka.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
