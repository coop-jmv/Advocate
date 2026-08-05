export type CaseStage =
  | "Pending"
  | "Hearing"
  | "Reserved"
  | "Disposed"
  | "Appeal";

export type Matter = {
  id: string;
  cnr: string;
  title: string;
  client: string;
  court: string;
  stage: CaseStage;
  nextHearing: string;
  practice: string;
  opposing: string;
};

export const matters: Matter[] = [
  {
    id: "AC-1042",
    cnr: "DLCT01-004512-2026",
    title: "Rakesh Malhotra v. Sunrise Developers Pvt. Ltd.",
    client: "Rakesh Malhotra",
    court: "Delhi High Court",
    stage: "Hearing",
    nextHearing: "06 Aug 2026",
    practice: "Civil — Specific Performance",
    opposing: "Adv. S. Venkatesh",
  },
  {
    id: "AC-1039",
    cnr: "MHPU02-118820-2025",
    title: "State of Maharashtra v. Imran Sheikh",
    client: "Imran Sheikh",
    court: "Sessions Court, Pune",
    stage: "Pending",
    nextHearing: "11 Aug 2026",
    practice: "Criminal — Bail Application",
    opposing: "Public Prosecutor",
  },
  {
    id: "AC-1031",
    cnr: "KABG05-009134-2025",
    title: "Nandini Enterprises v. Commissioner of GST",
    client: "Nandini Enterprises",
    court: "Karnataka High Court",
    stage: "Reserved",
    nextHearing: "19 Aug 2026",
    practice: "Tax — Writ Petition",
    opposing: "Standing Counsel (Revenue)",
  },
  {
    id: "AC-1024",
    cnr: "TNCH03-071265-2025",
    title: "Lakshmi Iyer v. Coastal Insurance Co.",
    client: "Lakshmi Iyer",
    court: "Consumer Forum, Chennai",
    stage: "Hearing",
    nextHearing: "07 Aug 2026",
    practice: "Consumer — Claim Repudiation",
    opposing: "Adv. Meera Raghavan",
  },
  {
    id: "AC-1017",
    cnr: "UPLK07-045901-2024",
    title: "Rameshwar Yadav v. Gram Panchayat Barabanki",
    client: "Rameshwar Yadav",
    court: "District Court, Lucknow",
    stage: "Appeal",
    nextHearing: "28 Aug 2026",
    practice: "Land & Revenue",
    opposing: "Adv. K. P. Tiwari",
  },
  {
    id: "AC-1009",
    cnr: "WBKO04-023388-2024",
    title: "Aparna Ghosh v. Subir Ghosh",
    client: "Aparna Ghosh",
    court: "Family Court, Kolkata",
    stage: "Disposed",
    nextHearing: "—",
    practice: "Matrimonial — Maintenance",
    opposing: "Adv. D. Chatterjee",
  },
];

export type Hearing = {
  id: string;
  time: string;
  court: string;
  matter: string;
  item: string;
  purpose: string;
  status: "Confirmed" | "Cause list awaited" | "Adjourned";
};

export const todaysDiary: Hearing[] = [
  {
    id: "H-1",
    time: "10:30",
    court: "Delhi HC — Court 12",
    matter: "Malhotra v. Sunrise Developers",
    item: "Item 14",
    purpose: "Arguments on interim injunction",
    status: "Confirmed",
  },
  {
    id: "H-2",
    time: "11:45",
    court: "Consumer Forum, Chennai",
    matter: "Iyer v. Coastal Insurance",
    item: "Item 3",
    purpose: "Evidence of complainant",
    status: "Cause list awaited",
  },
  {
    id: "H-3",
    time: "14:15",
    court: "Sessions Court, Pune",
    matter: "State v. Imran Sheikh",
    item: "Item 27",
    purpose: "Bail application — reply",
    status: "Adjourned",
  },
];

export type DocumentRow = {
  id: string;
  name: string;
  matter: string;
  kind: string;
  language: string;
  ocr: "Indexed" | "Processing" | "Redacted";
  size: string;
  updated: string;
};

