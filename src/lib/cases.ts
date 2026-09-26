import type { ChatMessage, TestCase } from "./types";

/**
 * 内置批量数据集（doc §24）：单意图、多意图、退款、取消、人工升级、受挫客户、
 * 话题切换、隐式意图、多语言、混合语言 —— 另含 2 条无 ground truth 的用例
 *（它们只能显示 相同 / 不同，doc §29）。
 *
 * 非中文消息附 translation（仅用于界面展示，不参与模型调用与导出判断）。
 */
export const BUILTIN_CASES: TestCase[] = [
  {
    id: "product-en",
    name: "商品咨询（英文）",
    messages: [
      {
        role: "user",
        content: "Hi, is this phone case compatible with the iPhone 15 Pro Max?",
        translation: "你好，这个手机壳和 iPhone 15 Pro Max 兼容吗？",
      },
    ],
    expected: { intents: ["product"], route: "agent", needsHumanReview: false },
  },
  {
    id: "order-address-zh",
    name: "订单改地址（中文）",
    messages: [
      { role: "user", content: "你好，我想把订单 889231 的收货地址改成上海，还没发货。" },
    ],
    expected: { intents: ["order"], route: "agent", needsHumanReview: false },
  },
  {
    id: "logistics-delay-id",
    name: "物流延迟（印尼语）",
    messages: [
      {
        role: "user",
        content: "Paket saya sudah 10 hari belum sampai. Tolong dicek ya.",
        translation: "我的包裹已经 10 天还没到，麻烦帮忙查一下。",
      },
    ],
    expected: { intents: ["logistics"], route: "agent", needsHumanReview: false },
  },
  {
    id: "multi-intent-logistics-cancel-id",
    name: "多意图：物流＋取消（印尼语）",
    messages: [
      {
        role: "user",
        content:
          "Paket saya belum sampai. Saya juga ingin membatalkan pesanan yang satunya.",
        translation: "我的包裹还没到。另外我想取消另一笔订单。",
      },
    ],
    expected: { intents: ["logistics", "cancel"], route: "human", needsHumanReview: true },
  },
  {
    id: "refund-en",
    name: "退款请求（英文）",
    messages: [
      {
        role: "user",
        content: "I want a refund for order #4521, please.",
        translation: "我想给订单 #4521 申请退款。",
      },
    ],
    expected: { intents: ["refund"], route: "human", needsHumanReview: true },
  },
  {
    id: "implicit-refund-pt",
    name: "隐式退款（巴西葡语）",
    messages: [
      {
        role: "user",
        content:
          "Comprei uma cafeteira na semana passada e ela veio quebrada. O que vocês podem fazer por mim?",
        translation: "我上周买的咖啡机到货时是坏的，你们能帮我怎么处理？",
      },
    ],
    expected: { intents: ["refund"], route: "human", needsHumanReview: true },
  },
  {
    id: "cancel-th",
    name: "取消订单（泰语）",
    messages: [
      {
        role: "user",
        content: "ต้องการยกเลิกคำสั่งซื้ออันนี้ครับ ยังไม่ได้จัดส่ง",
        translation: "我想取消这个订单，还没发货。",
      },
    ],
    expected: { intents: ["cancel"], route: "human", needsHumanReview: true },
  },
  {
    id: "payment-vi",
    name: "支付方式（越南语）",
    messages: [
      {
        role: "user",
        content: "Tôi có thể thanh toán bằng chuyển khoản ngân hàng không?",
        translation: "我可以用银行转账付款吗？",
      },
    ],
    expected: { intents: ["payment"], route: "agent", needsHumanReview: false },
  },
  {
    id: "complaint-frustrated-en",
    name: "受挫投诉（英文）",
    messages: [
      {
        role: "user",
        content:
          "This is the THIRD time your app has charged me twice for the same order. Fix this now!!",
        translation: "你们的 App 已经第三次对同一订单重复扣款了，马上给我解决！！",
      },
    ],
    expected: {
      intents: ["payment", "complaint"],
      route: "human",
      needsHumanReview: true,
      frustrated: true,
    },
  },
  {
    id: "complaint-frustrated-zh",
    name: "受挫投诉（中文）",
    messages: [
      { role: "user", content: "已经一个星期了还没有人给我解决方案，你们的服务太让人失望了！" },
    ],
    expected: { intents: ["complaint"], route: "human", needsHumanReview: true, frustrated: true },
  },
  {
    id: "topic-change-refund-en",
    name: "话题切换→退款（英文）",
    messages: [
      {
        role: "user",
        content: "Where is my order #7788? It was supposed to arrive last Monday.",
        translation: "我的订单 #7788 到哪了？本来上周一就该到了。",
      },
      {
        role: "assistant",
        content:
          "Sorry for the delay! Your parcel is in transit and is expected to arrive this Friday.",
        translation: "抱歉让您久等！包裹正在派送中，预计本周五送达。",
      },
      {
        role: "user",
        content:
          "OK. By the way, can I get a refund for the damaged item from last week's order?",
        translation: "好的。对了，上周订单里那个破损的商品，能给我退款吗？",
      },
    ],
    expected: { intents: ["refund"], route: "human", needsHumanReview: true, topicChanged: true },
  },
  {
    id: "topic-change-zh",
    name: "话题切换→退款（中文）",
    messages: [
      { role: "user", content: "你们家的洗衣液多少钱一瓶？" },
      { role: "assistant", content: "您好，我们的洗衣液 35 元一瓶，两瓶装 60 元。" },
      { role: "user", content: "算了不聊这个了，我上周买的那单退款到账了吗？" },
    ],
    expected: { intents: ["refund"], route: "human", needsHumanReview: true, topicChanged: true },
  },
  {
    id: "implicit-return-th",
    name: "隐式退货（泰语）",
    messages: [
      {
        role: "user",
        content: "รองเท้าที่ได้รับไซส์เล็กกว่าที่สั่ง ต้องส่งคืนยังไงคะ",
        translation: "收到的鞋子比下单的尺码小，请问要怎么退回？",
      },
    ],
    expected: { intents: ["refund"], route: "human", needsHumanReview: true },
  },
  {
    id: "mixed-language-en-id",
    name: "混合语言（英＋印尼）",
    messages: [
      {
        role: "user",
        content:
          "Hello, I want to tanya soal pengiriman saya, sudah 5 hari belum move on.",
        translation: "你好，我想问下我的物流，5 天了都没有动静。",
      },
    ],
    expected: { intents: ["logistics"], route: "agent", needsHumanReview: false },
  },
  {
    id: "product-payment-en",
    name: "商品＋支付（英文）",
    messages: [
      {
        role: "user",
        content: "Is this watch waterproof? Also, can I pay in installments?",
        translation: "这块表防水吗？另外可以分期付款吗？",
      },
    ],
    expected: { intents: ["product", "payment"], route: "agent", needsHumanReview: false },
  },
  {
    id: "chitchat-other-en",
    name: "客服工作时间（英文）",
    messages: [
      {
        role: "user",
        content: "What are your customer service working hours?",
        translation: "你们的客服工作时间是什么时候？",
      },
    ],
    expected: { intents: ["other"], route: "agent", needsHumanReview: false },
  },
  {
    id: "no-gt-ambiguous-id",
    name: "无预期：模糊问题（印尼语）",
    messages: [
      {
        role: "user",
        content: "Saya mau tanya soal pesanan saya.",
        translation: "我想问一下我的订单。",
      },
      // 无 expected：该用例只能显示 相同 / 不同。
    ],
  },
  {
    id: "no-gt-topic-en",
    name: "无预期：话题切换（英文）",
    messages: [
      {
        role: "user",
        content: "Is the black leather jacket in stock?",
        translation: "黑色皮夹克有货吗？",
      },
      {
        role: "assistant",
        content: "Yes, sizes M and L are in stock right now.",
        translation: "有的，M 码和 L 码现在都有货。",
      },
      {
        role: "user",
        content: "Great. And what time does your store close today?",
        translation: "太好了。对了，你们门店今天几点关门？",
      },
    ],
  },
];

/** 单条测试的示例对话（设计文档 §19 的经典印尼语示例）。 */
export const EXAMPLE_CONVERSATION: ChatMessage[] = [
  {
    role: "user",
    content: "Paket saya belum sampai. Saya juga ingin membatalkan pesanan yang satunya.",
    translation: "我的包裹还没到。另外我想取消另一笔订单。",
  },
];
