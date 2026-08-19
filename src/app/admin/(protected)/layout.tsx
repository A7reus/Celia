import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return <div className="space-y-6">{children}</div>;
}
