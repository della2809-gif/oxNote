import "server-only";

type SubscriptionAccess = {
  plan_id: string;
  status: string;
  current_period_end?: string | null;
} | null;

export function canExportLearningData(subscription: SubscriptionAccess) {
  if (!subscription) return false;
  return (
    subscription.plan_id !== "free" &&
    (subscription.status === "active" || subscription.status === "trialing") &&
    Boolean(
      subscription.current_period_end &&
        new Date(subscription.current_period_end).getTime() > Date.now(),
    )
  );
}
