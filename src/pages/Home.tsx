import { HeroSection } from '../components/HeroSection';
import { FeaturePillars } from '../components/FeaturePillars';
import { ExploreCards } from '../components/ExploreCards';

export function Home({ onWatchIntro }: { onWatchIntro: () => void }) {
  return (
    <>
      <HeroSection onWatchIntro={onWatchIntro} />
      <FeaturePillars />
      <ExploreCards />
    </>
  );
}
