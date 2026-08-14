import { notFound } from "next/navigation";
import { publicOrganizationSlugSchema } from "@/modules/public-booking/domain/schemas";
import { findIdentityOrganization } from "@/modules/public-booking/server/identity-repository";
import { isPhoneOtpEnabled } from "@/modules/public-booking/server/identity-security";
import IdentityAccess from "./IdentityAccess";

export const dynamic = "force-dynamic";

export default async function CustomerAccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = publicOrganizationSlugSchema.safeParse(rawSlug);
  if (!slug.success) notFound();
  const organization = await findIdentityOrganization(slug.data);
  if (!organization) notFound();
  return (
    <IdentityAccess
      slug={slug.data}
      organizationName={organization.displayName}
      phoneOtpEnabled={isPhoneOtpEnabled()}
    />
  );
}
