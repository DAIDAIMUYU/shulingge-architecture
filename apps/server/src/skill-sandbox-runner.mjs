import process from "node:process";

function decodePayload(raw) {
  if (!raw) {
    throw new Error("Missing sandbox payload");
  }

  // 主进程通过 base64 传入执行参数，避免命令行转义问题。
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
}

async function main() {
  const payload = decodePayload(process.argv[2]);
  // 当前 V2.0 沙盒先提供受限子进程执行与结构化产物，避免直接在主进程拼装“伪执行”结果。
  const acceptedArgs = payload.args && typeof payload.args === "object" ? payload.args : {};
  const operationKeys = Object.keys(acceptedArgs);

  const result = {
    skillId: payload.skillId,
    executed: true,
    dryRun: false,
    sandbox: "v2-tool",
    summary: `Tool skill ${payload.skillId} executed in isolated V2 sandbox subprocess`,
    operations: operationKeys.length > 0 ? operationKeys.map((key) => `arg:${key}`) : ["tool:invoke"],
    artifacts: [
      {
        kind: "json",
        name: `${payload.skillId}-result.json`,
        content: {
          skillId: payload.skillId,
          acceptedArgs,
          sandboxedAt: new Date().toISOString(),
          runner: "skill-sandbox-runner",
        },
      },
    ],
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

await main();
