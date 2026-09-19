import { pageUser } from "@/lib/auth";
import { snapshot } from "@/lib/data";
import { dashboard } from "@/lib/view";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await pageUser();
  return <Dashboard initial={dashboard(await snapshot(), user)} />;
}
