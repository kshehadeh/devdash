import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

function HeroSection() {
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <div className={styles.heroEyebrow}>For macOS developers</div>
        <Heading as="h1" className={styles.heroTitle}>
          Your engineering context,<br />always within reach
        </Heading>
        <p className={styles.heroSubtitle}>
          DevDash is a macOS dashboard that unifies your open pull requests, Jira and Linear tickets,
          code metrics, and review queue — so you spend less time hunting for context and more time shipping.
        </p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            Get started →
          </Link>
          <Link
            className="button button--secondary button--lg"
            href="https://github.com/kshehadeh/devdash/releases">
            Download for macOS
          </Link>
        </div>
      </div>
    </header>
  );
}

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
  link: string;
}

const features: FeatureItem[] = [
  {
    icon: '📊',
    title: 'Engineering dashboard',
    description:
      'Velocity, merge ratio, review turnaround, and workload health — computed from your real GitHub and Jira/Linear data, for any lookback period you choose.',
    link: '/docs/features/dashboard',
  },
  {
    icon: '☀️',
    title: 'My Day',
    description:
      'Start every morning with a focused view of PRs waiting on your review, tickets in progress, triggered reminders, and unread notifications — all in one place.',
    link: '/docs/features/my-day',
  },
  {
    icon: '🔍',
    title: 'Review queue',
    description:
      'See exactly which PRs are requested of you and track review activity on your own open pull requests, with staleness warnings before things go cold.',
    link: '/docs/features/reviews',
  },
  {
    icon: '👥',
    title: 'Team overview',
    description:
      'A snapshot of every developer on your team — velocity, workload health, open PRs, and pending reviews — so you always know where the pressure is.',
    link: '/docs/features/team',
  },
  {
    icon: '🔔',
    title: 'Smart notifications',
    description:
      'Native desktop alerts for review requests, stale PRs, and ticket updates. Configurable per integration type with deduplication so your focus stays protected.',
    link: '/docs/features/notifications',
  },
  {
    icon: '⏰',
    title: 'Reminders',
    description:
      'Set a reminder on any PR, ticket, or doc from its context menu. Snooze, dismiss, or let it sync automatically to your macOS Reminders app.',
    link: '/docs/features/reminders',
  },
  {
    icon: '⌘',
    title: 'Command palette',
    description:
      'Press ⌘K to instantly search PRs, tickets, reminders, notifications, and navigation destinations without leaving the keyboard.',
    link: '/docs/features/command-palette',
  },
  {
    icon: '🖥️',
    title: 'Menu bar icon',
    description:
      'A compact popover in the macOS menu bar shows your open PRs and tickets sorted oldest to newest — no window-switching needed.',
    link: '/docs/features/menu-bar',
  },
];

interface IntegrationBadgeProps {
  name: string;
}

function IntegrationBadge({name}: IntegrationBadgeProps) {
  return <span className={styles.integrationBadge}>{name}</span>;
}

function FeatureCard({icon, title, description, link}: FeatureItem) {
  return (
    <Link to={link} className={styles.featureCard}>
      <div className={styles.featureIcon}>{icon}</div>
      <Heading as="h3" className={styles.featureTitle}>{title}</Heading>
      <p className={styles.featureDescription}>{description}</p>
      <span className={styles.featureLink}>Learn more →</span>
    </Link>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} — Developer Dashboard for macOS`}
      description={siteConfig.tagline}>
      <HeroSection />

      <main>
        {/* Integrations strip */}
        <section className={styles.integrationsStrip}>
          <div className="container">
            <p className={styles.integrationsLabel}>Connects with your existing tools</p>
            <div className={styles.integrationsBadges}>
              <IntegrationBadge name="GitHub" />
              <IntegrationBadge name="Jira" />
              <IntegrationBadge name="Linear" />
              <IntegrationBadge name="Confluence" />
              <IntegrationBadge name="macOS Reminders" />
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className={styles.featuresSection}>
          <div className="container">
            <Heading as="h2" className={styles.sectionHeading}>
              Everything you need to stay unblocked
            </Heading>
            <p className={styles.sectionSubheading}>
              DevDash runs quietly in the background, syncing your data so every view is always fresh.
            </p>
            <div className={styles.featuresGrid}>
              {features.map((f) => (
                <FeatureCard key={f.title} {...f} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.ctaSection}>
          <div className="container">
            <Heading as="h2" className={styles.ctaTitle}>Ready to reduce context switching?</Heading>
            <p className={styles.ctaSubtitle}>
              Download DevDash, connect your integrations, and get your dashboard running in under five minutes.
            </p>
            <div className={styles.buttons}>
              <Link className="button button--primary button--lg" to="/docs/intro">
                Read the setup guide
              </Link>
              <Link
                className="button button--secondary button--lg"
                href="https://github.com/kshehadeh/devdash/releases">
                Download latest release
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
