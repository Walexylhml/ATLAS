import { Controller, Get, Module, NotFoundException, Param } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { withTenant } from "../database/rls.js";
import { person, userAccount } from "../database/schema/index.js";
import { CurrentPrincipal, RequirePermission } from "../authz/decorators.js";
import { PERMISSIONS } from "../authz/permissions.js";
import type { Principal } from "../authz/principal.js";

/**
 * A thin, real module that exercises the authorization model end-to-end — proof
 * the guard works against live data, not a toy. Three shapes:
 *   - RBAC tenant scope   : list accounts (needs account.manage)
 *   - RBAC + self scope    : read a person (admins by tenant scope; a student via
 *                            a self-scoped grant can read only their own record)
 *   - ABAC relationship    : guardian view of a linked child (is_my_child)
 */
@Controller("directory")
export class DirectoryController {
  @Get("accounts")
  @RequirePermission(PERMISSIONS.ACCOUNT_MANAGE)
  async listAccounts(@CurrentPrincipal() principal: Principal): Promise<AccountView[]> {
    return withTenant({ tenantId: principal.tenantId }, async (db) => {
      const rows = await db
        .select({
          id: userAccount.id,
          username: userAccount.username,
          email: userAccount.email,
          phone: userAccount.phone,
          status: userAccount.status,
        })
        .from(userAccount)
        .where(and(eq(userAccount.tenantId, principal.tenantId), isNull(userAccount.deletedAt)));
      return rows;
    });
  }

  @Get("people/:personId")
  @RequirePermission({ permission: PERMISSIONS.PERSON_READ, personIdParam: "personId" })
  async readPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<PersonView> {
    return this.loadPerson(principal.tenantId, personId);
  }

  @Get("children/:personId")
  @RequirePermission({ permission: PERMISSIONS.PERSON_READ_CHILD, personIdParam: "personId" })
  async readChild(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<PersonView> {
    return this.loadPerson(principal.tenantId, personId);
  }

  private async loadPerson(tenantId: string, personId: string): Promise<PersonView> {
    const view = await withTenant({ tenantId }, async (db) => {
      const [row] = await db
        .select({
          id: person.id,
          surname: person.surname,
          firstName: person.firstName,
          primaryEmail: person.primaryEmail,
          primaryPhone: person.primaryPhone,
          status: person.status,
        })
        .from(person)
        .where(and(eq(person.id, personId), isNull(person.deletedAt)))
        .limit(1);
      return row;
    });
    if (!view) throw new NotFoundException("Person not found");
    return view;
  }
}

interface AccountView {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  status: string;
}

interface PersonView {
  id: string;
  surname: string;
  firstName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  status: string;
}

@Module({ controllers: [DirectoryController] })
export class DirectoryModule {}
