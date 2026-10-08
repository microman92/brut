import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

const api = process.env.API_URL ?? "http://127.0.0.1:4000";
const links = [
  ["Записи", "/admin"],
  ["Аналитика", "/admin/analytics"],
  ["Услуги", "/admin/services"],
  ["Мастера", "/admin/barbers"],
  ["Отзывы", "/admin/reviews"],
  ["Настройки", "/admin/settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("brut_admin")?.value;
  if (!token) redirect("/admin/login");
  const me = await fetch(`${api}/api/v1/admin/me`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!me?.ok) redirect("/admin/login");
  return (
    <div className="admin">
      <header className="admin-head">
        <Link className="brand" href="/admin">BRUT<span>.</span></Link>
        <nav className="admin-nav">
          {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <form action="/api/admin/logout" method="post"><button type="submit">Выйти</button></form>
      </header>
      {children}
    </div>
  );
}
