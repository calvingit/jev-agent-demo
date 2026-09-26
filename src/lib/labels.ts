import type { CaseOutcome, Intent, Role, Route, RunErrorType } from "./types";

/** 面向展示的中文标签（数据值本身保持英文枚举，仅渲染层翻译）。 */

export const INTENT_LABELS: Record<Intent, string> = {
  product: "商品",
  order: "订单",
  logistics: "物流",
  refund: "退款",
  cancel: "取消",
  payment: "支付",
  complaint: "投诉",
  other: "其他",
};

export function intentLabel(intent: Intent): string {
  return INTENT_LABELS[intent] ?? intent;
}

export const ROUTE_LABELS: Record<Route, string> = {
  agent: "智能客服",
  human: "转人工",
};

export function routeLabel(route: Route): string {
  return ROUTE_LABELS[route];
}

export const ROLE_LABELS: Record<Role, string> = {
  user: "用户",
  assistant: "客服",
};

export const OUTCOME_LABELS: Record<CaseOutcome, string> = {
  improved: "改善",
  worse: "变差",
  same: "相同",
  different: "不同",
  error: "错误",
};

export const ERROR_TYPE_LABELS: Record<RunErrorType, string> = {
  network: "网络错误",
  timeout: "超时",
  http: "HTTP 错误",
  invalid_response: "响应无效",
  schema_validation: "结构校验失败",
  unknown: "未知错误",
};

export const SIGNAL_LABELS: Array<{ key: string; label: string }> = [
  { key: "intent.product", label: "商品" },
  { key: "intent.order", label: "订单" },
  { key: "intent.logistics", label: "物流" },
  { key: "intent.refund", label: "退款" },
  { key: "intent.cancel", label: "取消" },
  { key: "intent.payment", label: "支付" },
  { key: "intent.complaint", label: "投诉" },
  { key: "needsHumanReview", label: "需人工审核" },
  { key: "frustrated", label: "客户恼火" },
  { key: "topicChanged", label: "话题切换" },
];

export function boolLabel(value: boolean): string {
  return value ? "是" : "否";
}
