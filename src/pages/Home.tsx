import { HeroSection } from '../components/HeroSection';
import { FeaturePillars } from '../components/FeaturePillars';
import { ExploreCards } from '../components/ExploreCards';
import { FounderNote } from '../components/FounderNote';
import { Foundation } from '../components/Foundation';
import { YouTubeTile } from '../components/YouTubeTile';

export function Home({ onWatchIntro }: { onWatchIntro: () => void }) {
  return (
    <>
      <HeroSection onWatchIntro={onWatchIntro} />
      <FeaturePillars />
      <ExploreCards />
      <YouTubeTile />
      <FounderNote />
      <Foundation />
    </>
  );
}
