// 会议类型 → 中文标签。与引擎落盘 meetings.jsonl 的 type 字段对齐。
// 单一来源：视图（会议记录/通信审计）复用，避免多处重复声明。
export const MEETING_TYPE_LABEL: Record<string, string> = {
  dept_internal: '部门内',
  ministerial: '部长级',
  decision: '决策',
};

export function formatMeetingType(type: string | undefined): string {
  return type ? (MEETING_TYPE_LABEL[type] ?? type) : '未知';
}
