import SiteFrame from "@/components/layout/SiteFrame";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteFrame>{children}</SiteFrame>;
}
