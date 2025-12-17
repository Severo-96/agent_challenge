import "./config.js";
import { runCli } from "./cli/index.js";

async function main(): Promise<void> {
  await runCli();
}

main().catch((err) => {
  console.error(`\n❌ Erro: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});


