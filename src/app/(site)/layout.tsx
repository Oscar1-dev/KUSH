import FoilTracker from "@/components/site/foil-tracker";
import SiteFooter from "@/components/site/site-footer";
import SiteHeader from "@/components/site/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FoilTracker />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
