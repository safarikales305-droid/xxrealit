import "./globals.css";

export const metadata = {
  title: "XXREALIT",
  description: "Realitni platforma nove generace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
