export type Connection = { url: string; token: string };
export type Message = { role: 'user' | 'assistant'; text: string; at: number };
export type Job = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  action: { type: string; filename?: string };
  result: string | null;
  createdAt: number;
};
export type State = {
  pc: { online: boolean; lastSeen: number | null };
  demo: boolean;
  jobs: Job[];
  messages: Message[];
};
export type Payload = {
  requestId: string;
  text?: string;
  audioBase64?: string;
  audioFormat?: 'wav';
};
export async function request<T>(
  connection: Connection,
  path: string,
  payload?: Payload,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 85000);
  try {
    const response = await fetch(connection.url.replace(/\/$/, '') + path, {
      method: payload ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${connection.token}`,
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `서버 오류 ${response.status}`);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        '응답 시간이 초과됐습니다. 재시도하면 같은 요청으로 결과를 확인합니다.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
