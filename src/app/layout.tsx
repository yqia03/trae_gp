import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "就地取材",
  description: "把家里已有的，变成今天用得上的。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
