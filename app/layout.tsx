import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PEBISNIS DIGITAL TELEGRAM",
  description: "Ruang kontrol PEBISNIS DIGITAL TELEGRAM",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
