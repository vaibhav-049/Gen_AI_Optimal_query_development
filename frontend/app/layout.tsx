import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QueryAI — Gen AI Optimal Query Development",
  description:
    "AI-powered SQL query assistant with DDL/DML/DCL analysis, time complexity estimation, row prediction, and optimization suggestions powered by Google Gemini.",
  keywords: "SQL, AI, query optimization, DBMS, database, Gemini AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
