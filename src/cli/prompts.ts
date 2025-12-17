import inquirer from "inquirer";
import type { SqliteStore } from "../db.js";

export async function promptUserLogin(): Promise<string> {
  while (true) {
    const ans = await inquirer.prompt<{ userLogin: string }>([
      {
        type: "input",
        name: "userLogin",
        message: "Login:",
      },
    ]);
    const userLogin = (ans.userLogin ?? "").trim();
    if (userLogin.length) return userLogin;
    console.log("\nPor favor informe seu login para continuar.");
  }
}

export async function promptSessionMenu(
  store: SqliteStore,
  userId: number
): Promise<{ sessionId: number | null }> {
  const sessions = store.listSessions(userId);
  const options: Array<{ name: string; value: number | "new" }> = [
    { name: "💬 Nova conversa", value: "new" },
    ...sessions.map((s) => {
      return {
        name: `ID ${s.id} - ${s.firstMessage} - ${s.updatedAt}`,
        value: s.id,
      };
    }),
  ];

  const ans = await inquirer.prompt<{ pick: number | "new" }>([
    {
      type: "list",
      name: "pick",
      message: "Selecione uma conversa ou crie uma nova:",
      choices: options,
    },
  ]);

  if (ans.pick === "new") return { sessionId: null };
  return { sessionId: ans.pick };
}

