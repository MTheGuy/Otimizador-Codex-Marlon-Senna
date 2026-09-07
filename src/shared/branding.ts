import configuration from '../../customization/app.config.json';

export interface AppBranding {
  version: string;
  name: string;
  shortName: string;
  description: string;
  appId: string;
  packageName: string;
  executableName: string;
  installerPrefix: string;
  shortcutName: string;
  author: string;
  extensionName: string;
  extensionDescription: string;
  icon: string;
  logo: string;
  extensionIcon: string;
  homepageUrl: string;
  supportUrl: string;
  repositoryUrl: string;
  publication: { repository: string };
  theme: { accent: string };
}

export const BRANDING: Readonly<AppBranding> = Object.freeze(configuration);
