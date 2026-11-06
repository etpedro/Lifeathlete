import { DragonflySection } from "./DragonflySection";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { PillarsSection } from "./PillarsSection";
import { SeeIt } from "./SeeIt";
import styles from "./landing.module.css";

/** The public front page: static, no session, no client code of its own. */
export function Landing() {
  return (
    <div className={styles.page}>
      <LandingHeader />
      <main>
        <Hero />
        <PillarsSection />
        <HowItWorks />
        <SeeIt />
        <DragonflySection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
