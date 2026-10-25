import type { Metadata } from "next";
import CodeRedirect from "./redirect";

export const metadata: Metadata = {
  title: "Quiz",
  description: "Take a quiz on Ageno Quiz.",
};

type PageProps = { params: Promise<{ code: string }> };

/** Legacy `/<accessCode>` links: resolved on the server, then forwarded to `/q/<id>`. */
export default async function Page({ params }: PageProps) {
  const { code } = await params;
  return <CodeRedirect code={code} />;
}
