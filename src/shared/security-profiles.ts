import { CAPABILITIES, DEFAULT_CAPABILITIES, type Capabilities, type Config } from './types.js';

export const SECURITY_PROFILES = ['strict', 'balanced', 'power-user', 'custom'] as const;
export type SecurityProfile = (typeof SECURITY_PROFILES)[number];
export type SecurityPermissions = Pick<Config, 'capabilities' | 'readOnly'>;

export const SECURITY_PROFILE_LABELS: Record<SecurityProfile, string> = {
  strict: 'STRICT — recomendado',
  balanced: 'BALANCED — edição de projetos',
  'power-user': 'POWER USER — acesso amplo',
  custom: 'CUSTOM — personalizado'
};

export const SECURITY_PROFILE_DETAILS: Record<SecurityProfile, string> = {
  strict: 'Somente leitura nos projetos que você aprovar. Escrita, comandos, tela, mouse, teclado e área de transferência desativados.',
  balanced: 'Permite ler, criar, editar, mover e excluir arquivos dos projetos aprovados. Comandos e acesso ao computador continuam desativados.',
  'power-user': 'Ativa todas as permissões, incluindo comandos, tela, mouse, teclado e área de transferência. Comandos e controle usam o acesso real da sua conta no computador.',
  custom: 'Escolha cada permissão abaixo. Nenhum acesso é ampliado apenas por selecionar CUSTOM.'
};

/** Perfis aplicam os mesmos campos consumidos pelos guardas; não existe uma autorização paralela. */
export function securityPreset(profile: SecurityProfile): SecurityPermissions | null {
  if (profile === 'strict') return { capabilities: { ...DEFAULT_CAPABILITIES }, readOnly: true };
  if (profile === 'balanced') return {
    capabilities: { ...DEFAULT_CAPABILITIES, create: true, edit: true, move: true, deleteFile: true },
    readOnly: false
  };
  if (profile === 'power-user') return {
    capabilities: Object.fromEntries(CAPABILITIES.map(capability => [capability, true])) as Capabilities,
    readOnly: false
  };
  return null;
}

export function securityProfileFor(config: SecurityPermissions): SecurityProfile {
  for (const profile of SECURITY_PROFILES) {
    const preset = securityPreset(profile);
    if (preset && preset.readOnly === config.readOnly &&
        CAPABILITIES.every(capability => preset.capabilities[capability] === config.capabilities[capability])) return profile;
  }
  return 'custom';
}
