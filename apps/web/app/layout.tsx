import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/oswald";
import "./globals.css";

export const metadata: Metadata = {
  title: "BRUT — барбершоп в Ташкенте",
  description: "BRUT — барбершоп в Ташкенте. Мужские стрижки, оформление бороды и шесть мастеров.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
