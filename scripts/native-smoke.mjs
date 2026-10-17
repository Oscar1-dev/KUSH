import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { configuration, databaseClient } from "./runtime.mjs";
const output = path.resolve("test-results");
await mkdir(output, { recursive: true });
const suffix = process.env.KUSH_SMOKE_SUFFIX;
const clientName = `Native test client ${suffix}`,
  projectName = `Native test project ${suffix}`;
const native = spawn(
  path.resolve("apps/developer/src-tauri/target/release/kush-developer.exe"),
  [],
  {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
        "--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1",
      WEBVIEW2_USER_DATA_FOLDER: path.resolve(".local/webview-smoke"),
    },
    stdio: "ignore",
  },
);
let browser, inspectedPage;
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch("http://127.0.0.1:9223/json/version")).ok;
        } catch {
          return false;
        }
      },
      { timeout: 30000 },
    )
    .toBe(true);
  browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const context = browser.contexts()[0],
    page = context.pages()[0] ?? (await context.waitForEvent("page"));
  inspectedPage = page;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await expect(
    page.getByRole("heading", { name: "Operations", exact: true }),
  ).toBeVisible();
  const health = page.getByRole("status");
  await expect(health).toHaveText("API reachable", { timeout: 15000 });
  async function command(name) {
    return page.evaluate(
      (name) =>
        window.__TAURI_INTERNALS__.invoke(`plugin:window|${name}`, {
          label: "main",
        }),
      name,
    );
  }
  const geometry = {
    size: await command("inner_size"),
    position: await command("outer_position"),
    scale: await command("scale_factor"),
  };
  await page.getByRole("button", { name: "Maximize or restore" }).click();
  await expect.poll(() => command("is_maximized")).toBe(true);
  await page.getByRole("button", { name: "Maximize or restore" }).click();
  await expect.poll(() => command("is_maximized")).toBe(false);
  await page.getByRole("button", { name: "Minimize", exact: true }).click();
  await expect.poll(() => command("is_minimized")).toBe(true);
  await command("unminimize");
  await command("set_focus");
  await expect.poll(() => command("is_minimized")).toBe(false);
  await writeFile(
    path.join(output, "native-window.json"),
    JSON.stringify(geometry, null, 2),
  );
  const login = async (password = process.env.KUSH_SMOKE_PASSWORD) => {
    await page
      .getByLabel("Email", { exact: true })
      .fill(process.env.KUSH_SMOKE_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByText(`Signed in as ${process.env.KUSH_SMOKE_EMAIL}`, {
        exact: true,
      }),
    ).toBeVisible();
  };
  await login();
  await page.getByLabel("Check interval").selectOption("30");
  await page.getByLabel("Profile name").fill(`Native profile ${suffix}`);
  await page
    .getByRole("button", { name: "Save local profile", exact: true })
    .click();
  await expect(
    page.getByText(`Native profile ${suffix} · http://127.0.0.1:4310`, {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("New account email")
    .fill(`native-staff-${suffix}@test.invalid`);
  await page
    .getByLabel("Initial password")
    .fill("native-staff-test-passphrase");
  await page.getByLabel("Initial role").selectOption("viewer");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `native-staff-${suffix}@test.invalid`,
      exact: true,
    }),
  ).toBeVisible();
  const staff = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: `native-staff-${suffix}@test.invalid`,
      exact: true,
    }),
  });
  await staff.getByLabel("Account role").selectOption("operator");
  await staff
    .getByRole("button", { name: "Update access", exact: true })
    .click();
  await expect(
    staff.getByText("operator · Enabled", { exact: true }),
  ).toBeVisible();
  await staff.getByLabel("Disabled", { exact: true }).check();
  await staff
    .getByRole("button", { name: "Update access", exact: true })
    .click();
  await expect(
    staff.getByText("operator · Disabled", { exact: true }),
  ).toBeVisible();
  await staff
    .getByLabel("Replacement password", { exact: true })
    .fill("replacement-native-staff-passphrase");
  await staff
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    staff.getByLabel("Replacement password", { exact: true }),
  ).toHaveValue("");
  const createClient = page.locator("details").filter({
    has: page.locator("summary").filter({ hasText: /^Create client$/ }),
  });
  await createClient.locator("summary").click();
  await createClient
    .getByLabel("Organisation", { exact: true })
    .fill(clientName);
  await createClient
    .getByLabel("Contact email", { exact: true })
    .fill("owner@test.invalid");
  await createClient
    .getByLabel("Client notes", { exact: true })
    .fill(
      "TEST ONLY: Unicode Ω 漢字 verified through native API, removed afterwards.",
    );
  await createClient
    .getByRole("button", { name: "Create client", exact: true })
    .click();
  await expect(
    page.locator("summary").filter({ hasText: clientName }),
  ).toBeVisible();
  const createProject = page.locator("details").filter({
    has: page.locator("summary").filter({ hasText: /^Create project$/ }),
  });
  await createProject.locator("summary").click();
  await createProject
    .getByLabel("Project client")
    .selectOption({ label: clientName });
  await createProject.getByLabel("Project title").fill(projectName);
  await createProject
    .getByLabel("Initial scope")
    .fill("TEST ONLY: private support setup and a documented handover.");
  await createProject
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page
      .getByLabel("Selected project")
      .locator("option")
      .filter({ hasText: projectName }),
  ).toHaveCount(1);
  await page
    .getByLabel("Selected project")
    .selectOption({ label: `${projectName} · draft` });
  const editor = page.locator("article").filter({
    has: page.getByRole("heading", { name: projectName, exact: true }),
  });
  await editor
    .getByRole("button", { name: "Add proposal", exact: true })
    .click();
  await editor.getByLabel("Price (GBP pence)", { exact: true }).fill("20000");
  await editor.getByLabel("Included revisions", { exact: true }).fill("1");
  await editor
    .getByLabel("Ownership, payment and service terms", { exact: true })
    .fill(
      "TEST TERMS: customer owns accounts; one revision; no ongoing hosting or unlimited support.",
    );
  await editor
    .getByRole("button", { name: "Add checklist item", exact: true })
    .nth(0)
    .click();
  await editor
    .getByLabel("Checklist item", { exact: true })
    .nth(0)
    .fill("Private support workflow");
  await editor
    .getByRole("button", { name: "Add checklist item", exact: true })
    .nth(1)
    .click();
  await editor
    .getByLabel("Checklist item", { exact: true })
    .nth(1)
    .fill("Unauthorised users cannot read private tickets");
  await editor.getByRole("button", { name: "Add task", exact: true }).click();
  await editor
    .getByLabel("Task title", { exact: true })
    .fill("Inspect permission configuration");
  await editor
    .getByLabel("Task notes", { exact: true })
    .fill("TEST ONLY, no Discord server is being changed.");
  await editor.getByLabel("Task complete", { exact: true }).check();
  async function save(version) {
    await editor
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      editor.getByText(new RegExp(`Saved version ${version} ·`)),
    ).toBeVisible();
  }
  await save(2);
  await editor
    .getByLabel("Approved by", { exact: true })
    .fill("Test client representative");
  await editor
    .getByLabel("Approval evidence", { exact: true })
    .fill(
      "SIMULATED approval for automated test only; no actual customer approval.",
    );
  await editor
    .getByRole("button", {
      name: "Record approval of saved proposal",
      exact: true,
    })
    .click();
  await expect(editor.getByText(/Saved version 3 ·/)).toBeVisible();
  await expect(
    editor
      .locator("label")
      .filter({ hasText: /^Scope/ })
      .locator("textarea"),
  ).toBeDisabled();
  await editor
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("active");
  await save(4);
  for (let i = 0; i < 2; i++) {
    await editor.getByLabel("Completed", { exact: true }).nth(i).check();
    await editor
      .locator("label")
      .filter({ hasText: /^Evidence/ })
      .locator("textarea")
      .nth(i)
      .fill(
        "TEST EVIDENCE: checked in local automated workflow; no live Discord claim.",
      );
  }
  await editor
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("ready_for_handover");
  await save(5);
  for (const label of [
    "Ownership confirmed",
    "Access transferred",
    "Documentation supplied",
    "Backup or recovery explained",
    "Support boundaries confirmed",
  ])
    await editor.getByLabel(label, { exact: true }).check();
  await editor
    .getByLabel("Maintenance scope", { exact: true })
    .fill("No recurring service. New work requires a separate agreed scope.");
  await editor
    .getByLabel("Handover notes", { exact: true })
    .fill("TEST handover record, not actual delivery to a paying customer.");
  await editor
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("delivered");
  await save(6);
  await expect(
    editor.getByRole("button", { name: "Save project", exact: true }),
  ).toBeDisabled();
  const downloadPromise = page.waitForEvent("download");
  await editor
    .getByRole("button", { name: "Export project JSON", exact: true })
    .click();
  const download = await downloadPromise;
  const exportPath = path.join(output, "native-project-export.json");
  await download.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  expect(exported.project.status).toBe("delivered");
  expect(exported.project.approval.approvedBy).toBe(
    "Test client representative",
  );
  await editor
    .getByRole("heading", { name: projectName, exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "native-delivery.png") });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map((v) => `${v.id}: ${v.description}`),
  ).toEqual([]);
  // Respect the real 100-request/minute API limit between the M2 and M3 suites.
  await new Promise((resolve) => setTimeout(resolve, 60000));
  // Exercise the actual native support UI against the disposable PostgreSQL API.
  // These are explicitly local test records; no Discord channel is created.
  const support = page.getByRole("region", {
    name: "Support workspace",
    exact: true,
  });
  await support.getByText("Create support workspace", { exact: true }).click();
  await support
    .getByLabel("Workspace name", { exact: true })
    .fill(`Native support ${suffix}`);
  await support
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    support.getByRole("heading", {
      name: `Native support ${suffix}`,
      exact: true,
    }),
  ).toBeVisible();
  await support.getByText("Open local ticket", { exact: true }).click();
  const description = `TEST ONLY native support ${suffix} Ω 漢字`;
  await support
    .getByLabel("New ticket description", { exact: true })
    .fill(description);
  await support
    .getByRole("button", { name: "Create local ticket", exact: true })
    .click();
  const ticket = support.locator("article").filter({
    has: page.getByRole("heading", { name: "Ticket #1", exact: true }),
  });
  await expect(ticket.getByText(description, { exact: true })).toBeVisible();
  await expect(ticket.getByText(/saved version 1$/)).toBeVisible();
  await ticket.locator('select[name="status"]').selectOption("in_progress");
  await ticket.locator('select[name="priority"]').selectOption("high");
  await ticket
    .getByRole("button", { name: "Save ticket changes", exact: true })
    .click();
  await expect(
    ticket.getByText(/in_progress · high · saved version 2$/),
  ).toBeVisible();
  await ticket
    .getByLabel("New customer-visible reply", { exact: true })
    .fill("TEST public reply from native support workflow.");
  await ticket
    .getByRole("button", { name: "Send public reply", exact: true })
    .click();
  await expect(ticket.getByText(/saved version 3$/)).toBeVisible();
  await expect(
    ticket.getByText("TEST public reply from native support workflow.", {
      exact: true,
    }),
  ).toBeVisible();
  await ticket
    .getByLabel("New internal staff note", { exact: true })
    .fill("TEST private staff note, never a public reply.");
  await ticket
    .getByRole("button", { name: "Save internal note", exact: true })
    .click();
  await expect(ticket.getByText(/saved version 4$/)).toBeVisible();
  await expect(
    ticket
      .getByRole("region", { name: "Customer-visible messages" })
      .getByText("TEST private staff note, never a public reply.", {
        exact: true,
      }),
  ).toHaveCount(0);
  await ticket
    .getByLabel("Ticket closure reason", { exact: true })
    .fill("TEST ONLY: local workflow verified, no live Discord claim.");
  await ticket
    .getByRole("button", { name: "Close ticket", exact: true })
    .click();
  await expect(
    ticket.getByText(/closed · high · saved version 5$/),
  ).toBeVisible();
  await expect(
    ticket.getByLabel("New customer-visible reply", { exact: true }),
  ).toHaveCount(0);
  const transcriptPromise = page.waitForEvent("download");
  await ticket
    .getByRole("button", {
      name: "Download ticket transcript JSON",
      exact: true,
    })
    .click();
  const transcriptDownload = await transcriptPromise;
  const transcriptPath = path.join(output, "native-support-transcript.json");
  await transcriptDownload.saveAs(transcriptPath);
  const transcript = JSON.parse(await readFile(transcriptPath, "utf8"));
  expect(transcript.ticket.status).toBe("closed");
  expect(transcript.ticket.description).toBe(description);
  expect(transcript.messages.map((m) => m.kind).sort()).toEqual([
    "note",
    "reply",
  ]);
  expect(transcript.events.some((e) => e.action === "ticket.closed")).toBe(
    true,
  );
  expect(Number.isNaN(Date.parse(transcript.exportedAt))).toBe(false);
  await ticket
    .getByRole("button", { name: "Reopen ticket", exact: true })
    .click();
  await expect(
    ticket.getByText(/reopened · high · saved version 6$/),
  ).toBeVisible();
  await ticket
    .getByRole("heading", { name: "Ticket #1", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "native-support.png") });
  const supportAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    supportAccessibility.violations.map((v) => `${v.id}: ${v.description}`),
  ).toEqual([]);
  const stored = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );
  expect(
    Object.keys(stored).every((k) =>
      ["kush.pollSeconds", "kush.endpoint"].includes(k),
    ),
  ).toBe(true);
  expect(JSON.stringify(stored)).not.toContain(process.env.KUSH_SMOKE_PASSWORD);
  await page.getByText("Change my password", { exact: true }).click();
  await page
    .getByLabel("Current password", { exact: true })
    .fill(process.env.KUSH_SMOKE_PASSWORD);
  await page
    .getByLabel("New password", { exact: true })
    .fill("native-changed-test-passphrase");
  await page
    .getByRole("button", { name: "Change password and sign out", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await login("native-changed-test-passphrase");
  // Expire this test user's sessions in PostgreSQL, then exercise real UI401 handling.
  const db = databaseClient(await configuration());
  await db.connect();
  try {
    await db.query(
      "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
      [process.env.KUSH_SMOKE_USER_ID],
    );
  } finally {
    await db.end();
  }
  await page
    .getByRole("button", { name: "Refresh activity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Clients and delivery", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Check interval")).toHaveValue("30");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Local API endpoint")
    .selectOption("http://localhost:4310");
  await expect(health).toHaveText("API reachable");
  await page.reload();
  await expect(page.getByLabel("Local API endpoint")).toHaveValue(
    "http://localhost:4310",
  );
  await expect(health).toHaveText("API reachable");
  await page.screenshot({
    path: path.join(output, "native-signed-out.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS native: real window state, profile and staff creation, client/proposal/approval/deliverables/handover/export, local support ticket create/read/update/reply/private-note/close/transcript/reopen, accessibility, expired session auto-signout, configuration persistence.",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
} catch (error) {
  if (inspectedPage) {
    await inspectedPage
      .screenshot({
        path: path.join(output, "native-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    await writeFile(
      path.join(output, "native-failure.html"),
      await inspectedPage.content(),
    );
  }
  throw new Error(error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (native.exitCode === null) native.kill();
}
