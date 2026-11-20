import { compareMessages } from "../chat/model";
import type { ChatMessage, SoundboardClip } from '../types/cbshub';

const DB_NAME = 'cbshub_local_db';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';
const STORE_CLIPS = 'soundboard_clips';
const MAX_MESSAGES_PER_ROOM = 500;
const MAX_CLIP_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

class StorageDb {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryMessages: Map<string, ChatMessage[]> = new Map();
  private memoryClips: Map<string, SoundboardClip> = new Map();

  private getDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;

    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[StorageDb] IndexedDB indisponível neste ambiente. Usando fallback em memória.');
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
            const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
            msgStore.createIndex('by_room_time', ['roomId', 'createdAt'], { unique: false });
          }

          if (!db.objectStoreNames.contains(STORE_CLIPS)) {
            db.createObjectStore(STORE_CLIPS, { keyPath: 'id' });
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = (err) => {
          console.warn('[StorageDb] Falha ao abrir IndexedDB, operando em memória:', err);
          resolve(null);
        };

        request.onblocked = () => {
          console.warn('[StorageDb] Abertura do IndexedDB bloqueada por outra aba.');
          resolve(null);
        };
      } catch (err) {
        console.warn('[StorageDb] Exceção ao abrir IndexedDB:', err);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  /* ========================================================================= */
  /* STORE: MESSAGES                                                           */
  /* ========================================================================= */

  public async requirePersistentStorage(): Promise<void> {
    if (!await this.getDb()) throw new Error('O armazenamento local está indisponível. A mensagem não foi enviada.');
  }

  public async saveMessage(msg: ChatMessage): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      const roomMsgs = this.memoryMessages.get(msg.roomId) || [];
      const updated = [...roomMsgs.filter((m) => m.id !== msg.id), msg].sort(compareMessages);
      if (updated.length > MAX_MESSAGES_PER_ROOM) updated.splice(0, updated.length - MAX_MESSAGES_PER_ROOM);
      this.memoryMessages.set(msg.roomId, updated);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = tx.objectStore(STORE_MESSAGES);
        store.put(msg);
        tx.oncomplete = () => {
          this.trimRoomMessages(msg.roomId).finally(resolve);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Gravação cancelada.'));
        tx.onabort = () => reject(tx.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  public async getMessagesByRoom(roomId: string, limit = MAX_MESSAGES_PER_ROOM): Promise<ChatMessage[]> {
    const db = await this.getDb();
    if (!db) {
      const list = this.memoryMessages.get(roomId) || [];
      return [...list].sort(compareMessages).slice(-limit);
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MESSAGES, 'readonly');
        const store = tx.objectStore(STORE_MESSAGES);
        const index = store.index('by_room_time');
        const range = IDBKeyRange.bound([roomId, 0], [roomId, Number.MAX_SAFE_INTEGER]);
        const result: ChatMessage[] = [];
        const request = index.openCursor(range, 'prev');
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor && result.length < Math.min(500, Math.max(1, limit))) {
            result.push(cursor.value as ChatMessage);
            cursor.continue();
          } else resolve(result.sort(compareMessages));
        };
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  public async saveMessageBatch(roomId: string, incomingMessages: ChatMessage[]): Promise<ChatMessage[]> {
    if (!incomingMessages || incomingMessages.length === 0) {
      return this.getMessagesByRoom(roomId);
    }

    const current = await this.getMessagesByRoom(roomId);
    const map = new Map<string, ChatMessage>();

    for (const msg of current) {
      map.set(msg.id, msg);
    }

    for (const msg of incomingMessages) {
      if (msg.roomId === roomId) {
        // Se a mensagem já existir, preserva reações mescladas
        const existing = map.get(msg.id);
        if (existing) {
          const mergedReactions = { ...existing.reactions };
          for (const [emoji, reaction] of Object.entries(msg.reactions || {})) {
            if (!mergedReactions[emoji]) {
              mergedReactions[emoji] = reaction;
            } else {
              const clientIds = Array.from(new Set([...mergedReactions[emoji].reactorClientIds, ...reaction.reactorClientIds]));
              const nicknames = { ...mergedReactions[emoji].reactorNicknames, ...reaction.reactorNicknames };
              mergedReactions[emoji] = { emoji, reactorClientIds: clientIds, reactorNicknames: nicknames };
            }
          }
          map.set(msg.id, { ...existing, ...msg, reactions: mergedReactions });
        } else {
          map.set(msg.id, msg);
        }
      }
    }

    const merged = Array.from(map.values()).sort(compareMessages);
    const toKeep = merged.slice(-MAX_MESSAGES_PER_ROOM);

    const db = await this.getDb();
    if (!db) {
      this.memoryMessages.set(roomId, toKeep);
      return toKeep;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = tx.objectStore(STORE_MESSAGES);
        for (const msg of toKeep) {
          store.put(msg);
        }
        tx.oncomplete = () => {
          this.trimRoomMessages(roomId).finally(() => resolve(toKeep));
        };
        tx.onerror = () => {
          resolve(toKeep);
        };
      } catch {
        resolve(toKeep);
      }
    });
  }

  public async toggleReaction(
    messageId: string,
    emoji: string,
    clientId: string,
    nickname: string
  ): Promise<ChatMessage | null> {
    const db = await this.getDb();

    if (!db) {
      for (const [roomId, msgs] of this.memoryMessages.entries()) {
        const found = msgs.find((m) => m.id === messageId);
        if (found) {
          this.applyReactionLogic(found, emoji, clientId, nickname);
          this.memoryMessages.set(roomId, [...msgs]);
          return found;
        }
      }
      return null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = tx.objectStore(STORE_MESSAGES);
        const getReq = store.get(messageId);

        getReq.onsuccess = () => {
          const message = getReq.result as ChatMessage | undefined;
          if (!message) {
            resolve(null);
            return;
          }

          this.applyReactionLogic(message, emoji, clientId, nickname);
          store.put(message);
        };

        tx.oncomplete = () => {
          const readTx = db.transaction(STORE_MESSAGES, 'readonly');
          const finalReq = readTx.objectStore(STORE_MESSAGES).get(messageId);
          finalReq.onsuccess = () => resolve((finalReq.result as ChatMessage) || null);
          finalReq.onerror = () => resolve(null);
        };

        tx.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private applyReactionLogic(message: ChatMessage, emoji: string, clientId: string, nickname: string): void {
    if (!message.reactions) {
      message.reactions = {};
    }

    const currentReaction = message.reactions[emoji];

    if (currentReaction) {
      const idx = currentReaction.reactorClientIds.indexOf(clientId);
      if (idx !== -1) {
        // Remove reação
        currentReaction.reactorClientIds.splice(idx, 1);
        delete currentReaction.reactorNicknames[clientId];

        if (currentReaction.reactorClientIds.length === 0) {
          delete message.reactions[emoji];
        }
      } else {
        // Adiciona reação ao emoji existente
        currentReaction.reactorClientIds.push(clientId);
        currentReaction.reactorNicknames[clientId] = nickname;
      }
    } else {
      // Cria nova reação
      message.reactions[emoji] = {
        emoji,
        reactorClientIds: [clientId],
        reactorNicknames: { [clientId]: nickname },
      };
    }
  }

  private async trimRoomMessages(roomId: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = tx.objectStore(STORE_MESSAGES);
        const index = store.index('by_room_time');
        const range = IDBKeyRange.bound([roomId, 0], [roomId, Number.MAX_SAFE_INTEGER]);
        const req = index.getAll(range);
        req.onsuccess = () => {
          const msgs = ((req.result as ChatMessage[]) || []).sort(compareMessages);
          for (const item of msgs.slice(0, Math.max(0, msgs.length - MAX_MESSAGES_PER_ROOM))) store.delete(item.id);
        };
        tx.oncomplete = () => resolve();tx.onerror = () => resolve();tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  }

  /* ========================================================================= */
  /* STORE: SOUNDBOARD CLIPS                                                   */
  /* ========================================================================= */

  public async saveSoundboardClip(clip: SoundboardClip): Promise<void> {
    if(clip.originalAudioBlob&&clip.originalAudioBlob.size>MAX_CLIP_SIZE_BYTES)throw Error("Original excede 5 MB.");
    if (clip.audioBlob && clip.audioBlob.size > MAX_CLIP_SIZE_BYTES) {
      throw new Error(`Arquivo de áudio muito grande (${(clip.audioBlob.size / (1024 * 1024)).toFixed(1)}MB). O limite é de 5MB.`);
    }

    const db = await this.getDb();
    if (!db) {
      this.memoryClips.set(clip.id, clip);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_CLIPS, 'readwrite');
        const store = tx.objectStore(STORE_CLIPS);
        store.put(clip);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Gravação cancelada.'));
      } catch (err) {
        reject(err);
      }
    });
  }

  public async getSoundboardClips(): Promise<SoundboardClip[]> {
    const db = await this.getDb();
    if (!db) {
      return Array.from(this.memoryClips.values()).sort((a, b) => a.createdAt - b.createdAt);
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CLIPS, 'readonly');
        const store = tx.objectStore(STORE_CLIPS);
        const req = store.getAll();

        req.onsuccess = () => {
          const list = (req.result as SoundboardClip[]) || [];
          list.sort((a, b) => a.createdAt - b.createdAt);
          resolve(list);
        };

        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  public async toggleFavoriteClip(id: string): Promise<boolean> {
    const db = await this.getDb();
    if (!db) {
      const clip = this.memoryClips.get(id);
      if (clip) {
        clip.isFavorite = !clip.isFavorite;
        this.memoryClips.set(id, clip);
        return clip.isFavorite;
      }
      return false;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CLIPS, 'readwrite');
        const store = tx.objectStore(STORE_CLIPS);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
          const clip = getReq.result as SoundboardClip | undefined;
          if (clip) {
            clip.isFavorite = !clip.isFavorite;
            store.put(clip);
            tx.oncomplete = () => resolve(clip.isFavorite);
          } else {
            resolve(false);
          }
        };

        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async deleteSoundboardClip(id: string): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      this.memoryClips.delete(id);
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CLIPS, 'readwrite');
        const store = tx.objectStore(STORE_CLIPS);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const storageDb = new StorageDb();

