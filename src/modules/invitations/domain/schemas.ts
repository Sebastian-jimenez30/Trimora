import { ORGANIZATION_ROLES } from "@/core/auth/domain/roles";
import { z } from "zod";

export const invitationTokenSchema = z.string().uuid();
export const invitationRoleSchema = z.enum(ORGANIZATION_ROLES);
