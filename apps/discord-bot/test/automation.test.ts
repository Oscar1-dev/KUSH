import { describe, expect, it } from "vitest";
import type { DesiredRoles, RoleSyncJob } from "../src/api-client.js";
import {
  RoleSyncWorker,
  computeRoleChanges,
  type MemberGateway,
  type RoleSyncApi,
} from "../src/automation/role-sync.js";
import { createLogger } from "../src/runtime/logger.js";

const ids = { member: "M", verifiedCustomer: "VC", restricted: "R" };
const desired = (overrides: Partial<DesiredRoles> = {}): DesiredRoles => ({
  member: false,
  verifiedCustomer: false,
  productRoleIds: [],
  managedProductRoleIds: ["P1", "P2"],
  linked: false,
  ...overrides,
});

describe("role change computation", () => {
  it("grants Member after rules acceptance", () => {
    expect(
      computeRoleChanges(new Set(), desired({ member: true }), ids),
    ).toEqual({
      add: ["M"],
      remove: [],
    });
  });

  it("never removes Member, even without an acceptance record", () => {
    expect(
      computeRoleChanges(new Set(["M"]), desired({ member: false }), ids),
    ).toEqual({
      add: [],
      remove: [],
    });
  });

  it("grants customer and product roles from entitlements", () => {
    const changes = computeRoleChanges(
      new Set(["M"]),
      desired({
        member: true,
        verifiedCustomer: true,
        productRoleIds: ["P1"],
        linked: true,
      }),
      ids,
    );
    expect(changes).toEqual({ add: ["P1", "VC"], remove: [] });
  });

  it("removes roles the member no longer qualifies for", () => {
    const changes = computeRoleChanges(
      new Set(["M", "VC", "P1", "P2"]),
      desired({
        member: true,
        verifiedCustomer: true,
        productRoleIds: ["P2"],
        linked: true,
      }),
      ids,
    );
    expect(changes).toEqual({ add: [], remove: ["P1"] });
    expect(
      computeRoleChanges(
        new Set(["M", "VC", "P2"]),
        desired({ member: true }),
        ids,
      ),
    ).toEqual({ add: [], remove: ["P2", "VC"] });
  });

  it("never touches roles it does not own", () => {
    const changes = computeRoleChanges(
      new Set(["STAFF", "BETA", "PARTNER", "VC"]),
      desired({ member: false }),
      ids,
    );
    expect(changes).toEqual({ add: [], remove: ["VC"] });
  });

  it("does not grant customer roles to a restricted member", () => {
    const changes = computeRoleChanges(
      new Set(["M", "R"]),
      desired({
        member: true,
        verifiedCustomer: true,
        productRoleIds: ["P1"],
        linked: true,
      }),
      ids,
    );
    expect(changes).toEqual({ add: [], remove: [] });
  });
});

class FakeMembers implements MemberGateway {
  roleMap = new Map<string, Set<string>>();
  dms: string[] = [];
  failAdd = false;
  async roles(id: string) {
    const roles = this.roleMap.get(id);
    return roles ? new Set(roles) : null;
  }
  async addRoles(id: string, roleIds: string[]) {
    if (this.failAdd) throw new Error("Discord 503");
    for (const role of roleIds) this.roleMap.get(id)!.add(role);
  }
  async removeRoles(id: string, roleIds: string[]) {
    for (const role of roleIds) this.roleMap.get(id)!.delete(role);
  }
  async notify(id: string) {
    this.dms.push(id);
  }
}

class FakeApi implements RoleSyncApi {
  jobs: RoleSyncJob[] = [];
  finished: { id: string; ok: boolean; error?: string }[] = [];
  state = new Map<string, DesiredRoles>();
  async roleSyncJobs() {
    const due = this.jobs;
    this.jobs = [];
    return due;
  }
  async finishRoleSyncJob(
    job: { id: string; generation: number },
    outcome: { ok: true } | { ok: false; error: string },
  ) {
    this.finished.push({
      id: job.id,
      ok: outcome.ok,
      ...(outcome.ok ? {} : { error: outcome.error }),
    });
  }
  async desiredRoles(id: string) {
    return this.state.get(id) ?? desired();
  }
}

const setup = () => {
  const api = new FakeApi();
  const members = new FakeMembers();
  const worker = new RoleSyncWorker(
    api,
    members,
    () => ids,
    createLogger(() => undefined),
  );
  return { api, members, worker };
};
const job = (discordUserId: string, reason = "linked"): RoleSyncJob => ({
  id: `job-${discordUserId}-${reason}`,
  discordUserId,
  reason,
  attempts: 0,
  generation: 0,
});

describe("role sync worker", () => {
  it("applies purchases and notifies the customer privately", async () => {
    const { api, members, worker } = setup();
    members.roleMap.set("u1", new Set(["M"]));
    api.state.set(
      "u1",
      desired({
        member: true,
        verifiedCustomer: true,
        productRoleIds: ["P1"],
        linked: true,
      }),
    );
    api.jobs = [job("u1", "purchase:purchase.completed")];
    await worker.tick();
    expect([...members.roleMap.get("u1")!].sort()).toEqual(["M", "P1", "VC"]);
    expect(members.dms).toEqual(["u1"]);
    expect(api.finished).toEqual([
      { id: "job-u1-purchase:purchase.completed", ok: true },
    ]);
  });

  it("does not DM for non-purchase syncs", async () => {
    const { api, members, worker } = setup();
    members.roleMap.set("u2", new Set());
    api.state.set(
      "u2",
      desired({
        member: true,
        productRoleIds: ["P1"],
        verifiedCustomer: true,
        linked: true,
      }),
    );
    api.jobs = [job("u2", "linked")];
    await worker.tick();
    expect(members.dms).toEqual([]);
  });

  it("completes jobs for members who are not in the guild", async () => {
    const { api, worker } = setup();
    api.jobs = [job("gone")];
    await worker.tick();
    expect(api.finished).toEqual([{ id: "job-gone-linked", ok: true }]);
  });

  it("reports Discord failures back for retry", async () => {
    const { api, members, worker } = setup();
    members.roleMap.set("u3", new Set());
    members.failAdd = true;
    api.state.set("u3", desired({ member: true }));
    api.jobs = [job("u3")];
    await worker.tick();
    expect(api.finished).toEqual([
      { id: "job-u3-linked", ok: false, error: "Discord 503" },
    ]);
    expect(worker.stats).toMatchObject({
      processed: 0,
      failed: 1,
      lastError: "Discord 503",
    });
  });

  it("is idempotent when the same job runs twice", async () => {
    const { api, members, worker } = setup();
    members.roleMap.set("u4", new Set(["M", "VC", "P1"]));
    api.state.set(
      "u4",
      desired({
        member: true,
        verifiedCustomer: true,
        productRoleIds: ["P1"],
        linked: true,
      }),
    );
    api.jobs = [job("u4")];
    await worker.tick();
    api.jobs = [job("u4")];
    await worker.tick();
    expect([...members.roleMap.get("u4")!].sort()).toEqual(["M", "P1", "VC"]);
    expect(api.finished.every((item) => item.ok)).toBe(true);
  });

  it("skips overlapping runs instead of double-processing", async () => {
    const { api, members, worker } = setup();
    members.roleMap.set("u5", new Set());
    api.jobs = [job("u5")];
    const [first, second] = await Promise.all([worker.tick(), worker.tick()]);
    expect(first + second).toBe(1);
  });
});
