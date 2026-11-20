import { storageDb } from "../lib/storageDb";
import type { ChatMessage } from "../types/cbshub";
import {
  compareMessages,
  projectMessage,
  validateOperation,
  type ChatOperation,
} from "./model";
class ChatLedger {
  private db: Promise<IDBDatabase> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private open() {
    if (!this.db)
      this.db = new Promise((resolve, reject) => {
        const req = indexedDB.open("cbshub_chat_ledger", 1);
        req.onupgradeneeded = () => {
          const s = req.result.createObjectStore("operations", {
            keyPath: "id",
          });
          s.createIndex("room", "roomId");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          this.db = null;
          reject(req.error);
        };
      });
    return this.db;
  }
  public async operations(room: string): Promise<ChatOperation[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = db
        .transaction("operations")
        .objectStore("operations")
        .index("room")
        .getAll(room);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task, task);
    this.chain = result.catch(() => {});
    return result;
  }
  private async write(ops: ChatOperation[]) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite");
      const store = tx.objectStore("operations");
      for (const op of ops) store.put(op);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  public record(room: string, incoming: ChatOperation[], actor: string) {
    return this.enqueue(async () => {
      const clean = incoming.map((op) => validateOperation(op, room, actor));
      if (clean.length > 100) throw new Error("Lote excessivo.");
      const existing = await this.operations(room);
      const seen = new Map(existing.map((o) => [o.id, o]));
      const additions = clean.filter((o) => !seen.has(o.id));
      if (existing.length + additions.length > 5000)
        throw new Error("Limite de alterações locais nesta sala atingido.");
      await this.write(additions);
      return this.refreshUnlocked(room);
    });
  }
  private async refreshUnlocked(room: string) {
    const ops = await this.operations(room);
    const messages = await storageDb.getMessagesByRoom(room);
    const grouped = new Map<string, ChatOperation[]>();
    for (const op of ops) {
      let group = grouped.get(op.messageId);
      if (!group) { group = []; grouped.set(op.messageId, group); }
      group.push(op);
    }
    const projected = messages.map((m) =>
      projectMessage(m, grouped.get(m.id) || []),
    );
    for (let i = 0; i < projected.length; i++)
      if (JSON.stringify(projected[i]) !== JSON.stringify(messages[i]))
        await storageDb.saveMessage(projected[i]);
    return projected.sort(compareMessages);
  }
  public acknowledge(room: string, id: string) {
    return this.enqueue(async () => {
      const all = await storageDb.getMessagesByRoom(room);
      const message = all.find((m) => m.id === id);
      if (message)
        await storageDb.saveMessage({ ...message, delivery: "received" });
      return this.refreshUnlocked(room);
    });
  }
  public refresh(room: string) {
    return this.enqueue(() => this.refreshUnlocked(room));
  }
  public mergeMessages(room: string, messages: ChatMessage[]) {
    return this.enqueue(async () => {
      const known = new Set(
        (await storageDb.getMessagesByRoom(room)).map((m) => m.id),
      );
      for (const m of messages)
        if (!known.has(m.id)) {
          await storageDb.saveMessage(m);
          known.add(m.id);
        }
      return this.refreshUnlocked(room);
    });
  }
}
export const chatLedger = new ChatLedger();
