import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
export default async function Login() {
  if (await currentUser()) redirect("/");
  return <LoginForm />;
}
