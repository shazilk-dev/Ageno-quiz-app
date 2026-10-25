import SiteFrame from "@/components/layout/SiteFrame";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteFrame>{children}</SiteFrame>;
}
