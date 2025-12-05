'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { getNavItemClassName as getNavItemClass } from './sidebarUtils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  external?: boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

// Icons
const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const ProvidersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const ProjectsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const ApiKeysIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);

const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const MembersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const UsageIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const GitHubIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

const DocsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);


// Navigation sections with groupings
const navSections: NavSection[] = [
  {
    // Main section - no label
    items: [
      { name: 'Dashboard', href: '/', icon: <DashboardIcon /> },
      { name: 'Providers', href: '/providers', icon: <ProvidersIcon /> },
      { name: 'Projects', href: '/projects', icon: <ProjectsIcon /> },
      { name: 'API Keys', href: '/api-keys', icon: <ApiKeysIcon /> },
      { name: 'Models', href: '/models', icon: <ModelsIcon /> },
    ],
  },
  {
    label: 'TEAM',
    items: [
      { name: 'General', href: '/settings', icon: <SettingsIcon /> },
      { name: 'Members', href: '/members', icon: <MembersIcon /> },
    ],
  },
  {
    label: 'BILLING',
    items: [
      { name: 'Usage', href: '/usage', icon: <UsageIcon /> },
    ],
  },
];

const externalLinks: NavItem[] = [
  { name: 'GitHub', href: 'https://github.com', icon: <GitHubIcon />, external: true },
  { name: 'Documentation', href: 'https://docs.example.com', icon: <DocsIcon />, external: true },
];

interface Team {
  id: string;
  name: string;
}

interface SidebarProps {
  teams?: Team[];
  currentTeamId?: string;
  onTeamChange?: (teamId: string) => void;
}

export default function Sidebar({ teams = [], currentTeamId, onTeamChange }: SidebarProps) {
  const pathname = usePathname();
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const currentTeam = teams.find(t => t.id === currentTeamId) || teams[0];

  return (
    <aside className="w-60 h-screen bg-background-secondary border-r border-border-subtle flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-background" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-base font-semibold text-text-primary">LLM Gateway</span>
        </div>
      </div>

      {/* Team Selector */}
      <div className="px-3 py-3 border-b border-border-subtle">
        <label className="block text-label uppercase text-text-muted mb-2 px-1">Team</label>
        <button
          onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-transparent border border-border rounded-button text-sm text-text-primary hover:bg-panel-hover transition-colors"
        >
          <span>{currentTeam?.name || 'Select team'}</span>
          <ChevronDownIcon />
        </button>
        {isTeamDropdownOpen && teams.length > 0 && (
          <div className="absolute mt-1 w-52 bg-panel border border-border rounded-button shadow-lg z-10">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => {
                  onTeamChange?.(team.id);
                  setIsTeamDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-panel-hover transition-colors ${
                  team.id === currentTeamId ? 'text-accent' : 'text-text-primary'
                }`}
              >
                {team.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Navigation */}
      <div className="px-3 py-3 border-b border-border-subtle">
        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-panel-hover rounded-button transition-colors">
          <SearchIcon />
          <span>Go to</span>
          <span className="ml-auto text-xs text-text-muted bg-panel px-1.5 py-0.5 rounded">Ctrl+K</span>
        </button>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {navSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className={sectionIndex > 0 ? 'mt-4' : ''}>
            {section.label && (
              <div className="px-3 py-2 text-label uppercase text-text-muted tracking-wide">
                {section.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={getNavItemClass(item.href, pathname)}
                  >
                    {item.icon}
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* External Links */}
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <ul className="space-y-0.5">
            {externalLinks.map((item) => (
              <li key={item.name}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2 rounded-button text-sm text-text-secondary hover:bg-panel-hover hover:text-text-primary transition-colors"
                >
                  {item.icon}
                  {item.name}
                  <ExternalLinkIcon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border-subtle">
        <button className="text-sm text-text-secondary hover:text-text-primary transition-colors">
          Feedback
        </button>
      </div>
    </aside>
  );
}


