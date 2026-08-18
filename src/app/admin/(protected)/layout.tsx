import { requireAdmin } from "@/lib/auth";

export default async function ProtectedLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return <>{children}</>;
}
