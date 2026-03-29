import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'DevDash',
  tagline: 'Your developer dashboard — PRs, tickets, and metrics in one place.',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
  },

  url: 'https://devdash.iwonderdesigns.com',
  baseUrl: '/',

  organizationName: 'kshehadeh',
  projectName: 'devdash',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/kshehadeh/devdash/tree/main/help-site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'DevDash',
      logo: {
        alt: 'DevDash',
        src: 'img/icon-black.png',
        srcDark: 'img/icon-white.png',
        width: 28,
        height: 28,
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'helpSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/kshehadeh/devdash',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Help',
          items: [
            {label: 'Getting Started', to: '/docs/intro'},
            {label: 'Dashboard', to: '/docs/features/dashboard'},
            {label: 'Notifications', to: '/docs/features/notifications'},
            {label: 'Reminders', to: '/docs/features/reminders'},
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/kshehadeh/devdash',
            },
            {
              label: 'Releases',
              href: 'https://github.com/kshehadeh/devdash/releases',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} DevDash. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
