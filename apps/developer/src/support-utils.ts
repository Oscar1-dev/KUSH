export function supportPath(tenantId: string, suffix = ""): string {
  return `/support/tenants/${encodeURIComponent(tenantId)}${suffix}`;
}
export function ticketQuery(filters: {
  search: string;
  status: string;
  priority: string;
  assignedTo: string;
}): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.assignedTo) params.set("assignedUserId", filters.assignedTo);
  return params.size ? `?${params.toString()}` : "";
}
export function exportSupportJson(value: unknown, name: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
