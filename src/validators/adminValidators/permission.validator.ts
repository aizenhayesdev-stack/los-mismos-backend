import { z } from "zod";
import { PermissionModule, PermissionAction } from "../../models/permission.model";
import { UserRole } from "../../models/common/types";

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      module: z.enum(
        Object.values(PermissionModule) as [string, ...string[]],
        {
          errorMap: () => ({ message: "Invalid module name" }),
        }
      ),
      actions: z.array(
        z.enum(
          Object.values(PermissionAction) as [string, ...string[]],
          {
            errorMap: () => ({ message: "Invalid action name" }),
          }
        )
      ),
    })
  ),
});

export const checkPermissionSchema = z.object({
  role: z.enum(
    Object.values(UserRole) as [string, ...string[]],
    {
      errorMap: () => ({ message: "Invalid role" }),
    }
  ),
  module: z.enum(
    Object.values(PermissionModule) as [string, ...string[]],
    {
      errorMap: () => ({ message: "Invalid module name" }),
    }
  ),
  action: z.enum(
    Object.values(PermissionAction) as [string, ...string[]],
    {
      errorMap: () => ({ message: "Invalid action name" }),
    }
  ),
});

