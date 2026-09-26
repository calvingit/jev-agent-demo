import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev Feasibility Lab",
  description:
    "加 Jev 与不加 Jev 对照实验：Jev 作为客服场景中推理模型之前的快速语义判断层是否值得。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
