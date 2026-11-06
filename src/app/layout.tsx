import type { ReactNode } from "react";

export const metadata = { title: "Lifeathlete" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
