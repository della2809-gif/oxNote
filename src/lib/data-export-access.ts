import "server-only";

type SubscriptionAccess = {
  plan_id: string;
  status: string;
} | null;

export function canExportLearningData(subscription: SubscriptionAccess) {
  if (!subscription) return false;
  return (
    subscription.plan_id !== "free" &&
    (subscription.status === "active" || subscription.status === "trialing")
  );
}
