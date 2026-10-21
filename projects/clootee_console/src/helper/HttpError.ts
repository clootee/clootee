// 带 HTTP 状态码的错误：结构层用它表达"该回什么状态"，网关只负责写出。
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}
