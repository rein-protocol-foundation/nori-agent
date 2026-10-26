import { run, upstream, requireSource, root, environment } from './runtime-env.mjs';
import { loadMagpieGatewayEnvironment } from './magpie-gateway-env.mjs';
import { loadBackendEnvironment } from './backend-env.mjs';
import { runProjectGatewayCommand } from './project-gateway.mjs';
requireSource();
const args = process.argv.slice(2);
const loadEnvironment = () => loadMagpieGatewayEnvironment({ root,
  environment: loadBackendEnvironment({ root, environment: environment() }) });
const local = await runProjectGatewayCommand(args, { root, environment: environment(), loadEnvironment });
if (local === null) run('pnpm', ['openclaw', ...args], upstream, loadEnvironment());
else process.exitCode = local;
