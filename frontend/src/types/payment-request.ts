/** Finance's second-stage view of a Canaan Chat payment note a colleague has
 * already made a peer-level decision on.
 *   paymentStatus "rejected"  -> the peer rejected it in chat, terminal;
 *                                 shown here for visibility only
 *   paymentStatus "approved", financeStatus NULL       -> awaiting an
 *                                 Accounts/Admin decision (Pending)
 *   paymentStatus "approved", financeStatus "approved" -> authorized, money
 *                                 not yet disbursed (Unpaid)
 *   paymentStatus "approved", financeStatus "paid"     -> actually disbursed,
 *                                 terminal (only reachable from "approved" via
 *                                 a separate Mark as Paid)
 *   paymentStatus "approved", financeStatus "rejected" -> finance overrode
 *                                 the peer approval, terminal
 */
export type PaymentRequest = {
  id: number;
  conversationId: number;
  amount: string;
  description: string;
  askedById: number | null;
  askedByName: string | null;
  askedAt: string | null;
  /** The peer's chat-level decision. A "rejected" note is terminal and never
   * reaches finance — approvedById/approvedByName/approvedAt below is
   * whoever made THIS decision either way, not necessarily an approval. */
  paymentStatus: "approved" | "rejected";
  approvedById: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  financeStatus: "approved" | "paid" | "rejected" | null;
  financeDecidedById: number | null;
  financeDecidedByName: string | null;
  financeDecidedAt: string | null;
  /** Set only once "Mark as Paid" is used — a separate, later action from
   * "Approve for Payment", often performed by a different person. */
  paidById: number | null;
  paidByName: string | null;
  paidAt: string | null;
  /** True once a proof-of-payment photo has been attached via Mark as Paid. */
  hasProof: boolean;
};
