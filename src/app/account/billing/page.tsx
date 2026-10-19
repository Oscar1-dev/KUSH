import { redirect } from "next/navigation";

// Orders & billing moved to /account/orders (Stripe returns there).
export default function Page() {
  redirect("/account/orders");
}
