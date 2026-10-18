import Backdrop from "@/components/site/backdrop";
import MotionKit from "@/components/site/motion-kit";
import SiteFooter from "@/components/site/site-footer";
import SiteHeader from "@/components/site/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Backdrop />
      <MotionKit />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
