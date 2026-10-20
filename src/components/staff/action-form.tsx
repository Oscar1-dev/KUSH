"use client";

import { useActionState } from "react";

import type { ActionState } from "@/app/account/actions";
import {
  staffAssignCommission,
  staffAssignTicket,
  staffClaim,
  staffCommissionUpdate,
  staffMessage,
  staffTicketStatus,
  staffApplicationStatus,
  staffApplicationMessage,
  staffApplicationNote,
  staffIssueNda,
  staffApproveApplication,
  staffActivateApplication,
  staffTemplateStatus,
  staffRetryJob,
  staffProposeQuote,
  staffWithdrawQuote,
  staffAddMilestone,
  staffSetMilestone,
  staffHideVouch,
  staffOffboard,
  staffOfflinePayment,
  staffRefund,
  staffSaveProduct,
  staffSaveOffer,
  staffReviewReferral,
  staffRedeemReward,
  staffAdjustCredit,
  staffRoleChange,
  staffTicketPriority,
} from "@/app/staff/actions";
import { FormMessage } from "@/components/account/form-message";
import styles from "@/components/account/account.module.css";

const actions = {
  message: staffMessage,
  status: staffTicketStatus,
  claim: staffClaim,
  assignTicket: staffAssignTicket,
  commission: staffCommissionUpdate,
  assignCommission: staffAssignCommission,
  applicationStatus: staffApplicationStatus,
  applicationMessage: staffApplicationMessage,
  applicationNote: staffApplicationNote,
  issueNda: staffIssueNda,
  approveApplication: staffApproveApplication,
  activateApplication: staffActivateApplication,
  templateStatus: staffTemplateStatus,
  retryJob: staffRetryJob,
  proposeQuote: staffProposeQuote,
  withdrawQuote: staffWithdrawQuote,
  addMilestone: staffAddMilestone,
  setMilestone: staffSetMilestone,
  hideVouch: staffHideVouch,
  offboard: staffOffboard,
  offlinePayment: staffOfflinePayment,
  refund: staffRefund,
  saveProduct: staffSaveProduct,
  saveOffer: staffSaveOffer,
  reviewReferral: staffReviewReferral,
  redeemReward: staffRedeemReward,
  adjustCredit: staffAdjustCredit,
  roleChange: staffRoleChange,
  priority: staffTicketPriority,
};

/**
 * A staff form bound to one server action. Hidden fields carry IDs and the
 * record version; the parent remounts it (via `key`) when the record changes.
 */
export default function ActionForm({
  action,
  hidden,
  submit,
  tone = "primary",
  children,
}: {
  action: keyof typeof actions;
  hidden: Record<string, string | number>;
  submit: string;
  tone?: "primary" | "plain" | "danger";
  children?: React.ReactNode;
}) {
  const [state, run, pending] = useActionState<ActionState, FormData>(actions[action], {});
  const toneClass = tone === "primary" ? styles.buttonPrimary : tone === "danger" ? styles.buttonDanger : "";
  return (
    <form action={run} className={styles.form} style={{ maxWidth: "none" }}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className={styles.formRow}>
        <button className={`${styles.button} ${toneClass}`} disabled={pending}>
          {pending ? "WORKING…" : submit}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
