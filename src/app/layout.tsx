import type { Metadata } from "next";
import "./globals.css";
import { clsx } from "clsx";

export const metadata: Metadata = {
  title: "Auction 45",
  description: "Play Auction 45 online with friends"
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={clsx("min-h-screen antialiased")}>
        <div className="mx-auto max-w-6xl p-4 md:p-8">{props.children}</div>
      </body>
    </html>
  );
}

