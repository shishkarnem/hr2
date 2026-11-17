/**
 * ProTalk PostgreSQL Cloud API client.
 * Provides a query builder and RPC interface connected to PostgreSQL BD ProTalk backend routes.
 */

// Helper to extract auth headers for employer or candidate
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  try {
    const empToken = typeof localStorage !== "undefined"
      ? (localStorage.getItem("emp_token") || localStorage.getItem("employer_token"))
      : null;
    const candRaw = typeof localStorage !== "undefined" ? localStorage.getItem("cand_session") : null;
    const candToken = candRaw ? (JSON.parse(candRaw) as any)?.token : null;
    if (empToken) headers["Authorization"] = `Bearer ${empToken}`;
    if (candToken) headers["x-candidate-token"] = String(candToken);
  } catch {}
  return headers;
}

export class ProTalkPgChannel {
  private name: string;
  constructor(name: string) {
    this.name = name;
  }
  on(_event: string, _filter: any, _callback: (...args: any[]) => void) {
    return this;
  }
  subscribe(_callback?: (status: string) => void) {
    if (_callback) _callback("SUBSCRIBED");
    return this;
  }
  unsubscribe() {
    return Promise.resolve();
  }
}

export class ProTalkPgQueryBuilder<T = any> {
  private table: string;
  private action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private selectCols: string = "*";
  private countMode: string | null = null;
  private headMode: boolean = false;
  private filters: Array<{ col: string; op: string; val: any }> = [];
  private orFilters: string[] = [];
  private orderList: Array<{ col: string; ascending: boolean }> = [];
  private limitNum: number | null = null;
  private offsetNum: number | null = null;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private payloadData: any = null;
  private onConflictCols: string | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(cols: string = "*", options?: { count?: string; head?: boolean }) {
    this.selectCols = cols || "*";
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.headMode = Boolean(options.head);
    return this;
  }

  insert(values: any, _options?: { defaultToNull?: boolean }) {
    this.action = "insert";
    this.payloadData = values;
    return this;
  }

  update(values: any) {
    this.action = "update";
    this.payloadData = values;
    return this;
  }

  upsert(values: any, options?: { onConflict?: string }) {
    this.action = "upsert";
    this.payloadData = values;
    if (options?.onConflict) this.onConflictCols = options.onConflict;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push({ col, op: "neq", val });
    return this;
  }

  in(col: string, vals: any[]) {
    this.filters.push({ col, op: "in", val: Array.isArray(vals) ? vals : [] });
    return this;
  }

  is(col: string, val: any) {
    this.filters.push({ col, op: "is", val });
    return this;
  }

  gt(col: string, val: any) {
    this.filters.push({ col, op: "gt", val });
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push({ col, op: "gte", val });
    return this;
  }

  lt(col: string, val: any) {
    this.filters.push({ col, op: "lt", val });
    return this;
  }

  lte(col: string, val: any) {
    this.filters.push({ col, op: "lte", val });
    return this;
  }

  like(col: string, val: any) {
    this.filters.push({ col, op: "like", val });
    return this;
  }

  ilike(col: string, val: any) {
    this.filters.push({ col, op: "ilike", val });
    return this;
  }

  or(expr: string) {
    if (expr) this.orFilters.push(expr);
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    this.orderList.push({ col, ascending: options?.ascending !== false });
    return this;
  }

  limit(n: number) {
    this.limitNum = n;
    return this;
  }

  range(from: number, to: number) {
    this.offsetNum = Math.max(0, from);
    this.limitNum = Math.max(1, to - from + 1);
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  private async execute(): Promise<{ data: any; error: any; count?: number }> {
    try {
      const resp = await fetch("/api/query", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          select: this.selectCols,
          filters: this.filters,
          orFilters: this.orFilters,
          order: this.orderList,
          limit: this.limitNum,
          offset: this.offsetNum,
          single: this.isSingle,
          maybeSingle: this.isMaybeSingle,
          countMode: this.countMode,
          head: this.headMode,
          payload: this.payloadData,
          onConflict: this.onConflictCols,
        }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || json?.error) {
        return {
          data: null,
          error: json?.error || { message: `HTTP ${resp.status}` },
        };
      }
      return {
        data: json?.data ?? null,
        count: json?.count,
        error: null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || "ProTalk PostgreSQL query error" },
      };
    }
  }

  then<TResult1 = { data: any; error: any; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<{ data: any; error: any; count?: number } | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<{ data: any; error: any; count?: number }> {
    return this.execute().finally(onfinally);
  }
}

class LocalDBClient {
  from<T = any>(table: string) {
    return new ProTalkPgQueryBuilder<T>(table);
  }

