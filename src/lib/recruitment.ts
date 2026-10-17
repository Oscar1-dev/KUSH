// Shapes returned by the API's recruitment routes, and display labels.

export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "more_info"
  | "interview"
  | "conditionally_accepted"
  | "nda_issued"
  | "nda_signed"
  | "approved"
  | "activated"
  | "rejected"
  | "withdrawn";

export interface Position {
  key: string;
  title: string;
  summary: string;
  responsibilities: string;
  requirements: string;
  staffRole: string;
  portfolioRequired: boolean;
}

export interface Application {
  id: string;
  number: number;
  status: ApplicationStatus;
  preferredName: string;
  email: string;
  experience: string;
  skills: string;
  availability: string;
  motivation: string;
  portfolioUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  discordChannelId: string | null;
  positionTitle: string;
  positionKey: string;
}

export const applicationLabel: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  reviewing: "Under review",
  more_info: "More information needed",
  interview: "Interview",
  conditionally_accepted: "Conditionally accepted",
  nda_issued: "NDA to sign",
  nda_signed: "NDA signed",
  approved: "Approved",
  activated: "Welcome aboard",
  rejected: "Not successful",
  withdrawn: "Withdrawn",
};

/** The onboarding journey as applicants see it. */
export const applicationStages: { status: ApplicationStatus; label: string; text: string }[] = [
  { status: "submitted", label: "Application submitted", text: "We have your application." },
  { status: "reviewing", label: "Review", text: "The team is reading your application." },
  { status: "conditionally_accepted", label: "Conditional acceptance", text: "Subject to signing the NDA." },
  { status: "nda_issued", label: "Sign the NDA", text: "Read and sign the staff NDA." },
  { status: "nda_signed", label: "NDA signed", text: "The team confirms your identity and role." },
  { status: "approved", label: "Role approved", text: "Your access is being set up." },
  { status: "activated", label: "Staff access", text: "Your Discord staff role is active." },
];

/** Where a status sits on the journey (side-steps map onto review). */
export function stageIndex(status: ApplicationStatus) {
  const mapped = status === "more_info" || status === "interview" ? "reviewing" : status;
  return applicationStages.findIndex((s) => s.status === mapped);
}

export const actionNeeded = (status: ApplicationStatus) => status === "more_info" || status === "nda_issued";
