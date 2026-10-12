import { redirect } from "next/navigation";

// K-Meet and K-Audio are now one page, K-Connect.
export default function Page() {
  redirect("/dashboard/kconnect?mode=audio");
}
