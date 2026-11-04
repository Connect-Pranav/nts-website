import { InstagramLogo, LinkedinLogo } from '@phosphor-icons/react';
import { GlassButton } from '../components/GlassButton';
import { INSTITUTIONS } from '../content/blueprint';
import { SITE } from '../config';
import { Cards, PageHero, Section } from './parts';

export function Contact() {
  return (
    <>
      <PageHero eyebrow="Get started" title={<>Start where you <em>are</em></>} lead="Learner, college, company or creator: there is a way in for you. Message us on LinkedIn or Instagram and the founding team replies directly.">
        <GlassButton href={SITE.social.linkedin} external arrow icon={<LinkedinLogo size={20} />}>
          Message on LinkedIn
        </GlassButton>
        <GlassButton href={SITE.social.instagram} external variant="secondary" icon={<InstagramLogo size={20} />}>
          DM on Instagram
        </GlassButton>
      </PageHero>
      <Section id="partners" title={<>Partner with <em>us</em></>} lead="Institutions, companies and creators we work with.">
        <Cards items={INSTITUTIONS.map((i) => ({ title: i.title, text: i.offer }))} cols={3} />
      </Section>
    </>
  );
}
