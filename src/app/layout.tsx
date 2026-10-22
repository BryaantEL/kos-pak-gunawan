import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kos Pak Gunawan',
  description: 'Dashboard pengelolaan kos',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Hanya halaman yang sudah berfungsi yang ditampilkan di navigasi.
const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/rooms', label: 'Data Kamar' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link href="/" className="brand">Kos Pak Gunawan</Link>
            <nav className="nav" aria-label="Menu utama">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
