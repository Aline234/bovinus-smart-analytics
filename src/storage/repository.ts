import type { State } from '../domain/model';
import { synthetic } from '../domain/seed';

export class Conflict extends Error {
  constructor() { super('Os registros mudaram em outra sessão. Confira a versão atual e tente novamente.'); }
}
export interface Repository {
  load(): Promise<State>;
  commit(next: State, previous: State): Promise<State>;
}
type Store = IDBObjectStore;

export class BrowserRepository implements Repository {
  private connection?: Promise<IDBDatabase>;
  constructor(private factory: IDBFactory = indexedDB, private seed: () => State = synthetic) {}
  private open() {
    this.connection ??= new Promise<IDBDatabase>((resolve,reject) => {
      const request = this.factory.open('bovinus-analytics',1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.connection;
  }
  private async change(apply: (previous: State | undefined, store: Store) => State) {
    const db = await this.open();
    return new Promise<State>((resolve,reject) => {
      const tx = db.transaction('state','readwrite');
      const store = tx.objectStore('state');
      const request = store.get('current');
      let result: State;
      let error: unknown;
      request.onsuccess = () => {
        try { result = apply(request.result,store); }
        catch (e) { error = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error ?? tx.error ?? new Error('O navegador não conseguiu salvar os dados.'));
      tx.onerror = () => reject(tx.error);
    });
  }
  load() {
    return this.change((previous,store) => {
      if (previous) return previous;
      const value = this.seed();
      store.put(value,'current');
      return value;
    });
  }
  commit(next: State, previous: State) {
    return this.change((current,store) => {
      if (current?.revision !== previous.revision) throw new Conflict();
      const result = {...next,revision:previous.revision+1};
      store.put(result,'current');
      return result;
    });
  }
}