  channel(name: string) {
    return new ProTalkPgChannel(name);
  }

  removeChannel(_channel?: any) {
    return Promise.resolve();
  }

  async rpc(fnName: string, args?: any, _options?: any): Promise<{ data: any; error: any }> {
    try {
      const resp = await fetch(`/api/rpc/${fnName}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(args || {}),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        return {
          data: null,
          error: {
            message: json?.message || json?.error || `HTTP ${resp.status}`,
            code: json?.error || String(resp.status),
          },
        };
      }
      if (json && typeof json === "object" && "data" in json && "error" in json) {
        return { data: json.data, error: json.error ? { message: json.error } : null };
      }
      return { data: json, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || "RPC call error" } };
    }
  }

  functions = {
    invoke: async <T = any>(fnName: string, options?: any): Promise<{ data: T | null; error: any }> => {
      try {
        let bodyObj = options?.body;
        if (typeof bodyObj === "string") {
          try {
            bodyObj = JSON.parse(bodyObj);
          } catch {}
        }
        if (
          typeof window !== "undefined" &&
          (window as any).__RR_FORCE_PROMAX &&
          bodyObj &&
          typeof bodyObj === "object" &&
          !Array.isArray(bodyObj)
        ) {
          bodyObj = { ...bodyObj, use_promax: true };
        }

        const res = await fetch(`/api/${fnName}`, {
          method: "POST",
          headers: {
            ...getAuthHeaders(),
            ...(options?.headers || {}),
          },
          body:
            bodyObj !== undefined
              ? typeof bodyObj === "string"
                ? bodyObj
                : JSON.stringify(bodyObj)
              : undefined,
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return { data, error: null };
        }
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return {
          data: null,
          error: new Error(errData?.error || errData?.message || `HTTP ${res.status}`),
        };
      } catch (err: any) {
        return {
          data: null,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    },
  };

  auth = {
    getUser: async (): Promise<{ data: { user: any | null }; error: any }> => {
      try {
        const raw = typeof localStorage !== "undefined" ? localStorage.getItem("emp_user") : null;
        if (raw) {
          const u = JSON.parse(raw);
          const user = {
            id: u.id || u.user_id || u.employerId || u.publicId,
            email: u.email || u.contact_email || "",
            user_metadata: u,
          };
          return { data: { user }, error: null };
        }
      } catch {}
      return { data: { user: null }, error: null };
    },

    getSession: async (): Promise<{ data: { session: any | null }; error: any }> => {
      try {
        const token = typeof localStorage !== "undefined"
          ? (localStorage.getItem("emp_token") || localStorage.getItem("employer_token"))
          : null;
        const raw = typeof localStorage !== "undefined" ? localStorage.getItem("emp_user") : null;
        if (token && raw) {
          const u = JSON.parse(raw);
          const user = {
            id: u.id || u.user_id || u.employerId || u.publicId,
            email: u.email || u.contact_email || "",
            user_metadata: u,
          };
          return { data: { session: { access_token: token, user } }, error: null };
        }
      } catch {}
      return { data: { session: null }, error: null };
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      const handler = () => {
        try {
          const token = typeof localStorage !== "undefined"
            ? (localStorage.getItem("emp_token") || localStorage.getItem("employer_token"))
            : null;
          const raw = typeof localStorage !== "undefined" ? localStorage.getItem("emp_user") : null;
          if (token && raw) {
            const u = JSON.parse(raw);
            const user = {
              id: u.id || u.user_id || u.employerId || u.publicId,
              email: u.email || u.contact_email || "",
              user_metadata: u,
            };
            callback("SIGNED_IN", { access_token: token, user });
          } else {
            callback("SIGNED_OUT", null);
          }
        } catch {
          callback("SIGNED_OUT", null);
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener("storage", handler);
      }

      return {
        data: {
          subscription: {
            unsubscribe: () => {
              if (typeof window !== "undefined") {
                window.removeEventListener("storage", handler);
              }
            },
          },
        },
      };
    },

    signOut: async (): Promise<{ error: any }> => {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem("emp_token");
          localStorage.removeItem("emp_user");
          localStorage.removeItem("employer_token");
        }
      } catch {}
      return { error: null };
    },

    updateUser: async (_data: any): Promise<{ data: { user: any | null }; error: any }> => {
      return { data: { user: null }, error: null };
    },

    signInWithOAuth: async (_opts?: any): Promise<{ data: any; error: any }> => {
      return { data: null, error: new Error("OAuth unavailable") };
    },
  };
}

export const dbClient = new LocalDBClient();
