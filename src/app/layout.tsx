import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AvatarNotice } from "../components/AvatarNotice";
import "./globals.css";

export const metadata: Metadata = {
  title: "V-Tina",
  description:
    "A virtual AI avatar answering questions about Oregon executive policy, with every claim traceable to its official source.",
};

/**
 * Every page sits between the two avatar notices. The body is exactly the height of
 * the viewport and only `main` scrolls, so the notices are never scrolled away or
 * covered by the transcript, whatever its length (`reviews/chat-screen.md`, R1).
 */
export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-dvh flex-col">
        <AvatarNotice position="top" />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <AvatarNotice position="bottom" />
      </body>
    </html>
  );
}
