import { pageUser } from "@/lib/auth";
import { snapshot } from "@/lib/data";
import { Admin } from "@/components/admin";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const user = await pageUser(true);
  return (
    <Admin
      initial={await snapshot()}
      user={user}
      initialNow={new Date().getTime()}
    />
  );
}
