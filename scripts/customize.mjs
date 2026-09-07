import { doctor, readConfiguration, synchronizeConfiguration } from './customize-config.mjs';

try {
  const args = process.argv.slice(2);
  if (args.includes('--apply')) {
    const changed = synchronizeConfiguration(readConfiguration());
    console.log(changed.length ? 'Identidade e metadados sincronizados.' : 'Identidade e metadados já estão sincronizados.');
  } else if (args.includes('--doctor')) {
    const result = doctor();
    for (const check of result.checks) console.log(`${check.ok ? 'OK' : 'PENDENTE'} — ${check.label}`);
    if (result.installer) console.log(`Instalador: ${result.installer}`);
    process.exitCode = result.ok ? 0 : 1;
  } else if (args.some((arg) => arg !== '--no-open')) {
    throw new Error('Opção desconhecida. Use --apply, --doctor ou --no-open.');
  } else {
    const { startCustomizer } = await import('./customize-server.mjs');
    const { address } = await startCustomizer({ openBrowser: !args.includes('--no-open') });
    console.log(`Personalizador disponível em ${address}. Para encerrar, pressione Ctrl+C.`);
  }
} catch (error) {
  console.error(`Não foi possível concluir: ${error.message}`);
  process.exitCode = 1;
}