export const documents: DocumentRow[] = [
  {
    id: "D-9021",
    name: "Vakalatnama — Malhotra.pdf",
    matter: "AC-1042",
    kind: "Vakalatnama",
    language: "English",
    ocr: "Indexed",
    size: "1.2 MB",
    updated: "2 hours ago",
  },
  {
    id: "D-9016",
    name: "FIR Copy 214-2025.pdf",
    matter: "AC-1039",
    kind: "FIR",
    language: "Hindi",
    ocr: "Indexed",
    size: "4.6 MB",
    updated: "Yesterday",
  },
  {
    id: "D-9012",
    name: "GST Show Cause Notice.pdf",
    matter: "AC-1031",
    kind: "Notice",
    language: "English",
    ocr: "Processing",
    size: "820 KB",
    updated: "Yesterday",
  },
  {
    id: "D-9004",
    name: "Policy Bond — Coastal.jpg",
    matter: "AC-1024",
    kind: "Evidence",
    language: "Tamil",
    ocr: "Indexed",
    size: "3.1 MB",
    updated: "3 days ago",
  },
  {
    id: "D-8998",
    name: "Settlement Draft (client copy).docx",
    matter: "AC-1009",
    kind: "Draft",
    language: "English",
    ocr: "Redacted",
    size: "96 KB",
    updated: "1 week ago",
  },
];

export type Client = {
  id: string;
  name: string;
  city: string;
  matters: number;
  outstanding: string;
  portal: "Active" | "Invited" | "Not invited";
  conflict: "Clear" | "Review";
};

export const clients: Client[] = [
  { id: "C-311", name: "Rakesh Malhotra", city: "New Delhi", matters: 2, outstanding: "₹84,000", portal: "Active", conflict: "Clear" },
  { id: "C-308", name: "Nandini Enterprises", city: "Bengaluru", matters: 3, outstanding: "₹2,15,500", portal: "Active", conflict: "Review" },
  { id: "C-297", name: "Imran Sheikh", city: "Pune", matters: 1, outstanding: "₹12,000", portal: "Invited", conflict: "Clear" },
  { id: "C-284", name: "Lakshmi Iyer", city: "Chennai", matters: 1, outstanding: "₹0", portal: "Active", conflict: "Clear" },
  { id: "C-266", name: "Rameshwar Yadav", city: "Lucknow", matters: 2, outstanding: "₹38,400", portal: "Not invited", conflict: "Clear" },
];

export type Invoice = {
  id: string;
  client: string;
  matter: string;
  amount: string;
  gst: string;
  status: "Paid" | "Sent" | "Draft" | "Overdue";
  due: string;
};

export const invoices: Invoice[] = [
  { id: "INV-2026-118", client: "Nandini Enterprises", matter: "AC-1031", amount: "₹1,80,000", gst: "18% IGST", status: "Sent", due: "18 Aug 2026" },
  { id: "INV-2026-117", client: "Rakesh Malhotra", matter: "AC-1042", amount: "₹71,200", gst: "18% CGST+SGST", status: "Overdue", due: "27 Jul 2026" },
  { id: "INV-2026-115", client: "Lakshmi Iyer", matter: "AC-1024", amount: "₹45,000", gst: "18% CGST+SGST", status: "Paid", due: "10 Jul 2026" },
  { id: "INV-2026-114", client: "Rameshwar Yadav", matter: "AC-1017", amount: "₹32,500", gst: "Exempt", status: "Draft", due: "—" },
];

export const timeEntries = [
  { id: "T-4412", matter: "AC-1042", task: "Drafting rejoinder", hours: "2.5", rate: "₹6,000", value: "₹15,000", date: "04 Aug" },
  { id: "T-4409", matter: "AC-1031", task: "Conference with client", hours: "1.0", rate: "₹6,000", value: "₹6,000", date: "03 Aug" },
  { id: "T-4405", matter: "AC-1039", task: "Court appearance — bail", hours: "3.0", rate: "₹5,000", value: "₹15,000", date: "02 Aug" },
  { id: "T-4401", matter: "AC-1024", task: "Reviewing policy documents", hours: "1.5", rate: "₹4,500", value: "₹6,750", date: "01 Aug" },
];

export const weeklyLoad = [
  { day: "Mon", hearings: 3, billed: 6 },
  { day: "Tue", hearings: 5, billed: 7.5 },
  { day: "Wed", hearings: 2, billed: 4 },
  { day: "Thu", hearings: 4, billed: 6.5 },
  { day: "Fri", hearings: 6, billed: 8 },
  { day: "Sat", hearings: 1, billed: 2 },
];

export const limitationAlerts = [
  { matter: "AC-1017", note: "Appeal limitation expires in 6 days", severity: "high" as const },
  { matter: "AC-1031", note: "Written submissions due 12 Aug", severity: "medium" as const },
  { matter: "AC-1042", note: "Process fee payment pending", severity: "low" as const },
];
