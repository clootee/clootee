// 外部消息注入（实现）：postMessage 全部由 helper 可达的服务类完成，Struct 已直接写完，
// 这里只是保持「外部统一经 Realize 调用」的约定，不新增任何内容。
import { ExternalInboxStruct } from '../logic_struct/ExternalInboxStruct';

export class ExternalInbox extends ExternalInboxStruct {}
