import RecoveryPasswordForm from "./RecoveryPasswordForm";

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return <RecoveryPasswordForm initialError={error} />;
}
