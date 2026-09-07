import { describe, expect, it } from 'vitest';
import { defaultConfig, effectiveCapabilities } from '../src/main/config.js';
import { CAPABILITIES, DEFAULT_CAPABILITIES, WRITE_CAPABILITIES } from '../src/shared/types.js';
import { securityPreset, securityProfileFor } from '../src/shared/security-profiles.js';

describe('perfis de segurança', () => {
  it('STRICT corresponde à configuração inicial conservadora', () => {
    const config = defaultConfig();
    expect(securityProfileFor(config)).toBe('strict');
    expect(securityPreset('strict')).toEqual({ capabilities: DEFAULT_CAPABILITIES, readOnly: true });
  });

  it('BALANCED habilita somente operações nos projetos aprovados', () => {
    const preset = securityPreset('balanced')!;
    expect(preset.readOnly).toBe(false);
    expect(preset.capabilities).toEqual({ ...DEFAULT_CAPABILITIES, create: true, edit: true, move: true, deleteFile: true });
    expect(securityProfileFor(preset)).toBe('balanced');
  });

  it('POWER USER é uma concessão explícita e não altera o padrão global', () => {
    const preset = securityPreset('power-user')!;
    expect(CAPABILITIES.every(capability => preset.capabilities[capability])).toBe(true);
    expect(preset.readOnly).toBe(false);
    expect(securityProfileFor(preset)).toBe('power-user');
    expect(defaultConfig().capabilities).toEqual(DEFAULT_CAPABILITIES);
  });

  it('CUSTOM não amplia acesso e ajustes individuais são identificados', () => {
    expect(securityPreset('custom')).toBeNull();
    const config = defaultConfig();
    config.capabilities.clipboardRead = true;
    expect(securityProfileFor(config)).toBe('custom');
  });

  it('somente leitura mantém os guardas efetivos mesmo com permissões armazenadas', () => {
    const preset = securityPreset('power-user')!;
    const effective = effectiveCapabilities({ ...defaultConfig(), ...preset, readOnly: true });
    for (const capability of WRITE_CAPABILITIES) expect(effective[capability], capability).toBe(false);
    expect(effective.read).toBe(true);
  });

  it('cada aplicação recebe uma cópia independente das permissões', () => {
    const first = securityPreset('strict')!;
    first.capabilities.command = true;
    expect(securityPreset('strict')!.capabilities.command).toBe(false);
  });
});
