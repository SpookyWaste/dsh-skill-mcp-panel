/**
 * dsh-panel CLI —— 交互确认的唯一实现（skill 与 mcp 两个子命令共用同一次抽取）。
 *
 * 非交互 stdin（管道、CI、已关闭的继承 stdin）下不猜测意图：直接响亮失败，
 * 要求调用方显式加 `--yes`。此前两个子命令各复制了一份 readline 版本，在这种
 * 场合会把提示打印出来、promise 永远不 settle、事件循环随即清空、进程以 0
 * 退出——删除或迁移都没发生，脚本却以为成功了。
 */
import { createInterface } from "node:readline";
/**
 * 询问一个 y/N 问题。
 *
 * @param question - 提示语（含 "(y/N)"），原样写到 stdout。
 * @returns 用户回答 y/yes 时为 true，其余（含空回车）为 false。
 * @throws 标准输入不是终端、或回答被 EOF 中断时抛错——调用方应改为显式 `--yes`。
 */
export async function confirm(question) {
    if (process.stdin.isTTY !== true) {
        throw new Error("需要确认，但标准输入不是终端：请在非交互环境里显式加 --yes");
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await new Promise((resolvePromise, rejectPromise) => {
            rl.question(question, (value) => resolvePromise(value.trim().toLowerCase()));
            rl.once("close", () => rejectPromise(new Error("确认输入被中断：请在非交互环境里显式加 --yes")));
        });
        return answer === "y" || answer === "yes";
    }
    finally {
        rl.close();
    }
}
