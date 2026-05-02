import type { Service } from "@/types";

export type ServicePosition = { x: number; y: number };

export const SERVICE_POSITIONS: Record<string, ServicePosition> = {
  "services.auth-service": { x: 200, y: 100 },
  "services.payments-api": { x: 620, y: 100 },
  "services.notification-service": { x: 1040, y: 100 },
  "services.mobile-app": { x: 300, y: 380 },
  "services.admin-dashboard": { x: 720, y: 380 },
  "services.search-api": { x: 1140, y: 380 },
};

export const services: Service[] = [
  {
    _id: "services.auth-service",
    type: "service",
    name: "auth-service",
    owner_team: "platform",
    depends_on: [],
    consumed_by: ["services.payments-api", "services.mobile-app"],
    hot_files: [
      "src/jwt.ts",
      "src/middleware/verify.ts",
      "src/sessions.ts",
    ],
  },
  {
    _id: "services.payments-api",
    type: "service",
    name: "payments-api",
    owner_team: "platform",
    depends_on: ["services.auth-service"],
    consumed_by: ["services.mobile-app", "services.admin-dashboard"],
    hot_files: [
      "src/routes/checkout.ts",
      "src/routes/orders.ts",
      "src/lib/limiter.ts",
      "src/db/transactions.ts",
    ],
  },
  {
    _id: "services.notification-service",
    type: "service",
    name: "notification-service",
    owner_team: "platform",
    depends_on: [],
    consumed_by: ["services.payments-api", "services.mobile-app"],
    hot_files: ["src/dispatcher.ts", "src/templates/order.ts"],
  },
  {
    _id: "services.mobile-app",
    type: "service",
    name: "mobile-app",
    owner_team: "mobile",
    depends_on: [
      "services.payments-api",
      "services.auth-service",
      "services.search-api",
      "services.notification-service",
    ],
    consumed_by: [],
    hot_files: [
      "app/screens/Checkout.tsx",
      "app/api/orders.ts",
      "app/api/auth.ts",
    ],
  },
  {
    _id: "services.admin-dashboard",
    type: "service",
    name: "admin-dashboard",
    owner_team: "growth",
    depends_on: ["services.payments-api"],
    consumed_by: [],
    hot_files: ["pages/orders.tsx", "lib/analytics.ts"],
  },
  {
    _id: "services.search-api",
    type: "service",
    name: "search-api",
    owner_team: "platform",
    depends_on: [],
    consumed_by: ["services.mobile-app"],
    hot_files: ["src/index.ts", "src/ranking.ts"],
  },
];
